import type { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import type * as PlotlyType from 'plotly.js';
// // eslint-disable-next-line @typescript-eslint/no-var-requires
const Plotly: typeof PlotlyType = require('plotly.js/dist/plotly');
// const Plotly: typeof PlotlyType = require('plotly.js');

function getChartType(
    results: KustoResponseDataSet
): { type: 'pie'; title: string } | { type: 'bar'; title: string; orientation: 'v' | 'h' } | undefined {
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
        if (data.Visualization === 'piechart') {
            return { type: 'pie', title: data.Title || '' };
        }
        if (data.Visualization === 'barchart') {
            return { type: 'bar', title: data.Title || '', orientation: 'h' };
        }
        if (data.Visualization === 'columnchart') {
            return { type: 'bar', title: data.Title || '', orientation: 'v' };
        }
    } catch {
        return;
    }
}
export function renderPieChart(results: KustoResponseDataSet, ele: HTMLElement) {
    const chartType = getChartType(results);
    if (!chartType) {
        console.error('Not a pie chart');
        return;
    }
    const layout = {
        title: chartType.title,
        autosize: true
    };
    if (chartType.type === 'pie') {
        const pieData: Partial<Plotly.PieData> = {
            type: chartType.type,
            textinfo: 'label+value',
            hoverinfo: 'all',
            labels: results.primaryResults[0]._rows.map((item) => item[0]),
            values: results.primaryResults[0]._rows.map((item) => item[1])
        } as any;
        console.error('Plotting PIE Data');
        console.error(JSON.stringify(pieData));
        console.error(JSON.stringify(layout));
        Plotly.newPlot(ele, [pieData], layout);
    }
    if (chartType.type === 'bar') {
        const labels = results.primaryResults[0]._rows.map((item) => item[0]);
        const values = results.primaryResults[0]._rows.map((item) => item[1]);
        const barData: Partial<Plotly.PlotData> = {
            type: chartType.type,
            orientation: chartType.orientation,
            textinfo: 'label+value',
            hoverinfo: 'all',
            x: chartType.orientation === 'v' ? labels : values,
            y: chartType.orientation === 'v' ? values : labels
        } as any;
        console.error('Plotting PIE Data');
        console.error(JSON.stringify(barData));
        console.error(JSON.stringify(layout));
        Plotly.newPlot(ele, [barData], layout);
    }
}
