import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import {
    notebooks,
    CancellationToken,
    ExtensionContext,
    NotebookCell,
    NotebookCellStatusBarAlignment,
    NotebookCellStatusBarItemProvider
} from 'vscode';

export class StatusBarProvider implements NotebookCellStatusBarItemProvider {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    protected contructor() {}
    static register(context: ExtensionContext) {
        const statusBarProvider = new StatusBarProvider();
        context.subscriptions.push(
            notebooks.registerNotebookCellStatusBarItemProvider('kusto-notebook', statusBarProvider),
            notebooks.registerNotebookCellStatusBarItemProvider('kusto-interactive', statusBarProvider)
        );
    }

    provideCellStatusBarItems(cell: NotebookCell, _token: CancellationToken) {
        if (cell.outputs.length) {
            const firstOutput = cell.outputs[0];

            if (firstOutput.items.length) {
                const outputItem = firstOutput.items[0];
                try {
                    const results: KustoResponseDataSet = JSON.parse(Buffer.from(outputItem.data).toString('utf8'));
                    const rowCount = results?.primaryResults.length
                        ? results?.primaryResults[0]._rows.length
                        : undefined;

                    if (rowCount) {
                        return [
                            {
                                text: `${rowCount} records`,
                                alignment: NotebookCellStatusBarAlignment.Left
                            }
                        ];
                    }
                } catch (ex) {
                    console.error('Failures in statusbar', ex);
                }
            }
        }
        return [];
    }
}
