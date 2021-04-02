import { notebook, NotebookDocument, Uri, ViewColumn, window } from 'vscode';
import { commands } from 'vscode';
import { Kernel } from '../kernel/kernel';
import { isKustoInteractive } from '../kernel/provider';
import { registerDisposable } from '../utils';

export function registerInteractiveExperience() {
    registerDisposable(commands.registerTextEditorCommand('kusto.executeSelectedQuery', executeSelectedQuery));
    registerDisposable(
        notebook.onDidCloseNotebookDocument((e) => {
            if (e === interactiveNotebook) {
                interactiveNotebook = undefined;
            }
        })
    );
}

async function executeSelectedQuery(args: any) {
    console.log(args);
    if (!window.activeTextEditor) {
        return;
    }
    const activeEditor = window.activeTextEditor;

    await createInteractiveWindow();
    await Kernel.InteractiveKernel?.executeInteractiveSelection(activeEditor);
    // const edit = new WorkspaceEdit();
    // const source = activeEditor.document.getText(activeEditor.selection);
    // edit.replaceNotebookCells(notebook.uri, notebook.cells.length, 0, [
    //     new NotebookCellData(NotebookCellKind.Code, source, 'kusto', [], new NotebookCellMetadata())
    // ]);
    // await workspace.applyEdit(edit);
}

let interactiveNotebook: NotebookDocument | undefined;
export async function createInteractiveWindow() {
    if (interactiveNotebook) {
        return interactiveNotebook;
    }
    interactiveNotebook = interactiveNotebook || notebook.notebookDocuments.find(isKustoInteractive);
    if (!interactiveNotebook) {
        const name = `Interactive Output.knb-interactive`;
        const uri = Uri.file(name).with({ scheme: 'interactive', path: name });
        const editor = await window.showNotebookDocument(uri, {
            viewColumn: ViewColumn.Beside,
            preserveFocus: true,
            preview: false
        });
        interactiveNotebook = editor.document;
    }
    return interactiveNotebook;
}
