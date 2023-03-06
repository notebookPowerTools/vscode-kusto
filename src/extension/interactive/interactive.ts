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
    window,
    workspace,
    WorkspaceEdit
} from 'vscode';
import { commands } from 'vscode';
import { registerDisposable } from '../utils';
import { Kernel } from '../kernel/provider';
import { FoldingRangesProvider } from '../languageServer';

export function registerInteractiveExperience() {
    registerDisposable(commands.registerCommand('kusto.executeSelectedQuery', executeSelectedQuery));
}

type INativeInteractiveWindow = { notebookUri: Uri; inputUri: Uri; notebookEditor: NotebookEditor };
const documentInteractiveDocuments = new WeakMap<TextDocument, Promise<NotebookDocument | undefined>>();

async function executeSelectedQuery(document: TextDocument, start: number, end: number) {
    if (!document) {
        if (
            !window.activeTextEditor ||
            !window.activeTextEditor.selection ||
            window.activeTextEditor.selections.length > 1 ||
            window.activeTextEditor.document.languageId.toLocaleLowerCase() !== 'kusto'
        ) {
            return;
        }
        const selection = window.activeTextEditor.selection;
        document = window.activeTextEditor.document;
        const ranges = await FoldingRangesProvider.instance.getRanges(document);
        const range = ranges.find((r) => r.start <= selection.start.line && r.end >= selection.end.line);
        if (!range) {
            return;
        }

        start = range.start;
        for (start = range.start; start <= range.end; start++) {
            const line = document.lineAt(start).text;
            if (line.trim().startsWith('//')) {
                continue;
            } else {
                break;
            }
        }
        end = range.end;
    }
    if (!documentInteractiveDocuments.has(document)) {
        documentInteractiveDocuments.set(document, getNotebookDocument());
    }
    let notebook = await documentInteractiveDocuments.get(document);
    if (notebook?.isClosed) {
        documentInteractiveDocuments.set(document, getNotebookDocument());
    }
    notebook = await documentInteractiveDocuments.get(document);
    if (!notebook) {
        return;
    }
    // Ensure its visible.
    await commands.executeCommand('interactive.open', undefined, notebook.uri, undefined);
    const cell = await createCell(notebook, document, start, end);
    Kernel.instance.executeInteractive([cell], document, Kernel.instance.interactiveController);
}

async function getNotebookDocument() {
    const info = (await commands.executeCommand(
        'interactive.open',
        { viewColumn: ViewColumn.Beside, preserveFocus: true },
        undefined,
        'kustoInteractive',
        'Kusto Interactive Window'
    )) as INativeInteractiveWindow;

    return info.notebookEditor.notebook;
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
