import * as vscode from 'vscode';
import type { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import { NotebookCellData, NotebookCellKind, NotebookData, workspace } from 'vscode';
import { getCellOutput } from '../output/chart';
import { registerDisposable } from '../utils';
import { getNotebookMetadata, updateMetadataWithConnectionInfo } from './data';
import { IConnectionInfo } from '../kusto/connections/types';
import { fromMetadata } from '../kusto/connections/baseConnection';
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
export type KustoNotebookConnectionMetadata =
    | {
          cluster: string;
          database: string;
      }
    | { appInsightsId: string };
type KustoNotebookMetadata = {
    locked?: boolean;
    connection?: KustoNotebookConnectionMetadata;
};
export type KustoNotebook = {
    cells: KustoCell[];
    metadata?: KustoNotebookMetadata;
};

export class ContentProvider implements vscode.NotebookSerializer {
    public static decoder = new TextDecoder();
    public static encoder = new TextEncoder();
    constructor(private readonly _persistOutputs: boolean) {}
    deserializeNotebook(
        content: Uint8Array,
        _token: vscode.CancellationToken
    ): vscode.NotebookData | Thenable<vscode.NotebookData> {
        const js = ContentProvider.decoder.decode(content);
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
                let connection: IConnectionInfo | undefined = fromMetadata(connectionInNotebookMetadata);
                if ('cluster' in connectionInNotebookMetadata) {
                    connection = AzureAuthenticatedConnection.connectionInfofrom({
                        cluster: connectionInNotebookMetadata.cluster,
                        database: connectionInNotebookMetadata.database
                    });
                }
                if ('appInsightsId' in connectionInNotebookMetadata) {
                    const appInsightsId = connectionInNotebookMetadata.appInsightsId;
                    connection = getCachedConnections().find((item) => item.id === appInsightsId);
                }
                updateMetadataWithConnectionInfo(metadata, connection);
            }
            const notebookData = new NotebookData(cells);
            notebookData.metadata = metadata;
            return notebookData;
        } catch (ex) {
            console.error('Failed to parse notebook contents', ex);
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
                            const data = ContentProvider.decoder.decode(kustoOutputItem.data);
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

        return ContentProvider.encoder.encode(JSON.stringify(notebook, undefined, 4));
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
