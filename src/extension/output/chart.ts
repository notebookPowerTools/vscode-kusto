import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import { NotebookCellOutput, NotebookCellOutputItem } from 'vscode';

export function getChartType(results: KustoResponseDataSet): string | undefined {
    if (results.tables.length === 0) {
        return;
    }
    const queryPropertiesTable = results.tables.find((item) => item.name === '@ExtendedProperties');
    if (!queryPropertiesTable) {
        return;
    }
    if (queryPropertiesTable._rows.length === 0) {
        return;
    }
    /**
    [1, "Visualization", "{"Visualization":"piechart","Title":null,"XColumn"…"]
    */
    if (queryPropertiesTable._rows[0][1] !== 'Visualization') {
        return;
    }
    try {
        const data = JSON.parse(queryPropertiesTable._rows[0][2]);
        return data.Visualization;
    } catch {
        return;
    }
}

export function getCellOutput(result: KustoResponseDataSet): NotebookCellOutput {
    const chartType = getChartType(result);
    const outputItems: NotebookCellOutputItem[] = [];
    if (chartType && chartType !== 'table') {
        outputItems.push(new NotebookCellOutputItem('application/vnd.kusto.result.viz+json', result));
    } else {
        outputItems.push(new NotebookCellOutputItem('application/vnd.kusto.result+json', result));
    }
    return new NotebookCellOutput(outputItems);
}
