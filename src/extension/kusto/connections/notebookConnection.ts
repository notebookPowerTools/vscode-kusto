import { EventEmitter, NotebookCell, NotebookCellKind, NotebookCellsChangeEvent, TextDocument, window } from 'vscode';
import { commands, notebooks, NotebookDocument, Uri, workspace, WorkspaceEdit } from 'vscode';
import { IConnectionInfo } from './types';
import { debug, logError, registerDisposable } from '../../utils';
import { isJupyterNotebook, isKustoNotebook } from '../../kernel/provider';
import { isEqual } from 'lodash';
import { captureConnectionFromUser } from './management';
import { AzureAuthenticatedConnection } from './azAuth';
import { getFromCache, updateCache } from '../../cache';
import { getConnectionFromNotebookMetadata, updateMetadataWithConnectionInfo } from '../../content/provider';
import { GlobalMementoKeys } from '../../constants';

const onDidChangeConnection = new EventEmitter<NotebookDocument | TextDocument>();

export function registerNotebookConnection() {
    registerDisposable(onDidChangeConnection);
    registerDisposable(commands.registerCommand('kusto.changeDocumentConnection', changDocumentConnection));
    registerDisposable(notebooks.onDidChangeNotebookCells(onDidChangeJupyterNotebookCells));
    registerDisposable(workspace.onDidChangeTextDocument((e) => onDidChangeJupyterNotebookCell(e.document)));
}
export function addDocumentConnectionHandler(cb: (document: NotebookDocument | TextDocument) => void) {
    registerDisposable(onDidChangeConnection.event(cb));
}
export async function ensureDocumentHasConnectionInfo(
    document: NotebookDocument | TextDocument
): Promise<IConnectionInfo | undefined> {
    if ('notebookType' in document) {
        return ensureNotebookHasConnectionInfoInternal(document, false);
    } else {
        return ensureDocumentHasConnectionInfoInternal(document, false);
    }
}
export function isConnectionValidForKustoQuery(connection: Partial<IConnectionInfo>) {
    switch (connection.type) {
        case 'azAuth':
            return connection.cluster && connection.database ? true : false;
        case 'appInsights':
            return connection.id ? true : false;
        default:
            return 'cluster' in connection && connection.cluster && 'database' in connection && connection.database
                ? true
                : false;
    }
}
async function ensureNotebookHasConnectionInfoInternal(
    document: NotebookDocument,
    changeExistingValue = false
): Promise<IConnectionInfo | undefined> {
    const currentInfo = getConnectionInfoFromDocumentMetadata(document, changeExistingValue);
    if (!changeExistingValue && currentInfo && isConnectionValidForKustoQuery(currentInfo)) {
        return currentInfo as IConnectionInfo;
    }
    if (!isKustoNotebook(document) && !isJupyterNotebook(document)) {
        return;
    }
    const info = await captureConnectionFromUser(getConnectionInfoFromDocumentMetadata(document));
    if (!info || !isConnectionValidForKustoQuery(info)) {
        return;
    }
    if (isKustoNotebook(document)) {
        await updateNotebookConnection(document, info);
    } else {
        await updateCache(document.uri.toString().toLowerCase(), info);
    }
    await updateCache(GlobalMementoKeys.lastUsedConnection, info);
    return info;
}
async function ensureDocumentHasConnectionInfoInternal(
    document: TextDocument,
    changeExistingValue = false
): Promise<IConnectionInfo | undefined> {
    const currentInfo = getConnectionInfoFromDocumentMetadata(document);
    if (!changeExistingValue && currentInfo && isConnectionValidForKustoQuery(currentInfo)) {
        return currentInfo as IConnectionInfo;
    }
    const info = await captureConnectionFromUser(getConnectionInfoFromDocumentMetadata(document));
    if (!info || !isConnectionValidForKustoQuery(info)) {
        return;
    }
    if (isEqual(currentInfo, info)) {
        return;
    }
    await updateCache(document.uri.toString().toLowerCase(), info);
    await updateCache(GlobalMementoKeys.lastUsedConnection, info);
    onDidChangeConnection.fire(document);
    return info;
}
async function changDocumentConnection(uri?: Uri) {
    uri = uri || window.activeNotebookEditor?.document.uri;
    if (!uri) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const document = workspace.notebookDocuments.find((item) => item.uri.toString() === uri!.toString());
    if (document) {
        await ensureNotebookHasConnectionInfoInternal(document, true);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const textDocument = workspace.textDocuments.find((item) => item.uri.toString() === uri!.toString());
        if (!textDocument) {
            return;
        }
        await ensureDocumentHasConnectionInfoInternal(textDocument, true);
    }
}
function onDidChangeJupyterNotebookCells(e: NotebookCellsChangeEvent) {
    if (!isJupyterNotebook(e.document)) {
        return;
    }
    if (e.changes.some((item) => getJupyterCellWithConnectionInfo(item.items))) {
        // Ok we know the cell containing the connection string changed.
        getConnectionInfoFromJupyterNotebook(e.document);
        triggerJupyterConnectionChanged(e.document);
    }
}
function onDidChangeJupyterNotebookCell(textDocument: TextDocument) {
    if (!textDocument.notebook || !isJupyterNotebook(textDocument.notebook)) {
        return;
    }
    if (textDocumentHasJupyterConnectionInfo(textDocument)) {
        // Ok we know the cell containing the connection string changed.
        getConnectionInfoFromJupyterNotebook(textDocument.notebook);
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
export function getConnectionInfoFromDocumentMetadata(
    document: NotebookDocument | TextDocument,
    ignoreCache = false
): Partial<IConnectionInfo> | undefined {
    // If user manually chose a connection, then use that.
    let connection = getFromCache<IConnectionInfo>(document.uri.toString().toLowerCase());
    if (connection) {
        return connection;
    }
    if ('notebook' in document && document.notebook) {
        document = document.notebook;
    }
    if ('notebookType' in document) {
        if (isJupyterNotebook(document)) {
            connection = getConnectionInfoFromJupyterNotebook(document);
        } else {
            connection  = getConnectionFromNotebookMetadata(document);
        }
    }
    if (connection && !getFromCache(GlobalMementoKeys.lastUsedConnection)) {
        // If we have a preferred connection, and user hasn't ever selected a connection (before),
        // then use current connection as the preferred connection for future notebooks/kusto files.
        updateCache(GlobalMementoKeys.lastUsedConnection, connection);
    }
    if (ignoreCache) {
        return connection;
    }
    return connection || getFromCache(GlobalMementoKeys.lastUsedConnection);
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
function getConnectionInfoFromJupyterNotebook(document: NotebookDocument): IConnectionInfo | undefined {
    // %kql azureDataExplorer://code;cluster='help';database='Samples'
    if (!isJupyterNotebook(document)) {
        return;
    }
    const cell = getJupyterCellWithConnectionInfo(document.getCells());
    if (!cell) {
        return;
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
        const clusterUri = `https://${parts[clusterIndex + 1]}.kusto.windows.net`;
        const database = parts[databaseIndex + 1];
        debug(`Parsed ${text} & got ${clusterUri} & ${database}`);
        const info = AzureAuthenticatedConnection.from({ cluster: clusterUri, database }).info;
        jupyterNotebookClusterAndDb.set(document, info);
        return info;
    } catch (ex) {
        logError(`Failed to parse ${text} to get cluster & db`, ex);
        return;
    }
}
async function updateNotebookConnection(document: NotebookDocument, info: IConnectionInfo) {
    if (!document.metadata.editable || isJupyterNotebook(document) || !isKustoNotebook(document)) {
        return;
    }
    const edit = new WorkspaceEdit();
    const metadata = JSON.parse(JSON.stringify(document.metadata)) || {};
    updateMetadataWithConnectionInfo(metadata, info);
    edit.replaceNotebookMetadata(document.uri, metadata);
    await workspace.applyEdit(edit);
    onDidChangeConnection.fire(document);
}
