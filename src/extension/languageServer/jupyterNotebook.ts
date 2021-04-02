import { languages, notebook, NotebookCellKind, NotebookDocument, TextDocument, workspace } from 'vscode';
import { isJupyterNotebook } from '../kernel/provider';
import { registerDisposable } from '../utils';

export function monitorJupyterCells() {
    registerDisposable(notebook.onDidOpenNotebookDocument(updateKustoCellsOfDocument));
    registerDisposable(workspace.onDidChangeTextDocument((e) => updateKustoCells(e.document)));
    registerDisposable(notebook.onDidChangeNotebookCells((e) => updateKustoCellsOfDocument(e.document)));
    notebook.notebookDocuments.forEach(updateKustoCellsOfDocument);
}

async function updateKustoCells(textDocument: TextDocument) {
    if (!textDocument.notebook || !isJupyterNotebook(textDocument.notebook)) {
        return;
    }
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
        document.cells
            .filter((item) => item.kind === NotebookCellKind.Code)
            .map((item) => updateKustoCells(item.document))
    );
}
