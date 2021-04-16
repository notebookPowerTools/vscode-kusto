import { format } from 'util';
import {
    NotebookDocument,
    Uri,
    notebook,
    NotebookCell,
    NotebookCellData,
    NotebookCellKind,
    NotebookCellMetadata,
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
        const interactiveKernel = new InteractiveKernel();
        KernelProvider.interactiveKernel = interactiveKernel;

        context.subscriptions.push(kernel, interactiveKernel);
    }
}

export class Kernel extends Disposable {
    controller: NotebookController;
    constructor() {
        super(() => {
            this.dispose();
        });
        this.controller = notebook.createNotebookController({
            id: 'kusto',
            label: 'Kusto',
            description: 'Execute Kusto Queries',
            selector: { viewType: 'kusto-notebook' },
            supportedLanguages: ['kusto'],
            executeHandler: this.execute.bind(this)
        });
        this.controller.interruptHandler = this.interrupt;
        this.controller.isPreferred = true;
    }

    dispose() {
        this.controller.dispose();
    }

    interrupt() {}

    public execute(cells: NotebookCell[], controller: NotebookController) {
        const document = cells[0]?.notebook;

        if (!document) {
            return;
        }

        if (isKustoInteractive(document)) {
            return;
        }

        // states per document

        cells.forEach((cell) => {
            this.executeCell(cell, controller);
        });
    }

    private async executeCell(cell: NotebookCell, controller: NotebookController): Promise<void> {
        const task = controller.createNotebookCellExecutionTask(cell);
        const client = await Client.create(cell.notebook);
        if (!client) {
            task.end();
            return;
        }
        const startTime = Date.now();
        const edit = new WorkspaceEdit();
        edit.replaceNotebookCellMetadata(cell.notebook.uri, cell.index, cell.metadata.with({ statusMessage: '' }));
        const promise = workspace.applyEdit(edit);
        task.start({ startTime });
        task.clearOutput();
        let success = false;
        try {
            const results = await Promise.race([
                createPromiseFromToken(task.token, { action: 'resolve', value: undefined }),
                client.execute(cell.document.getText())
            ]);
            console.log(results);
            if (task.token.isCancellationRequested || !results) {
                return task.end();
            }
            success = true;
            promise.then(() => {
                const rowCount = results.primaryResults.length ? results.primaryResults[0]._rows.length : undefined;
                if (rowCount) {
                    const edit = new WorkspaceEdit();
                    edit.replaceNotebookCellMetadata(
                        cell.notebook.uri,
                        cell.index,
                        cell.metadata.with({ statusMessage: `${rowCount} records` })
                    );
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
                outputItems.push(new NotebookCellOutputItem('application/vnd.kusto.result.viz+json', results));
            } else {
                outputItems.push(new NotebookCellOutputItem('application/vnd.kusto.result+json', results));
            }
            task.appendOutput(new NotebookCellOutput(outputItems));
        } catch (ex) {
            const error: Error | undefined = ex;
            const data = {
                ename: error?.name || 'Failed to execute query',
                evalue: error?.message || '',
                traceback: [error?.stack || format(ex)]
            };

            task.appendOutput(
                new NotebookCellOutput([new NotebookCellOutputItem('application/x.notebook.error-traceback', data)])
            );
        } finally {
            task.end({ endTime: Date.now(), success });
        }
    }
}

export class InteractiveKernel extends Disposable {
    controller: NotebookController;
    constructor() {
        super(() => {
            this.dispose();
        });
        this.controller = notebook.createNotebookController({
            id: 'kusto-interactive',
            label: 'Kusto Interactive',
            description: 'Execute Kusto Queries in Interactive Window',
            selector: { viewType: 'kusto-interactive' },
            supportedLanguages: ['kusto'],
            executeHandler: this.execute
        });
        this.controller.isPreferred = true;
    }

    dispose() {
        this.controller.dispose();
    }

    public execute(cells: NotebookCell[], controller: NotebookController) {}

    public async executeInteractiveSelection(textEditor: TextEditor): Promise<void> {
        const interactiveNotebook = notebook.notebookDocuments.find(isKustoInteractive);
        if (!interactiveNotebook) {
            return;
        }

        if (!this.controller) {
            return;
        }

        const source = textEditor.document.getText(textEditor.selection);
        let edit = new WorkspaceEdit();
        edit.replaceNotebookCells(interactiveNotebook.uri, interactiveNotebook.cellCount, 0, [
            new NotebookCellData(NotebookCellKind.Code, source.trim(), 'kusto', [], new NotebookCellMetadata())
        ]);
        await workspace.applyEdit(edit);
        const cell = interactiveNotebook.cellAt[interactiveNotebook.cellCount - 1];
        const task = this.controller.createNotebookCellExecutionTask(cell);
        if (!task) {
            return;
        }
        const client = await Client.create(textEditor.document);
        if (!client) {
            task.end();
            return;
        }
        const startTime = Date.now();
        edit = new WorkspaceEdit();
        edit.replaceNotebookCellMetadata(cell.notebook.uri, cell.index, cell.metadata.with({ statusMessage: '' }));
        const promise = workspace.applyEdit(edit);
        task.start({ startTime });
        task.clearOutput();
        let success = false;
        try {
            const results = await Promise.race([
                createPromiseFromToken(task.token, { action: 'resolve', value: undefined }),
                client.execute(source)
            ]);
            console.log(results);
            if (task.token.isCancellationRequested || !results) {
                return task.end();
            }
            success = true;
            promise.then(() => {
                const rowCount = results.primaryResults.length ? results.primaryResults[0]._rows.length : undefined;
                if (rowCount) {
                    const edit = new WorkspaceEdit();
                    edit.replaceNotebookCellMetadata(
                        cell.notebook.uri,
                        cell.index,
                        cell.metadata.with({ statusMessage: `${rowCount} records` })
                    );
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
                outputItems.push(new NotebookCellOutputItem('application/vnd.kusto.result.viz+json', results));
            } else {
                outputItems.push(new NotebookCellOutputItem('application/vnd.kusto.result+json', results));
            }
            task.appendOutput(new NotebookCellOutput(outputItems));
        } catch (ex) {
            const error: Error = ex;
            const data = {
                ename: ex.message || 'Failed to execute query',
                evalue: ex.evalue || ex['@type'] || '',
                traceback: [error.stack || format(ex)]
            };

            task.appendOutput(
                new NotebookCellOutput([new NotebookCellOutputItem('application/x.notebook.error-traceback', data)])
            );
        } finally {
            task.end({ endTime: Date.now(), success });
        }
    }
}

export function isJupyterNotebook(document: NotebookDocument) {
    return document.viewType === 'jupyter-notebook';
}
export function isKustoNotebook(document: NotebookDocument) {
    return document.viewType === 'kusto-notebook';
}
export function isKustoInteractive(document: Uri | NotebookDocument) {
    return 'viewType' in document
        ? document.viewType === 'kusto-interactive'
        : document.fsPath.toLowerCase().endsWith('.knb-interactive');
}
