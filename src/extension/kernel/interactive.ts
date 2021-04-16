import { notebook, NotebookDocument, TextEditor, Uri, ViewColumn, window } from 'vscode';
import { commands } from 'vscode';
import { KernelProvider } from '../kernel/provider';
import { isKustoInteractive } from '../kernel/provider';
import { isKustoFile, registerDisposable } from '../utils';

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

async function executeSelectedQuery(editor: TextEditor) {
    if (!isKustoFile(editor.document)) {
        return;
    }
    await createInteractiveWindow();
    // Still hackish, need to wait till this `Kernel.InteractiveKernel` is set (via a promise or the like).
    await KernelProvider.InteractiveKernel?.executeInteractiveSelection(editor);
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
