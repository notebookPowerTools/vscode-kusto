import { format } from 'util';
import {
    notebook,
    NotebookCell,
    NotebookCellData,
    NotebookCellKind,
    NotebookCellMetadata,
    NotebookCellOutput,
    NotebookCellOutputItem,
    NotebookCellRange,
    NotebookDocument,
    NotebookKernel,
    TextEditor,
    Uri,
    workspace,
    WorkspaceEdit
} from 'vscode';
import { Client } from '../kusto/client';
import { getChartType } from '../output/chart';
import { createPromiseFromToken } from '../utils';
import { isKustoInteractive } from './provider';

export class Kernel implements NotebookKernel {
    // todo@API make this mandatory?
    public readonly id = 'kusto';

    public readonly label = 'Kusto';
    public readonly description = 'Execute Kusto Queries';
    public readonly detail = '';
    public readonly isPreferred: boolean = true;
    public readonly preloads: Uri[] = [];
    public readonly supportedLanguages?: string[] = ['kusto'];
    private static interactiveKernel?: Kernel;
    public static get InteractiveKernel() {
        return Kernel.interactiveKernel;
    }
    constructor(public readonly document: NotebookDocument) {
        if (isKustoInteractive(document)) {
            Kernel.interactiveKernel = this;
        }
    }
    public async executeCellsRequest(document: NotebookDocument, ranges: NotebookCellRange[]): Promise<void> {
        const cells = document.cells.filter(
            (cell) =>
                cell.kind === NotebookCellKind.Code &&
                ranges.some((range) => range.start <= cell.index && cell.index < range.end)
        );
        await Promise.all(cells.map(this.executeCell.bind(this)));
    }
    public async executeInteractiveSelection(textEditor: TextEditor): Promise<void> {
        const source = textEditor.document.getText(textEditor.selection);
        let edit = new WorkspaceEdit();
        edit.replaceNotebookCells(this.document.uri, this.document.cells.length, 0, [
            new NotebookCellData(
                NotebookCellKind.Code,
                source.split('\n').filter((item) => item.trim().length)[0],
                'kusto',
                [],
                new NotebookCellMetadata()
            )
        ]);
        await workspace.applyEdit(edit);
        const cell = this.document.cells[this.document.cells.length - 1];
        const task = notebook.createNotebookCellExecutionTask(cell.notebook.uri, cell.index, this.id);
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

            const chartType = getChartType(results);
            // Dump the primary results table from the list of tables.
            // We already have that information as a seprate property name `primaryResults`.
            // This will reduce the amount of JSON (save) in knb file.
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
            task.end({ duration: Date.now() - startTime, success });
        }
    }
    private async executeCell(cell: NotebookCell): Promise<void> {
        const task = notebook.createNotebookCellExecutionTask(cell.notebook.uri, cell.index, this.id);
        if (!task) {
            return;
        }
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

            const chartType = getChartType(results);
            // Dump the primary results table from the list of tables.
            // We already have that information as a seprate property name `primaryResults`.
            // This will reduce the amount of JSON (save) in knb file.
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
            task.end({ duration: Date.now() - startTime, success });
        }
    }
}
