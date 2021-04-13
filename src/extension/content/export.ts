import { EOL } from 'os';
import { commands, notebook, NotebookCell, NotebookCellKind, Uri, window, workspace } from 'vscode';
import { isKustoNotebook } from '../kernel/provider';
import { registerDisposable } from '../utils';

export function registerExportCommand() {
    registerDisposable(commands.registerCommand('kusto.exportNotebookAsScript', exportNotebook));
}

async function exportNotebook(uri?: Uri) {
    uri = uri || window.activeNotebookEditor?.document.uri;
    if (!uri) {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const document = notebook.notebookDocuments.find((item) => item.uri.toString() === uri!.toString());
    if (!document) {
        return;
    }
    if (!isKustoNotebook(document)) {
        return;
    }

    const target = await window.showSaveDialog({
        filters: {
            'Kusto Script': ['csl', 'kql']
        },
        saveLabel: 'Export',
        title: 'Export as Kusto Script'
    });
    if (!target) {
        return;
    }

    const script = document.getCells().map(convertCell).join(`${EOL}${EOL}`);
    await workspace.fs.writeFile(target, Buffer.from(script));
}

function convertCell(cell: NotebookCell): string {
    return cell.kind === NotebookCellKind.Markdown ? convertMarkdownCell(cell) : convertCodeCell(cell);
}
function convertMarkdownCell(cell: NotebookCell): string {
    return cell.document
        .getText()
        .split(/\r?\n/g)
        .map((line) => `// ${line}`)
        .join(EOL);
}
function convertCodeCell(cell: NotebookCell): string {
    return cell.document.getText();
}
