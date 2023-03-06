import {
    NotebookDocument,
    notebooks,
    NotebookCell,
    NotebookCellOutput,
    NotebookCellOutputItem,
    WorkspaceEdit,
    NotebookController,
    ExtensionContext,
    Disposable,
    NotebookEdit,
    TextDocument
} from 'vscode';
import { Client } from '../kusto/client';
import { getChartType } from '../output/chart';
import { InteractiveWindowView, createPromiseFromToken } from '../utils';

export class KernelProvider {
    public static register(context: ExtensionContext) {
        context.subscriptions.push(new Kernel('kusto-notebook'));
        context.subscriptions.push(new Kernel('kusto-notebook-kql'));
    }
}

export class Kernel extends Disposable {
    notebookController: NotebookController;
    public readonly interactiveController: NotebookController;
    public static instance: Kernel;

    constructor(notebookType: 'kusto-notebook' | 'kusto-notebook-kql') {
        super(() => {
            this.dispose();
        });
        this.notebookController = this.createController(
            notebookType === 'kusto-notebook' ? 'kusto' : 'kusto-kql',
            notebookType
        );
        if (notebookType === 'kusto-notebook') {
            this.interactiveController = this.createController('kustoInteractive', InteractiveWindowView);
        } else {
            this.interactiveController = Kernel.instance.interactiveController;
        }
        if (notebookType === 'kusto-notebook') {
            Kernel.instance = this;
        }
    }

    dispose() {
        this.notebookController.dispose();
    }

    public executeInteractive(cells: NotebookCell[], textDocument: TextDocument, controller: NotebookController) {
        cells.forEach((cell) => {
            this.executeCell(cell, controller, textDocument);
        });
    }

    private createController(id: string, view: string) {
        const controller = notebooks.createNotebookController(id, view, 'Kusto', this.execute.bind(this));
        controller.supportedLanguages = ['kusto'];
        controller.supportsExecutionOrder = true;
        controller.description = 'Execute Kusto Queries';
        return controller;
    }
    public execute(cells: NotebookCell[], _notebook: NotebookDocument, controller: NotebookController) {
        cells.forEach((cell) => {
            this.executeCell(cell, controller);
        });
    }

    private async executeCell(
        cell: NotebookCell,
        controller: NotebookController,
        textDocument?: TextDocument
    ): Promise<void> {
        const task = controller.createNotebookCellExecution(cell);
        const client = await Client.create(textDocument || cell.notebook);
        if (!client) {
            task.end(false);
            return;
        }
        const edit = new WorkspaceEdit();
        const cellEdit = NotebookEdit.updateCellMetadata(cell.index, { statusMessage: '' });
        edit.set(cell.notebook.uri, [cellEdit]);
        // const promise = workspace.applyEdit(edit);
        task.start(Date.now());
        task.clearOutput();
        let success = false;
        try {
            const results = await Promise.race([
                createPromiseFromToken(task.token, { action: 'resolve', value: undefined }),
                client.execute(cell.document.getText())
            ]);
            if (task.token.isCancellationRequested || !results) {
                return;
            }
            success = true;
            // promise.then(() => {
            //     const rowCount = results.primaryResults.length ? results.primaryResults[0]._rows.length : undefined;
            //     if (rowCount) {
            //         const edit = new WorkspaceEdit();
            //         const nbEdit = NotebookEdit.updateCellMetadata(cell.index, {
            //             statusMessage: `${rowCount} records`
            //         });
            //         edit.set(cell.notebook.uri, [nbEdit]);
            //         workspace.applyEdit(edit);
            //     }
            // });

            // Dump the primary results table from the list of tables.
            // We already have that information as a seprate property name `primaryResults`.
            // This will reduce the amount of JSON (save) in knb file.
            if (!Array.isArray(results.primaryResults) || results.primaryResults.length === 0) {
                results.primaryResults = results.tables.filter((item) => item.name === 'PrimaryResult');
            }
            const chartType = getChartType(results);
            results.tables = results.tables.filter((item) => item.name !== 'PrimaryResult');
            results.tableNames = results.tableNames.filter((item) => item !== 'PrimaryResult');

            const outputItems: NotebookCellOutputItem[] = [];
            if (chartType && chartType !== 'table') {
                outputItems.push(NotebookCellOutputItem.json(results, 'application/vnd.kusto.result.viz+json'));
            } else {
                outputItems.push(NotebookCellOutputItem.json(results, 'application/vnd.kusto.result+json'));
            }
            task.appendOutput(new NotebookCellOutput(outputItems));
        } catch (ex) {
            console.error('Failed to execute query', ex);
            if (!ex) {
                const error = new Error('Failed to execute query');
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(error)]));
            } else if (ex instanceof Error && ex) {
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(ex)]));
            } else if (ex && typeof ex === 'object' && 'message' in ex) {
                const innerError =
                    'innererror' in ex &&
                    typeof ex.innererror === 'object' &&
                    ex.innererror &&
                    'message' in ex.innererror &&
                    ex.innererror.message
                        ? ` (${ex.innererror.message})`
                        : '';
                const message = `${ex.message}${innerError}`;
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error({ message, name: '' })]));
            } else {
                const error = new Error('Failed to execute query');
                task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(error)]));
            }
        } finally {
            task.end(success, Date.now());
        }
    }
}
