import {
    EventEmitter,
    NotebookCell,
    NotebookCellKind,
    NotebookCellsChangeEvent,
    QuickInputButtons,
    TextDocument,
    window
} from 'vscode';
import { commands, notebook, NotebookDocument, ThemeIcon, Uri, workspace, WorkspaceEdit } from 'vscode';
import { getFromCache, updateCache } from '../cache';
import { GlobalMementoKeys } from '../constants';
import { getClusterSchema } from '../kusto/schemas';
import { Connection } from '../types';
import { debug, logError, registerDisposable } from '../utils';
import { create, InputFlowAction, MultiStepInput } from './multiStepInput';
import { isJupyterNotebook, isKustoNotebook } from './provider';

const onDidChangeConnection = new EventEmitter<NotebookDocument | TextDocument>();
const onDidChangeCluster = new EventEmitter<{ clusterUri: string; change: 'added' | 'removed' }>();

export function registerNotebookConnection() {
    registerDisposable(onDidChangeConnection);
    registerDisposable(commands.registerCommand('kusto.changeNotebookDatabase', changeDocumentConnection));
    registerDisposable(notebook.onDidChangeNotebookCells(onDidChangeJupyterNotebookCells));
    registerDisposable(workspace.onDidChangeTextDocument((e) => onDidChangeJupyterNotebookCell(e.document)));
}
export function addNotebookConnectionHandler(cb: (document: NotebookDocument | TextDocument) => void) {
    registerDisposable(onDidChangeConnection.event(cb));
}
export function addClusterAddedHandler(cb: (change: { clusterUri: string; change: 'added' | 'removed' }) => void) {
    registerDisposable(onDidChangeCluster.event(cb));
}
export async function ensureNotebookHasClusterDbInfo(document: NotebookDocument | TextDocument) {
    if ('viewType' in document) {
        await ensureNotebookHasClusterDbInfoInternal(document, false);
    } else {
        await ensureDocumentHasClusterDbInfoInternal(document, true);
    }
}
async function ensureNotebookHasClusterDbInfoInternal(document: NotebookDocument, changeExistingValue = false) {
    const currentInfo = getClusterAndDbFromDocumentMetadata(document);
    if (!changeExistingValue && currentInfo.cluster && currentInfo.database) {
        return;
    }
    if (!isKustoNotebook(document)) {
        return;
    }
    const info = await captureClusterAndDatabaseFromUser(getClusterAndDbFromDocumentMetadata(document));
    if (!info) {
        return;
    }
    if (info.cluster === currentInfo.cluster && info.database === currentInfo.database) {
        return;
    }
    await updateClusterDbInNotebook(document, info);
}
async function ensureDocumentHasClusterDbInfoInternal(document: TextDocument, changeExistingValue = false) {
    const currentInfo: Connection | undefined = getFromCache(document.uri.fsPath.toLowerCase());
    if (!changeExistingValue && currentInfo) {
        return;
    }
    const info = await captureClusterAndDatabaseFromUser(currentInfo || {});
    if (!info) {
        return;
    }
    if (info.cluster === currentInfo?.cluster && info.database === currentInfo?.database) {
        return;
    }
    await updateCache(document.uri.fsPath.toLowerCase(), info);
    onDidChangeConnection.fire(document);
}
async function changeDocumentConnection(uri?: Uri) {
    uri = uri || window.activeNotebookEditor?.document.uri || window.activeTextEditor?.document.uri;
    if (!uri) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const document = notebook.notebookDocuments.find((item) => item.uri.toString() === uri!.toString());
    if (document) {
        return ensureNotebookHasClusterDbInfoInternal(document, true);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const textDocument = workspace.textDocuments.find((item) => item.uri.toString() === uri!.toString());
    if (textDocument) {
        ensureDocumentHasClusterDbInfoInternal(textDocument, true);
    }
}
function onDidChangeJupyterNotebookCells(e: NotebookCellsChangeEvent) {
    if (!isJupyterNotebook(e.document)) {
        return;
    }
    if (e.changes.some((item) => getJupyterCellWithConnectionInfo(item.items))) {
        // Ok we know the cell containing the connection string changed.
        getClusterAndDbFromJupyterNotebook(e.document);
        triggerJupyterConnectionChanged(e.document);
    }
}
function onDidChangeJupyterNotebookCell(textDocument: TextDocument) {
    if (!textDocument.notebook || !isJupyterNotebook(textDocument.notebook)) {
        return;
    }
    if (textDocumentHasJupyterConnectionInfo(textDocument)) {
        // Ok we know the cell containing the connection string changed.
        getClusterAndDbFromJupyterNotebook(textDocument.notebook);
        triggerJupyterConnectionChanged(textDocument.notebook);
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const triggerTimeouts = new WeakMap<NotebookDocument, any>();
function triggerJupyterConnectionChanged(notebook: NotebookDocument) {
    let timeout = triggerTimeouts.get(notebook);
    if (timeout) {
        clearTimeout(timeout);
    }
    // Trigger a change after 0.5s, possible user is still typing in the cell.
    timeout = setTimeout(() => onDidChangeConnection.fire(notebook), 500);
}
async function captureClusterAndDatabaseFromUser(connection: Partial<Connection> = {}) {
    const state = {
        connection: JSON.parse(JSON.stringify(connection)),
        dismissed: false
    };
    const multiStep = create<typeof state>();
    await multiStep.run(selectClusterUri, state);
    if (state.dismissed) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { cluster: state.connection.cluster!, database: state.connection.database! };
}
export function getClusterAndDbFromDocumentMetadata(document: NotebookDocument | TextDocument): Partial<Connection> {
    if ('viewType' in document) {
        if (isJupyterNotebook(document)) {
            return getClusterAndDbFromJupyterNotebook(document);
        }
        const cluster: string | undefined = document.metadata.custom.cluster;
        const database: string | undefined = document.metadata.custom.database;
        return {
            cluster,
            database
        };
    } else {
        // TextDocument.
        return getFromCache(document.uri.fsPath.toLowerCase()) || {};
    }
}
const kqlMagicConnectionStringStartDelimiter = 'AzureDataExplorer://'.toLowerCase();
function textDocumentHasJupyterConnectionInfo(textDocument: TextDocument) {
    return (
        textDocument.lineAt(0).text.startsWith('%kql') &&
        textDocument.lineAt(0).text.toLowerCase().includes(kqlMagicConnectionStringStartDelimiter)
    );
}
function getJupyterCellWithConnectionInfo(cells: readonly NotebookCell[]) {
    return cells
        .filter((item) => item.kind === NotebookCellKind.Code)
        .find((item) => textDocumentHasJupyterConnectionInfo(item.document));
}
const jupyterNotebookClusterAndDb = new WeakMap<NotebookDocument, { cluster?: string; database?: string }>();
/**
 * This assumes you are always working with Microsoft AZ Authentication.
 * kql supports non AZ `tenant`, but this extension currently does not.
 */
function getClusterAndDbFromJupyterNotebook(document: NotebookDocument): { cluster?: string; database?: string } {
    // %kql azureDataExplorer://code;cluster='help';database='Samples'
    if (!isJupyterNotebook(document)) {
        return {};
    }
    const cell = getJupyterCellWithConnectionInfo(document.cells);

    if (!cell) {
        return {};
    }
    const text = cell.document
        .lineAt(0)
        .text.substring(
            cell.document.lineAt(0).text.indexOf(kqlMagicConnectionStringStartDelimiter) +
                kqlMagicConnectionStringStartDelimiter.length
        )
        .toLowerCase();
    const delimiter = text.includes("'") ? "'" : '"';
    // 'help';database='Samples'
    const parts = text.replace(/\s+/g, '').split(delimiter);
    try {
        const clusterIndex = parts.findIndex((item) => item.endsWith('cluster='));
        const databaseIndex = parts.findIndex((item) => item.endsWith('database='));
        const cluster = `https://${parts[clusterIndex + 1]}.kusto.windows.net`;
        const database = parts[databaseIndex + 1];
        debug(`Parsed ${text} & got ${cluster} & ${database}`);
        jupyterNotebookClusterAndDb.set(document, { cluster, database });
        return { cluster, database };
    } catch (ex) {
        logError(`Failed to parse ${text} to get cluster & db`, ex);
        return {};
    }
}
async function updateClusterDbInNotebook(document: NotebookDocument, info: Connection) {
    if (!document.metadata.editable || isJupyterNotebook(document) || !isKustoNotebook(document)) {
        return;
    }
    const edit = new WorkspaceEdit();
    const custom = JSON.parse(JSON.stringify(document.metadata.custom)) || {};
    custom.cluster = info.cluster;
    custom.database = info.database;
    const newMetadata = document.metadata.with({ custom });
    edit.replaceNotebookMetadata(document.uri, newMetadata);
    await workspace.applyEdit(edit);
    onDidChangeConnection.fire(document);
}
async function selectClusterUri(
    multiStepInput: MultiStepInput<{
        connection: Partial<Connection>;
        dismissed: boolean;
    }>,
    state: {
        connection: Partial<Connection>;
        dismissed: boolean;
    }
) {
    const clusters: string[] = getFromCache<string[]>(GlobalMementoKeys.clusterUris) || [];
    if (clusters.length === 0) {
        return addClusterUriAndSelectDb(multiStepInput, state);
    }
    const quickPickItems = clusters.map((cluster) => ({ label: cluster }));
    const selection = await multiStepInput.showQuickPick({
        title: 'Select a cluster',
        matchOnDescription: true,
        matchOnDetail: true,
        canGoBack: false,
        items: quickPickItems,
        buttons: [
            {
                iconPath: new ThemeIcon('add'),
                tooltip: 'Add Cluster'
            }
        ],
        placeholder: ''
    });

    if ('iconPath' in selection) {
        // Add a new cluster.
        return addClusterUriAndSelectDb(multiStepInput, state);
    } else if ('label' in selection) {
        state.connection.cluster = selection.label;
        return selectDatabase(multiStepInput, state);
    } else {
        state.dismissed = true;
    }
}
async function addClusterUriAndSelectDb(
    multiStepInput: MultiStepInput<{
        connection: Partial<Connection>;
        dismissed: boolean;
    }>,
    state: {
        connection: Partial<Connection>;
        dismissed: boolean;
    }
) {
    const clusterUri = state.connection.cluster || 'https://help.kusto.windows.net';
    const clusters: string[] = getFromCache<string[]>(GlobalMementoKeys.clusterUris) || [];
    const value = await multiStepInput
        .showInputBox({
            prompt: '',
            title: 'Enter Cluster Uri',
            value: clusterUri,
            buttons: clusters.length ? [QuickInputButtons.Back] : [],
            // This might be a bad idea (validating as the user types).
            validate: validateClusterConnection
        })
        .catch((ex) => {
            if (ex === InputFlowAction.back) {
                return QuickInputButtons.Back;
            }
            throw ex;
        });
    if (!value && clusters.length) {
        return selectClusterUri(multiStepInput, state);
    }
    if (value === QuickInputButtons.Back) {
        return selectClusterUri(multiStepInput, state);
    }
    if (typeof value === 'string') {
        state.connection.cluster = value;
        await updateCachedClusters(state.connection.cluster);
        return selectDatabase(multiStepInput, state);
    }
    state.dismissed = true;
}
export async function addClusterUri() {
    const clusterUri = 'https://help.kusto.windows.net';
    const value = await window.showInputBox({
        prompt: '',
        title: 'Enter Cluster Uri',
        value: clusterUri,
        // This might be a bad idea (validating as the user types).
        validateInput: validateClusterConnection
    });
    if (value && value.length) {
        await updateCachedClusters(value);
    }
}
async function selectDatabase(
    multiStepInput: MultiStepInput<{
        connection: Partial<Connection>;
        dismissed: boolean;
    }>,
    state: {
        connection: Partial<Connection>;
        dismissed: boolean;
    }
) {
    const schema = await getClusterSchema(state.connection.cluster || '');
    const quickPickItems = schema.cluster.databases.map((db) => ({ label: db.name }));
    const selection = await multiStepInput
        .showQuickPick({
            title: 'Select a database',
            matchOnDescription: true,
            matchOnDetail: true,
            canGoBack: true,
            items: quickPickItems,
            buttons: [QuickInputButtons.Back],
            placeholder: ''
        })
        .catch((ex) => {
            if (ex === InputFlowAction.back) {
                return QuickInputButtons.Back;
            }
            throw ex;
        });
    if (!selection) {
        state.dismissed = true;
    } else if (selection === QuickInputButtons.Back) {
        return selectClusterUri(multiStepInput, state);
    } else if ('label' in selection) {
        state.connection.database = selection.label;
    }
}

async function validateClusterConnection(clusterUri = ''): Promise<string | undefined> {
    const clusters: string[] = getFromCache<string[]>(GlobalMementoKeys.clusterUris) || [];
    if (clusterUri.length === 0) {
        return 'Cluster Uri cannot be empty';
    }
    if (clusters.find((item) => item === clusterUri)) {
        return 'Entered cluster uri already exists';
    }
    try {
        await getClusterSchema(clusterUri);
    } catch (ex) {
        logError(`Cluster Uri is incorrect or unable to authenticate ${clusterUri}`, ex);
        return 'Cluster Uri is incorrect or authentication failed';
    }
}

async function updateCachedClusters(clusterUri: string) {
    const clusters: string[] = getFromCache<string[]>(GlobalMementoKeys.clusterUris) || [];
    const items = new Set<string>(clusters);
    items.add(clusterUri);
    await updateCache(GlobalMementoKeys.clusterUris, Array.from(items));
    onDidChangeCluster.fire({ clusterUri, change: 'added' });
}

export async function removeCachedCluster(clusterUri: string) {
    let clusters: string[] = getFromCache<string[]>(GlobalMementoKeys.clusterUris) || [];
    clusters = clusters.filter((item) => item.toLowerCase() !== clusterUri.toLowerCase());
    await updateCache(GlobalMementoKeys.clusterUris, clusters);
    onDidChangeCluster.fire({ clusterUri, change: 'removed' });
}
