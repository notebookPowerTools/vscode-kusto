import {
    NotebookCellData,
    NotebookCellKind,
    NotebookDocument,
    NotebookEdit,
    NotebookEditor,
    NotebookRange,
    Range,
    TextDocument,
    Uri,
    ViewColumn,
    workspace,
    WorkspaceEdit
} from 'vscode';
import { commands } from 'vscode';
import { registerDisposable } from '../utils';
import { Kernel } from '../kernel/provider';

export function registerInteractiveExperience() {
    registerDisposable(commands.registerCommand('kusto.executeSelectedQuery', executeSelectedQuery));
}

type INativeInteractiveWindow = { notebookUri: Uri; inputUri: Uri; notebookEditor: NotebookEditor };
const documentInteractiveDocuments = new WeakMap<TextDocument, Promise<NotebookDocument | undefined>>();
async function executeSelectedQuery(document: TextDocument, start: number, end: number) {
    if (!documentInteractiveDocuments.has(document)) {
        documentInteractiveDocuments.set(document, getNotebookDocument());
    }
    const notebook = await documentInteractiveDocuments.get(document);
    if (!notebook) {
        return;
    }
    // Ensure its visible.
    await commands.executeCommand('interactive.open', undefined, notebook.uri, undefined);
    const cell = await createCell(notebook, document, start, end);
    Kernel.instance.executeInteractive([cell], document, Kernel.instance.interactiveController);
}

async function getNotebookDocument() {
    // eslint-disable-next-line prefer-const
    let notebookUri: Uri | undefined;
    let isSelected = false;
    const selected = new Promise<void>((resolve) => {
        const disposable = Kernel.instance.interactiveController.onDidChangeSelectedNotebooks(
            ({ notebook, selected }) => {
                if (!selected) {
                    return;
                }
                if (!notebookUri) {
                    notebookUri = notebook.uri;
                    isSelected = true;
                    return resolve();
                }
                if (notebook.uri.toString() !== notebookUri.toString()) {
                    return;
                }
                isSelected = true;
                resolve();
            }
        );
        registerDisposable(disposable);
    });
    const info = (await commands.executeCommand(
        'interactive.open',
        // ViewColumn.Beside,
        { viewColumn: ViewColumn.Beside, preserveFocus: true },
        undefined,
        'kustoInteractive',
        'Kusto Interactive Window'
    )) as INativeInteractiveWindow;
    if (!isSelected) {
        notebookUri = info.notebookUri;
        await Promise.all([selected, commands.executeCommand('notebook.selectKernel')]);
    }

    return info.notebookEditor.notebook;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    // return workspace.notebookDocuments.find((item) => item.uri.toString() === notebookUri!.toString());
}
async function createCell(notebook: NotebookDocument, document: TextDocument, start: number, end: number) {
    const text = document.getText(new Range(document.lineAt(start).range.start, document.lineAt(end).range.end));
    const edit = new WorkspaceEdit();
    const cell = new NotebookCellData(NotebookCellKind.Code, text.trim(), 'kusto');
    cell.metadata = {
        interactiveWindowCellMarker: document.lineAt(start).text,
        interactive: {
            file: document.uri.fsPath,
            line: start
        }
    };
    const nbEdit = NotebookEdit.replaceCells(new NotebookRange(notebook.cellCount, notebook.cellCount), [cell]);
    edit.set(notebook.uri, [nbEdit]);
    await workspace.applyEdit(edit);
    return notebook.cellAt(notebook.cellCount - 1);
}
