import { EOL } from 'os';
import { commands, notebook, NotebookCell, NotebookCellKind, Uri, window, workspace } from 'vscode';
import { isKustoNotebook } from '../kernel/provider';
import { registerDisposable } from '../utils';
import { getConnectionInfoFromDocumentMetadata } from '../kusto/connections/notebookConnection';
import { updateCache } from '../cache';
import { ICodeCell, IMarkdownCell, INotebookContent } from './jupyter';
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
            'Kusto Script': ['csl', 'kql'],
            'Jupyter Notebook': ['ipynb']
        },
        saveLabel: 'Export',
        title: 'Export as Kusto Notebook'
    });
    if (!target) {
        return;
    }

    const connection = getConnectionInfoFromDocumentMetadata(document);
    let script: string;
    if (target.fsPath.toLowerCase().endsWith('.ipynb')) {
        const cells: (ICodeCell | IMarkdownCell)[] = [];
        cells.push({
            cell_type: 'code',
            execution_count: null,
            metadata: {},
            outputs: [],
            source: [
                '# %pip install kqlmagic # Ensure kqlmagic is installed',
                '%env KQLMAGIC_LOAD_MODE=silent',
                '%env KQLMAGIC_CONFIGURATION="show_query_time=False;show_init_banner=False;check_magic_version=False;show_what_new=False;"',
                '%reload_ext Kqlmagic'
            ]
        });
        switch (connection?.type) {
            case 'azAuth':
                cells.push({
                    cell_type: 'code',
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: [
                        `%kql azureDataExplorer://code;cluster='${connection.cluster}';database='${connection.database}'`
                    ]
                });
                break;
            case 'appInsights':
                cells.push({
                    cell_type: 'code',
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: [`%kql appinsights://appid='<APPID>';appkey='<APPKEY>'`]
                });
        }
        cells.push(...document.getCells().map(convertCellToJupyter));
        const jupyterNotebook: INotebookContent = {
            cells,
            metadata: {
                orig_nbformat: 4
            },
            nbformat: 4,
            nbformat_minor: 4
        };
        script = JSON.stringify(jupyterNotebook, undefined, 4);
    } else {
        script = document.getCells().map(convertCell).join(`${EOL}${EOL}`);
    }
    // Ensure the connection information is updated, so that its upto date if/when its opened in VS Code.
    const updateConnectionPromise = connection
        ? updateCache(target.toString().toLowerCase(), connection)
        : Promise.resolve();
    await Promise.all([workspace.fs.writeFile(target, Buffer.from(script)), updateConnectionPromise]);
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

function convertCellToJupyter(cell: NotebookCell): IMarkdownCell | ICodeCell {
    return cell.kind === NotebookCellKind.Markdown
        ? convertMarkdownCellToJupyter(cell)
        : convertCodeCellToJupyter(cell);
}
function convertMarkdownCellToJupyter(cell: NotebookCell): IMarkdownCell {
    const lines = cell.document.getText().split(/\r?\n/g);
    return {
        cell_type: 'markdown',
        metadata: {},
        source: lines
    };
}
function convertCodeCellToJupyter(cell: NotebookCell): ICodeCell {
    const lines = cell.document.getText().split(/\r?\n/g);
    return {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: ['%%kql', ...lines]
    };
}
