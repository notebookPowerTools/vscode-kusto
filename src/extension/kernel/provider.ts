import {
    NotebookDocument,
    Uri,
    notebooks,
    NotebookCell,
    NotebookCellOutput,
    NotebookCellOutputItem,
    TextEditor,
    workspace,
    WorkspaceEdit,
    NotebookController,
    ExtensionContext,
    Disposable
} from 'vscode';
import { Client } from '../kusto/client';
import { getChartType } from '../output/chart';
import { createPromiseFromToken } from '../utils';

export class KernelProvider {
    private static interactiveKernel?: InteractiveKernel;

    static get InteractiveKernel() {
        return KernelProvider.interactiveKernel;
    }

    public static register(context: ExtensionContext) {
        const kernel = new Kernel();
        // const interactiveKernel = new InteractiveKernel();
        // KernelProvider.interactiveKernel = interactiveKernel;
        context.subscriptions.push(kernel);
    }
}

export class Kernel extends Disposable {
    controller: NotebookController;
    constructor() {
        super(() => {
            this.dispose();
        });
        this.controller = notebooks.createNotebookController(
            'kusto',
            'kusto-notebook',
            'Kusto',
            this.execute.bind(this),
            []
        );
        this.controller.supportedLanguages = ['kusto'];
        this.controller.supportsExecutionOrder = true;
        this.controller.description = 'Execute Kusto Queries';
    }

    dispose() {
        this.controller.dispose();
    }

    public execute(cells: NotebookCell[], notebook: NotebookDocument, controller: NotebookController) {
        if (isKustoInteractive(notebook)) {
            return;
        }

        // states per document

        cells.forEach((cell) => {
            this.executeCell(cell, controller);
        });
    }

    private async executeCell(cell: NotebookCell, controller: NotebookController): Promise<void> {
        const task = controller.createNotebookCellExecution(cell);
        const client = await Client.create(cell.notebook);
        if (!client) {
            task.end(false);
            return;
        }
        const edit = new WorkspaceEdit();
        edit.replaceNotebookCellMetadata(cell.notebook.uri, cell.index, { statusMessage: '' });
        const promise = workspace.applyEdit(edit);
        task.start(Date.now());
        task.clearOutput();
        let success = false;
        try {
            const results = await Promise.race([
                createPromiseFromToken(task.token, { action: 'resolve', value: undefined }),
                client.execute(cell.document.getText())
            ]);
            console.log(results);
            if (task.token.isCancellationRequested || !results) {
                return task.end(success);
            }
            success = true;
            promise.then(() => {
                const rowCount = results.primaryResults.length ? results.primaryResults[0]._rows.length : undefined;
                if (rowCount) {
                    const edit = new WorkspaceEdit();
                    edit.replaceNotebookCellMetadata(cell.notebook.uri, cell.index, {
                        statusMessage: `${rowCount} records`
                    });
                    workspace.applyEdit(edit);
                }
            });

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
            const error: Error = ex instanceof Error && ex ? ex : new Error('Failed to execute query');
            task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(error)]));
        } finally {
            task.end(success, Date.now());
        }
    }
}

export class InteractiveKernel extends Disposable {
    controller: NotebookController;
    constructor() {
        super(() => {
            this.dispose();
        });

        this.controller = notebooks.createNotebookController(
            'kusto-interactive',
            'kusto-interactive',
            'Kusto Interactive',
            this.execute.bind(this),
            []
        );
        this.controller.supportedLanguages = ['kusto'];
        this.controller.description = 'Execute Kusto Queries in Interactive Window';
    }

    dispose() {
        this.controller.dispose();
    }

    public execute(_cells: NotebookCell[], _document: NotebookDocument, _controller: NotebookController) {
        //
    }

    public async executeInteractiveSelection(textEditor: TextEditor): Promise<void> {
        const interactiveNotebook = workspace.notebookDocuments.find(isKustoInteractive);
        if (!interactiveNotebook) {
            return;
        }

        if (!this.controller) {
            return;
        }

        const source = textEditor.document.getText(textEditor.selection);
        let edit = new WorkspaceEdit();
        // edit.replaceNotebookCells(interactiveNotebook.uri, interactiveNotebook.cellCount, 0, [
        //     new NotebookCellData(NotebookCellKind.Code, source.trim(), 'kusto', [], new NotebookCellMetadata())
        // ]);
        await workspace.applyEdit(edit);
        const cell = interactiveNotebook.cellAt[interactiveNotebook.cellCount - 1];
        const task = this.controller.createNotebookCellExecution(cell);
        if (!task) {
            return;
        }
        const client = await Client.create(textEditor.document);
        if (!client) {
            task.end(false);
            return;
        }
        edit = new WorkspaceEdit();
        edit.replaceNotebookCellMetadata(cell.notebook.uri, cell.index, { statusMessage: '' });
        const promise = workspace.applyEdit(edit);
        task.start(Date.now());
        task.clearOutput();
        let success = false;
        try {
            const results = await Promise.race([
                createPromiseFromToken(task.token, { action: 'resolve', value: undefined }),
                client.execute(source)
            ]);
            console.log(results);
            if (task.token.isCancellationRequested || !results) {
                return task.end(success);
            }
            success = true;
            promise.then(() => {
                const rowCount = results.primaryResults.length ? results.primaryResults[0]._rows.length : undefined;
                if (rowCount) {
                    const edit = new WorkspaceEdit();
                    edit.replaceNotebookCellMetadata(cell.notebook.uri, cell.index, {
                        statusMessage: `${rowCount} records`
                    });
                    workspace.applyEdit(edit);
                }
            });

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
            const error: Error = ex instanceof Error && ex ? ex : new Error('Failed to execute query');
            task.appendOutput(new NotebookCellOutput([NotebookCellOutputItem.error(error)]));
        } finally {
            task.end(success, Date.now());
        }
    }
}

export function isJupyterNotebook(document: NotebookDocument) {
    return document.notebookType === 'jupyter-notebook';
}
export function isKustoNotebook(document: NotebookDocument) {
    return document.notebookType === 'kusto-notebook';
}
export function isKustoInteractive(document: Uri | NotebookDocument) {
    return 'notebookType' in document
        ? document.notebookType === 'kusto-interactive'
        : document.fsPath.toLowerCase().endsWith('.knb-interactive');
}
