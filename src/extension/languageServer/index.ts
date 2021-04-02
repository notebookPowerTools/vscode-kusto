import * as path from 'path';
import { commands, ExtensionContext, notebook, NotebookDocument, window, workspace } from 'vscode';
import { LanguageClientOptions } from 'vscode-languageclient';
import { LanguageClient, ServerOptions, State, TransportKind } from 'vscode-languageclient/node';
import { addDocumentConnectionHandler, getClusterAndDbFromDocumentMetadata } from '../kernel/notebookConnection';
import { EngineSchema } from '../kusto/schema';
import { getClusterSchema } from '../kusto/schemas';
import { debug, registerDisposable } from '../utils';

let client: LanguageClient;
let clientState: State | undefined;
export async function initialize(context: ExtensionContext) {
    commands.registerCommand('languageServerExample.startStreaming', async () => {
        // Establish websocket connection
        const activeNbUri = window.activeNotebookEditor?.document;
        if (!activeNbUri) {
            return;
        }
        const engineSchema = await getClusterSchema('https://ddtelvscode.kusto.windows.net/', true);
        const clone: EngineSchema = JSON.parse(JSON.stringify(engineSchema));
        clone.database = engineSchema.cluster.databases.find(
            (item) => item.name.toLowerCase() === 'VSCodeExt'.toLowerCase()
        );
        client.sendNotification('setSchema', {
            uri: activeNbUri.cells[0].document.uri.toString(),
            engineSchema: clone
        });
    });

    startLanguageServer(context);
    // When a notebook is opened, fetch the schema & send it.
    registerDisposable(notebook.onDidOpenNotebookDocument(sendSchemaForDocument));
    addDocumentConnectionHandler(sendSchemaForDocument);
    // Send schemas for currently opened documents as well.
    notebook.notebookDocuments.forEach(sendSchemaForDocument);
}

function startLanguageServer(context: ExtensionContext) {
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6012'] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [{ language: 'kusto' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
        },
        // Hijacks all LSP logs and redirect them to a specific port through WebSocket connection
        outputChannel: window.createOutputChannel('Kusto Language Server')
    };

    // Create the language client and start the client.
    client = new LanguageClient('languageServerExample', 'Language Server Example', serverOptions, clientOptions);
    registerDisposable({ dispose: () => client.stop() });
    client.onDidChangeState((e) => {
        clientState = e.newState;
        sendSchemaForDocuments();
        if (e.newState === State.Running) {
            client.onRequest('onCustom', (msg) => {
                console.error(msg);
            });
        }
    });
    // Start the client. This will also launch the server
    client.start();
}

const lastSentClusterDbForDocument = new WeakMap<NotebookDocument, EngineSchema>();
const pendingSchemas = new Map<string, EngineSchema>();
async function sendSchemaForDocument(document: NotebookDocument) {
    const info = getClusterAndDbFromDocumentMetadata(document);
    if (!info.cluster || !info.database || !shouldSendSchemaToLanguageServer(document, info)) {
        return;
    }
    const engineSchema = await getClusterSchema(info.cluster);
    const clone: EngineSchema = JSON.parse(JSON.stringify(engineSchema));
    clone.database = engineSchema.cluster.databases.find(
        (item) => item.name.toLowerCase() === info.database?.toLowerCase()
    );
    pendingSchemas.set(document.uri.toString(), clone);
    sendSchemaForDocuments();
}
function shouldSendSchemaToLanguageServer(document: NotebookDocument, info?: { cluster?: string; database?: string }) {
    if (!info || !info.cluster || !info.database) {
        return true;
    }
    const lastSent = lastSentClusterDbForDocument.get(document);
    if (!lastSent || lastSent.cluster.connectionString !== info.cluster || lastSent.database?.name !== info.database) {
        return true;
    }
    return false;
}
function sendSchemaForDocuments() {
    if (!client || clientState !== State.Running) {
        return;
    }
    pendingSchemas.forEach((engineSchema, uri) => {
        debug(`Sending schema for ${uri} ${engineSchema.cluster.connectionString}: ${engineSchema.database?.name}`);
        client.sendNotification('setSchema', {
            uri,
            engineSchema
        });
    });
    pendingSchemas.clear();
}
