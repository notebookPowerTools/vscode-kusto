import * as path from 'path';
import * as vscode from 'vscode';
import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import { commands, NotebookCellData, NotebookCellKind, NotebookData, NotebookDocument, Uri, workspace } from 'vscode';
import { isKustoNotebook } from '../kernel/provider';
import { getCellOutput } from '../output/chart';
import { debug, isUntitledFile, registerDisposable } from '../utils';
import { IConnectionInfo } from '../kusto/connections/types';
import { AzureAuthenticatedConnection } from '../kusto/connections/azAuth';
import { getCachedConnections } from '../kusto/connections/storage';

type KustoCellMetadata = {
    inputCollapsed?: boolean;
    outputCollapsed?: boolean;
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

export class ContentProvider implements vscode.NotebookSerializer {
    constructor(private readonly _persistOutputs: boolean) {}
    deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): vscode.NotebookData | Thenable<vscode.NotebookData> {
        const js = Buffer.from(content).toString('utf8');
        try {
            const notebook: KustoNotebook = js.length ? JSON.parse(js) : { cells: [] };
            const cells = notebook.cells.map((item) => {
                const metadata = {
                    inputCollapsed: item.metadata?.inputCollapsed,
                    outputCollapsed: item.metadata?.outputCollapsed
                };
                const kind = item.kind === 'code' ? NotebookCellKind.Code : NotebookCellKind.Markup;
                const cell = new NotebookCellData(kind, item.source, item.kind === 'code' ? 'kusto' : 'markdown');
                cell.outputs = item.outputs.map(getCellOutput);
                cell.metadata = metadata;
                return cell;
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const metadata: Record<string, any> = {};
            let connectionInNotebookMetadata = notebook.metadata?.connection;
            // Backwards compatibility (for older format of metadata in documents).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldMetadataFormat: { cluster?: string; database?: string } | undefined = notebook.metadata as any;
            if (!connectionInNotebookMetadata && (oldMetadataFormat?.cluster || oldMetadataFormat?.database)) {
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
                updateMetadataWithConnectionInfo(metadata, connection);
            }
            // let metadata = {
            //     cellEditable: true, // !notebook.metadata?.locked,
            //     editable: true, //!notebook.metadata?.locked,
            //     trusted: true,
            //     custom
            // };
            // if (isKustoInteractive(uri)) {
            //     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            //     //@ts-ignore
            //     metadata = {
            //         cellEditable: false,
            //         editable: false,
            //         trusted: true
            //     };
            // }
            console.log(metadata);
            console.log(cells);
            const notebookData = new NotebookData(cells);
            notebookData.metadata = metadata;
            return notebookData;
        } catch (ex) {
            debug('Failed to parse notebook contents', ex);
            return new NotebookData([]);
        }
    }
    serializeNotebook(
        document: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Uint8Array | Thenable<Uint8Array> {
        const notebook: KustoNotebook = {
            cells: document.cells.map((cell) => {
                let outputs: KustoResponseDataSet[] = [];

                if (this._persistOutputs) {
                    let output: KustoResponseDataSet | undefined;
                    cell.outputs?.forEach((item) => {
                        const kustoOutputItem = item.items.find((outputItem) =>
                            outputItem.mime.startsWith('application/vnd.kusto.result')
                        );
                        if (kustoOutputItem?.data) {
                            const data = Buffer.from(kustoOutputItem.data).toString('utf8');
                            output = output || (JSON.parse(data) as KustoResponseDataSet);
                        }
                    });

                    outputs = output ? [output] : [];
                }

                const kustoCell: KustoCell = {
                    kind: cell.kind === NotebookCellKind.Code ? 'code' : 'markdown',
                    source: cell.value,
                    outputs: outputs
                };
                const cellMetadata: KustoCellMetadata = {};
                if (cell.metadata?.inputCollapsed === true) {
                    cellMetadata.inputCollapsed = true;
                }
                if (cell.metadata?.outputCollapsed === true) {
                    cellMetadata.outputCollapsed = true;
                }
                // if (cell.metadata.editable === false) {
                // cellMetadata.locked = true;
                // }
                if (Object.keys(cellMetadata).length) {
                    kustoCell.metadata = cellMetadata;
                }
                return kustoCell;
            })
        };

        const connection = document.metadata?.connection;
        if (connection && Object.keys(connection).length) {
            notebook.metadata = getNotebookMetadata(connection);
        }

        return Buffer.from(JSON.stringify(notebook, undefined, 4));
    }

    public static register() {
        const persistOutputs = vscode.workspace.getConfiguration().get<boolean>('kusto.persistOutputs');
        const disposable = workspace.registerNotebookSerializer(
            'kusto-notebook',
            new ContentProvider(persistOutputs ?? false),
            {
                transientOutputs: !persistOutputs,
                transientDocumentMetadata: {}
            }
        );
        registerDisposable(disposable);
    }
}

export function getNotebookMetadata(connection?: IConnectionInfo) {
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
    return notebookMetadata;
}
export function getConnectionFromNotebookMetadata(document: NotebookDocument) {
    const metadata: KustoNotebookMetadata = document.metadata;
    const connection = metadata?.connection;
    if (connection) {
        if ('cluster' in connection) {
            return AzureAuthenticatedConnection.from(connection).info;
        }
    }
}
const contentsForNextUntitledFile = new Map<string, KustoNotebook>();
export async function createUntitledNotebook(connection?: IConnectionInfo, cellText?: string) {
    const name = `${createUntitledFileName()}.knb`;
    const uri = Uri.file(name).with({ scheme: 'untitled', path: name });
    const contents: KustoNotebook = {
        // We don't want to create an empty notebook (add at least one blank cell)
        cells: typeof cellText === 'string' ? [{ kind: 'code', source: cellText, outputs: [] }] : [],
        metadata: getNotebookMetadata(connection)
    };
    contentsForNextUntitledFile.set(uri.fsPath.toString(), contents);
    await commands.executeCommand('vscode.openWith', uri, 'kusto-notebook');
}

export function updateMetadataWithConnectionInfo(metadata: Record<string, unknown>, connection?: IConnectionInfo) {
    metadata.connection = connection ? JSON.parse(JSON.stringify(connection)) : undefined;
}
export function getConnectionFromMetadata(metadata: Record<string, unknown>, connection?: IConnectionInfo) {
    metadata.connection = connection ? JSON.parse(JSON.stringify(connection)) : undefined;
}
function createUntitledFileName() {
    const untitledNumbers = new Set(
        workspace.notebookDocuments
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
