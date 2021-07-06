import type { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import { NotebookCellOutput } from 'vscode';

export function getTableOutput(_results: KustoResponseDataSet): NotebookCellOutput | undefined {
    return;
}
