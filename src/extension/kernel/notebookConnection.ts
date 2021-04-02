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
import { debug, logError, registerDisposable } from '../utils';
import { create, InputFlowAction, MultiStepInput } from './multiStepInput';
import { isJupyterNotebook, isKustoNotebook } from './provider';

const onDidChangeConnection = new EventEmitter<NotebookDocument>();
const onDidAddCluster = new EventEmitter<string>();

export function registerNotebookConnection() {
    registerDisposable(onDidChangeConnection);
    registerDisposable(commands.registerCommand('kusto.changeNotebookDatabase', onChangeNotebookDatabase));
    registerDisposable(notebook.onDidChangeNotebookCells(onDidChangeJupyterNotebookCells));
    registerDisposable(workspace.onDidChangeTextDocument((e) => onDidChangeJupyterNotebookCell(e.document)));
}
export function addDocumentConnectionHandler(cb: (document: NotebookDocument) => void) {
    registerDisposable(onDidChangeConnection.event(cb));
}
export function addClusterAddedHandler(cb: (clusterUri: string) => void) {
    registerDisposable(onDidAddCluster.event(cb));
}
export async function ensureNotebookHasClusterDbInfo(document: NotebookDocument) {
    await ensureNotebookHasClusterDbInfoInternal(document, false);
}
async function ensureNotebookHasClusterDbInfoInternal(document: NotebookDocument, changeExistingValue = false) {
    const currentInfo = getClusterAndDbFromDocumentMetadata(document);
    if (!changeExistingValue && currentInfo.cluster && currentInfo.database) {
        return;
    }
    if (!isKustoNotebook(document)) {
        return;
    }
    const info = await captureClusterAndDatabaseFromUser(document);
    if (!info) {
        return;
    }
    if (info.cluster === currentInfo.cluster && info.database === currentInfo.database) {
        return;
    }
    await updateClusterDbInNotebook(document, info);
}
async function onChangeNotebookDatabase(uri?: Uri) {
    uri = uri || window.activeNotebookEditor?.document.uri;
    if (!uri) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const document = notebook.notebookDocuments.find((item) => item.uri.toString() === uri!.toString());
    if (!document) {
        return;
    }
    ensureNotebookHasClusterDbInfoInternal(document, true);
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
async function captureClusterAndDatabaseFromUser(document: NotebookDocument) {
    const info = getClusterAndDbFromDocumentMetadata(document);
    const state = {
        cluster: info.cluster,
        database: info.database,
        dismissed: false
    };
    const multiStep = create<typeof state>();
    await multiStep.run(selectClusterUri, state);
    if (state.dismissed) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { cluster: state.cluster!, database: state.database! };
}
export function getClusterAndDbFromDocumentMetadata(
    document: NotebookDocument
): { cluster?: string; database?: string } {
    if (isJupyterNotebook(document)) {
        return getClusterAndDbFromJupyterNotebook(document);
    }
    const cluster: string | undefined = document.metadata.custom.cluster;
    const database: string | undefined = document.metadata.custom.database;
    return {
        cluster,
        database
    };
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
async function updateClusterDbInNotebook(document: NotebookDocument, info: { cluster: string; database: string }) {
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
        cluster: string | undefined;
        database: string | undefined;
        dismissed: boolean;
    }>,
    state: {
        cluster: string | undefined;
        database: string | undefined;
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
        state.cluster = selection.label;
        return selectDatabase(multiStepInput, state);
    } else {
        state.dismissed = true;
    }
}
async function addClusterUriAndSelectDb(
    multiStepInput: MultiStepInput<{
        cluster: string | undefined;
        database: string | undefined;
        dismissed: boolean;
    }>,
    state: {
        cluster: string | undefined;
        database: string | undefined;
        dismissed: boolean;
    }
) {
    const clusterUri = state.cluster || 'https://help.kusto.windows.net';
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
        state.cluster = value;
        await updateCachedClusters(state.cluster);
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
        cluster: string | undefined;
        database: string | undefined;
        dismissed: boolean;
    }>,
    state: {
        cluster: string | undefined;
        database: string | undefined;
        dismissed: boolean;
    }
) {
    const schema = await getClusterSchema(state.cluster || '');
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
        state.database = selection.label;
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
    onDidAddCluster.fire(clusterUri);
}
