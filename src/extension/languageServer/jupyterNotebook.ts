import { languages, NotebookCellKind, NotebookDocument, TextDocument, workspace } from 'vscode';
import { useProposedApi } from '../constants';
import { isJupyterNotebook } from '../kernel/provider';
import { registerDisposable } from '../utils';

export function monitorJupyterCells() {
    registerDisposable(workspace.onDidOpenNotebookDocument(updateKustoCellsOfDocument));
    registerDisposable(workspace.onDidChangeTextDocument((e) => updateKustoCells(e.document)));
    if (useProposedApi()) {
        registerDisposable(workspace.onDidChangeNotebookDocument((e) => updateKustoCellsOfDocument(e.notebook)));
    }
    workspace.notebookDocuments.forEach(updateKustoCellsOfDocument);
}

async function updateKustoCells(textDocument: TextDocument) {
    if (!workspace.notebookDocuments.some((nb) => nb.getCells().some((c) => c.document === textDocument))) {
        return;
    }
    // if (!textDocument.notebook || !isJupyterNotebook(textDocument.notebook)) {
    //     return;
    // }
    if (textDocument.languageId !== 'python') {
        return;
    }
    if (!textDocument.lineAt(0).text.startsWith('%kql') && !textDocument.lineAt(0).text.startsWith('%%kql')) {
        return;
    }
    await languages.setTextDocumentLanguage(textDocument, 'kusto');
}

async function updateKustoCellsOfDocument(document?: NotebookDocument) {
    if (!document || !isJupyterNotebook(document)) {
        return;
    }
    await Promise.all(
        document
            .getCells()
            .filter((item) => item.kind === NotebookCellKind.Code)
            .map((item) => updateKustoCells(item.document))
    );
}
