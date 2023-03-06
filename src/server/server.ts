/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {
    createConnection,
    InitializeParams,
    ProposedFeatures,
    TextDocuments,
    TextDocumentSyncKind
} from 'vscode-languageserver/node';
// import { getLanguageModes, LanguageModes } from './languageModes';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { EngineSchema } from './schema';
import {
    disposeAllLanguageServers,
    doDocumentFormat,
    doFolding,
    doHover,
    doRangeFormat,
    doRename,
    getCompletions,
    getValidations,
    setDocumentEngineSchema
} from './worker';
import { URI } from 'vscode-uri';
import { getNotebookUri } from './utils';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);
connection.console.log('Started connection');

// Create a simple text document manager. The text document manager
// supports full document sync only
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams) => {
    connection.console.log('On Initialize');
    connection.onShutdown(() => disposeAllLanguageServers());
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: [' ', '=', '(']
            },
            hoverProvider: true,
            documentFormattingProvider: true,
            renameProvider: true,
            foldingRangeProvider: true
        }
    };
});

// connection.onInitialized(() => {});

connection.onNotification('setSchema', async (msg: { engineSchema: EngineSchema; uri: string }) => {
    connection.console.log(`Setting Engine Schema`);
    await setDocumentEngineSchema(msg.uri, msg.engineSchema);
    connection.console.log(`Setting Engine Schema, Done`);
    updateDiagnosticsForDocument(msg.uri);
});
connection.onDidChangeConfiguration((_change) => {
    // Formatting support formatting options?
});
function isNotebookCell(document: TextDocument) {
    return URI.parse(document.uri.toString()).scheme === 'vscode-notebook-cell';
}
function isKustoFile(document: TextDocument) {
    return !isNotebookCell(document) && document.languageId.toLowerCase() === 'kusto';
}
function isInteractiveDocument(document: TextDocument) {
    if (document.uri.toLowerCase().includes('vscode-interactive')) {
        return true;
    }
    if (!isNotebookCell(document)) {
        return false;
    }
    if (!document.uri.toLowerCase().includes('.knb-interactive')) {
        return false;
    }
    return getNotebookUri(document).fsPath.toLowerCase().endsWith('.knb-interactive');
}

function updateDiagnosticsForDocument(uri: string) {
    uri = getNotebookUri(uri).toString();
    documents.all().forEach((doc) => {
        // If the document isn't a cell thats part of the affected notebook, then ignore this.
        if (!isKustoFile(doc) && (!isNotebookCell(doc) || getNotebookUri(doc).toString() !== uri)) {
            return;
        }
        validateTextDocumentLater(doc);
    });
}
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    const uri = change.document.uri.toString();
    let timeout = validationIntervals.get(uri);
    if (timeout) {
        clearTimeout(timeout);
    }
    timeout = setTimeout(() => validateTextDocumentLater(change.document), 50);
    validationIntervals.set(uri, timeout);
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validationIntervals = new Map<string, any>();
async function validateTextDocumentLater(textDocument: TextDocument) {
    const document = documents.get(textDocument.uri);
    if (!document || isInteractiveDocument(document) || (!isNotebookCell(document) && !isKustoFile(document))) {
        return null;
    }
    connection.console.log(`Provide completion ${document.uri.toString()}`);
    const diagnostics = await getValidations(document, []);
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

connection.onCompletion(async (textDocumentPosition, _token) => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document || isInteractiveDocument(document) || (!isNotebookCell(document) && !isKustoFile(document))) {
        return null;
    }
    connection.console.log(`Provide completion ${document.uri.toString()}`);
    return getCompletions(document, textDocumentPosition.position);
});
connection.onDidCloseTextDocument(async ({ textDocument }) => {
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
});
connection.onHover(async ({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    if (!document || isInteractiveDocument(document) || (!isNotebookCell(document) && !isKustoFile(document))) {
        return null;
    }
    connection.console.log(`Provide hover ${document.uri.toString()}`);
    return doHover(document, position);
});
connection.onDocumentFormatting(async ({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    if (!document || isInteractiveDocument(document) || (!isNotebookCell(document) && !isKustoFile(document))) {
        return null;
    }
    connection.console.log(`Provide document formatting ${document.uri.toString()}`);
    return doDocumentFormat(document);
});
connection.onDocumentRangeFormatting(async ({ textDocument, range }) => {
    const document = documents.get(textDocument.uri);
    if (!document || isInteractiveDocument(document) || (!isNotebookCell(document) && !isKustoFile(document))) {
        return null;
    }
    connection.console.log(`Provide range formatting ${document.uri.toString()}`);
    return doRangeFormat(document, range);
});
connection.onRenameRequest(async ({ textDocument, position, newName }) => {
    const document = documents.get(textDocument.uri);
    if (!document || isInteractiveDocument(document) || (!isNotebookCell(document) && !isKustoFile(document))) {
        return null;
    }
    connection.console.log(`Provide rename ${document.uri.toString()}`);
    return doRename(document, position, newName);
});
connection.onFoldingRanges(async ({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    if (!document || isInteractiveDocument(document) || (!isNotebookCell(document) && !isKustoFile(document))) {
        return null;
    }
    connection.console.log(`Provide folding ${document.uri.toString()}`);
    return doFolding(document);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
