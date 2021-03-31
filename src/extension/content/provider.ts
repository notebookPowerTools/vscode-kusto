import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import {
    CancellationToken,
    notebook,
    NotebookCellData,
    NotebookCellKind,
    NotebookCellMetadata,
    NotebookCellOutput,
    NotebookCommunication,
    NotebookContentProvider,
    NotebookData,
    NotebookDocument,
    NotebookDocumentBackup,
    NotebookDocumentBackupContext,
    NotebookDocumentMetadata,
    NotebookDocumentOpenContext,
    Uri,
    workspace
} from 'vscode';
import { getCellOutput } from '../output/chart';
import { debug, isUntitledFile, registerDisposable } from '../utils';

type KustoCellMetadata = {
    locked?: boolean;
    inputCollapsed?: boolean;
    outputCollapsed?: boolean;
    lastRun?: number;
    lastRunDuration?: number;
};
type KustoCell = {
    source: string;
    kind: 'markdown' | 'code';
    /**
     * I don't see the need for more than one output, but this is more extensible.
     */
    outputs: KustoResponseDataSet[];
    metadata?: KustoCellMetadata;
};
type KustoNotebookMetadata = {
    locked?: boolean;
    cluster?: string;
    database?: string;
};
type KustoNotebook = {
    cells: KustoCell[];
    metadata?: KustoNotebookMetadata;
};

export class ContentProvider implements NotebookContentProvider {
    public static register() {
        const disposable = notebook.registerNotebookContentProvider('kusto-notebook', new ContentProvider(), {
            transientOutputs: false,
            transientMetadata: {}
        });
        registerDisposable(disposable);
    }
    public async resolveNotebook(_document: NotebookDocument, _webview: NotebookCommunication): Promise<void> {
        // noop.
    }
    public async openNotebook(
        uri: Uri,
        openContext: NotebookDocumentOpenContext,
        _token: CancellationToken
    ): Promise<NotebookData> {
        const buffer = openContext.untitledDocumentData || (await workspace.fs.readFile(uri));
        let notebook: KustoNotebook = { cells: [] };
        try {
            notebook = JSON.parse(Buffer.from(buffer).toString('utf8'));
            const cells = notebook.cells.map((item) => {
                const outputs: NotebookCellOutput[] = item.outputs.map(getCellOutput);
                const locked = item.metadata?.locked === true;
                const metadata = new NotebookCellMetadata().with({
                    editable: !locked,
                    inputCollapsed: item.metadata?.inputCollapsed,
                    outputCollapsed: item.metadata?.outputCollapsed
                });
                const kind = item.kind === 'code' ? NotebookCellKind.Code : NotebookCellKind.Markdown;
                return new NotebookCellData(
                    kind,
                    item.source,
                    item.kind === 'code' ? 'kusto' : 'markdown',
                    outputs,
                    metadata
                );
            });
            const custom: Record<string, string> = {};
            if (notebook.metadata?.database) {
                custom.database = notebook.metadata?.database;
            }
            if (notebook.metadata?.cluster) {
                custom.cluster = notebook.metadata?.cluster;
            }
            const metadata = new NotebookDocumentMetadata().with({
                cellEditable: !notebook.metadata?.locked,
                cellHasExecutionOrder: false,
                editable: !notebook.metadata?.locked,
                trusted: true,
                custom
            });

            console.log(metadata);
            console.log(cells);
            return new NotebookData(cells, metadata);
        } catch (ex) {
            if (!isUntitledFile(uri)) {
                debug('Failed to parse notebook contents', ex);
            }
            return new NotebookData([]);
        }
    }

    public async saveNotebook(document: NotebookDocument, _token: CancellationToken): Promise<void> {
        await this.saveAs(document.uri, document);
    }
    public async saveNotebookAs(
        targetResource: Uri,
        document: NotebookDocument,
        _token: CancellationToken
    ): Promise<void> {
        await this.saveAs(targetResource, document);
    }

    public async backupNotebook(
        document: NotebookDocument,
        context: NotebookDocumentBackupContext,
        _token: CancellationToken
    ): Promise<NotebookDocumentBackup> {
        await this.saveAs(context.destination, document);
        return {
            id: context.destination.toString(),
            delete: () => workspace.fs.delete(context.destination)
        };
    }
    private async saveAs(uri: Uri, document: NotebookDocument) {
        const notebook: KustoNotebook = {
            cells: document.cells.map((cell) => {
                let output: KustoResponseDataSet | undefined;
                cell.outputs.forEach((item) => {
                    const kustoOutputItem = item.outputs.find((outputItem) =>
                        outputItem.mime.startsWith('application/vnd.kusto.result')
                    );
                    output = output || (kustoOutputItem?.value as KustoResponseDataSet);
                });
                const kustoCell: KustoCell = {
                    kind: cell.kind === NotebookCellKind.Code ? 'code' : 'markdown',
                    source: cell.document.getText(),
                    outputs: output ? [output] : []
                };
                const cellMetadata: KustoCellMetadata = {};
                if (cell.metadata.inputCollapsed === true) {
                    cellMetadata.inputCollapsed = true;
                }
                if (cell.metadata.outputCollapsed === true) {
                    cellMetadata.outputCollapsed = true;
                }
                if (cell.metadata.editable === false) {
                    cellMetadata.locked = true;
                }
                if (Object.keys(cellMetadata).length) {
                    kustoCell.metadata = cellMetadata;
                }
                return kustoCell;
            })
        };

        if (!document.metadata.editable || Object.keys(document.metadata.custom).length) {
            const notebookMetadata: KustoNotebookMetadata = {};
            notebookMetadata.locked = !document.metadata.editable;
            notebookMetadata.cluster = document.metadata.custom?.cluster;
            notebookMetadata.database = document.metadata.custom?.database;
            notebook.metadata = notebookMetadata;
        }

        const content = Buffer.from(JSON.stringify(notebook, undefined, 4));
        await workspace.fs.writeFile(uri, content);
    }
}
