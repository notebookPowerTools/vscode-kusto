import { KustoResponseDataSet } from 'azure-kusto-data/source/response';

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
