import * as path from 'path';
import * as vscode from 'vscode';
import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import {
    CancellationToken,
    commands,
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
import { isKustoInteractive, isKustoNotebook } from '../kernel/provider';
import { getCellOutput } from '../output/chart';
import { debug, isUntitledFile, registerDisposable } from '../utils';
import { IConnectionInfo } from '../kusto/connections/types';
import { AzureAuthenticatedConnection } from '../kusto/connections/azAuth';
import { getCachedConnections } from '../kusto/connections/storage';

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
type KustoNotebookConnectionMetadata =
    | {
          cluster: string;
          database: string;
      }
    | { appInsightsId: string };
type KustoNotebookMetadata = {
    locked?: boolean;
    connection?: KustoNotebookConnectionMetadata;
};
type KustoNotebook = {
    cells: KustoCell[];
    metadata?: KustoNotebookMetadata;
};

export class ContentProvider implements NotebookContentProvider {
    constructor(private readonly _persistOutputs: boolean) {}

    public static register() {
        const persistOutputs = vscode.workspace.getConfiguration().get<boolean>('kusto.persistOutputs');
        let disposable = notebook.registerNotebookContentProvider(
            'kusto-notebook',
            new ContentProvider(persistOutputs ?? false),
            {
                transientOutputs: !persistOutputs,
                transientMetadata: {
                    statusMessage: !persistOutputs
                }
            }
        );
        registerDisposable(disposable);
        disposable = notebook.registerNotebookContentProvider('kusto-interactive', new ContentProvider(false), {
            transientOutputs: true,
            transientMetadata: {
                custom: true,
                editable: true,
                inputCollapsed: true,
                outputCollapsed: true
            }
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
        try {
            let notebook: KustoNotebook = { cells: [] };
            if (isKustoInteractive(uri)) {
                // Do nothing.
            } else if (isUntitledFile(uri) && contentsForNextUntitledFile.has(uri.fsPath)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                notebook = contentsForNextUntitledFile.get(uri.fsPath)!;
                contentsForNextUntitledFile.delete(uri.fsPath);
            } else {
                const buffer = openContext.untitledDocumentData || (await workspace.fs.readFile(uri));
                notebook = JSON.parse(Buffer.from(buffer).toString('utf8'));
            }
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const custom: Record<string, any> = {};
            let connectionInNotebookMetadata = notebook.metadata?.connection;
            // Backwards compatibility (for older format of metadata in documents).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldMetadataFormat: { cluster?: string; database?: string } | undefined = notebook.metadata as any;
            if (connectionInNotebookMetadata && (oldMetadataFormat?.cluster || oldMetadataFormat?.database)) {
                connectionInNotebookMetadata = {
                    ...oldMetadataFormat
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any;
            }

            if (connectionInNotebookMetadata) {
                let connection: IConnectionInfo | undefined;
                if ('cluster' in connectionInNotebookMetadata) {
                    connection = AzureAuthenticatedConnection.from({
                        cluster: connectionInNotebookMetadata.cluster,
                        database: connectionInNotebookMetadata.database
                    }).info;
                }
                if ('appInsightsId' in connectionInNotebookMetadata) {
                    const appInsightsId = connectionInNotebookMetadata.appInsightsId;
                    connection = getCachedConnections().find((item) => item.id === appInsightsId);
                }
                updateCustomMetadataWithConnectionInfo(custom, connection);
            }
            let metadata = new NotebookDocumentMetadata().with({
                cellEditable: !notebook.metadata?.locked,
                cellHasExecutionOrder: false,
                editable: !notebook.metadata?.locked,
                trusted: true,
                custom
            });
            if (isKustoInteractive(uri)) {
                metadata = new NotebookDocumentMetadata().with({
                    cellEditable: false,
                    cellHasExecutionOrder: false,
                    editable: false,
                    trusted: true
                });
            }
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
                let outputs: KustoResponseDataSet[] = [];

                if (this._persistOutputs) {
                    let output: KustoResponseDataSet | undefined;
                    cell.outputs.forEach((item) => {
                        const kustoOutputItem = item.outputs.find((outputItem) =>
                            outputItem.mime.startsWith('application/vnd.kusto.result')
                        );
                        output = output || (kustoOutputItem?.value as KustoResponseDataSet);
                    });

                    outputs = output ? [output] : [];
                }

                const kustoCell: KustoCell = {
                    kind: cell.kind === NotebookCellKind.Code ? 'code' : 'markdown',
                    source: cell.document.getText(),
                    outputs: outputs
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

        if (!document.metadata.editable || Object.keys(document.metadata.custom.connection || {}).length) {
            notebook.metadata = getNotebookMetadata(document.metadata.editable, document.metadata.custom.connection);
        }

        const content = Buffer.from(JSON.stringify(notebook, undefined, 4));
        await workspace.fs.writeFile(uri, content);
    }
}

function getNotebookMetadata(editable?: boolean, connection?: IConnectionInfo) {
    const notebookMetadata: KustoNotebookMetadata = {};
    if (connection) {
        switch (connection.type) {
            case 'azAuth':
                notebookMetadata.connection = {
                    cluster: connection.cluster,
                    database: connection.database || ''
                };
                break;
            case 'appInsights':
                notebookMetadata.connection = {
                    appInsightsId: connection.id
                };
        }
    }
    notebookMetadata.locked = !editable;
    return notebookMetadata;
}
const contentsForNextUntitledFile = new Map<string, KustoNotebook>();
export async function createUntitledNotebook(connection: IConnectionInfo, cellText?: string) {
    const name = `${createUntitledFileName()}.knb`;
    const uri = Uri.file(name).with({ scheme: 'untitled', path: name });
    const contents: KustoNotebook = {
        cells: cellText ? [{ kind: 'code', source: cellText, outputs: [] }] : [],
        metadata: getNotebookMetadata(false, connection)
    };
    contentsForNextUntitledFile.set(uri.fsPath.toString(), contents);
    await commands.executeCommand('vscode.openWith', uri, 'kusto-notebook');
}

export function updateCustomMetadataWithConnectionInfo(custom: Record<string, unknown>, connection?: IConnectionInfo) {
    custom.connection = connection ? JSON.parse(JSON.stringify(connection)) : undefined;
}
function createUntitledFileName() {
    const untitledNumbers = new Set(
        notebook.notebookDocuments
            .filter((item) => (isKustoNotebook(item) && item.isUntitled) || isUntitledFile(item.uri))
            .map((item) => path.basename(item.uri.fsPath.toLowerCase(), '.knb'))
            .filter((item) => item.includes('-'))
            .map((item) => parseInt(item.split('-')[1], 10))
            .filter((item) => !isNaN(item))
    );
    for (let index = 1; index <= untitledNumbers.size + 1; index++) {
        if (!untitledNumbers.has(index)) {
            return `Untitled-${index}`;
        }
        continue;
    }
    return `Untitled-${untitledNumbers.size + 1}`;
}
