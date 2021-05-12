import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import {
    notebook,
    CancellationToken,
    ExtensionContext,
    NotebookCell,
    NotebookCellStatusBarAlignment,
    NotebookCellStatusBarItemProvider
} from 'vscode';

export class StatusBarProvider implements NotebookCellStatusBarItemProvider {
    protected contructor() {}
    static register(context: ExtensionContext) {
        context.subscriptions.push(
            notebook.registerNotebookCellStatusBarItemProvider('kusto-notebook', new StatusBarProvider())
        );
        context.subscriptions.push(
            notebook.registerNotebookCellStatusBarItemProvider('kusto-interactive', new StatusBarProvider())
        );
    }

    provideCellStatusBarItems(cell: NotebookCell, _token: CancellationToken) {
        if (cell.outputs.length) {
            const firstOutput = cell.outputs[0];
            const outputItem = firstOutput.outputs[0];

            if (outputItem) {
                const results = outputItem.value as KustoResponseDataSet | undefined;
                const rowCount = results?.primaryResults.length ? results?.primaryResults[0]._rows.length : undefined;

                if (rowCount) {
                    return [
                        {
                            text: `${rowCount} records`,
                            alignment: NotebookCellStatusBarAlignment.Left
                        }
                    ];
                }
            }
        }
        return [];
    }
}
