// This must be on top, do not change. Required by webpack.
// eslint-disable-next-line no-unused-vars
declare let __webpack_public_path__: string;
declare const scriptUrl: string;
const getPublicPath = () => {
    return new URL(scriptUrl.replace(/[^/]+$/, '')).toString();
};

// eslint-disable-next-line prefer-const
__webpack_public_path__ = getPublicPath();
// This must be on top, do not change. Required by webpack.

import type { NotebookOutputEventParams } from 'vscode-notebook-renderer';
import type { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import type * as PlotlyType from 'plotly.js';
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-var-requires
const Plotly: typeof PlotlyType = require('plotly.js/dist/plotly');
// const Plotly: typeof PlotlyType = require('plotly.js');

const notebookApi = acquireNotebookRendererApi('kusto-notebook-renderer-viz');

notebookApi.onDidCreateOutput(renderOutput);

/**
 * Called from renderer to render output.
 * This will be exposed as a public method on window for renderer to render output.
 */
function renderOutput(request: NotebookOutputEventParams) {
    try {
        request.element.style.backgroundColor = 'white';
        renderChart(request.value as any, request.element);
    } catch (ex) {
        console.error(`Failed to render output ${JSON.stringify(request.value)}`, ex);
    }
}

function getChartType(
    results: KustoResponseDataSet
):
    | { type: 'pie'; title: string }
    | { type: 'time'; title: string }
    | { type: 'bar'; title: string; orientation: 'v' | 'h' }
    | undefined {
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
    if (
        queryPropertiesTable._rows[0][1] !== 'Visualization' &&
        // This is how we get Visualization for AppInsights.
        !(queryPropertiesTable._rows[0][0] as string).includes('Visualization')
    ) {
        return;
    }
    let data: { Visualization: string; Title: string } | undefined;
    try {
        data = JSON.parse(queryPropertiesTable._rows[0][2]);
    } catch {
        //
    }
    try {
        data = data || JSON.parse(queryPropertiesTable._rows[0][0]);
    } catch {
        //
    }
    if (!data) {
        return;
    }
    try {
        if (data.Visualization === 'piechart') {
            return { type: 'pie', title: data.Title || '' };
        }
        if (data.Visualization === 'barchart') {
            return { type: 'bar', title: data.Title || '', orientation: 'h' };
        }
        if (data.Visualization === 'timechart') {
            return { type: 'time', title: data.Title || '' };
        }
        if (data.Visualization === 'columnchart') {
            return { type: 'bar', title: data.Title || '', orientation: 'v' };
        }
    } catch {
        return;
    }
}
function renderChart(results: KustoResponseDataSet, ele: HTMLElement) {
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
        Plotly.newPlot(ele, [pieData], layout);
    }
    if (chartType.type === 'time') {
        const sortedData = results.primaryResults[0]._rows.slice();
        const dateColumnIndex = results.primaryResults[0].columns.find((col) => col.type === 'datetime')?.ordinal || 0;
        const timeColumnIndex = results.primaryResults[0].columns.find((col) => col.type === 'timespan')?.ordinal || 0;
        // In case we have something that represents an hour.
        const hourColumnIndex = results.primaryResults[0].columns.find((col) => col.type === 'real')?.ordinal || 0;
        if (dateColumnIndex >= 0) {
            sortedData.sort((a, b) => new Date(a[dateColumnIndex]).getTime() - new Date(b[dateColumnIndex]).getTime());
        }
        if (timeColumnIndex >= 0) {
            sortedData.sort(
                (a, b) =>
                    new Date(`0001-01-01T${a[dateColumnIndex]}`).getTime() -
                    new Date(`0001-01-01T${b[dateColumnIndex]}`).getTime()
            );
        }
        if (hourColumnIndex >= 0) {
            sortedData.sort((a, b) => a[dateColumnIndex] - b[dateColumnIndex]);
        }
        if (timeColumnIndex === -1 && dateColumnIndex === -1) {
            console.error(
                `No datetime nor timespan column ${results.primaryResults[0].columns.map((col) => col.type)}`
            );
            return;
        }
        // Do we have multiple time series?
        if (results.primaryResults[0].columns.length > 2) {
            const seriesValues = new Map<string, { x: any[]; y: any[] }>();
            const columnIndexWithSeriesName =
                results.primaryResults[0].columns.find((col) => col.type === 'string')?.ordinal || 1;
            const lastColumn = results.primaryResults[0].columns[results.primaryResults[0].columns.length - 1];
            const columnIndexWithValue =
                lastColumn.type === 'long'
                    ? lastColumn.ordinal
                    : results.primaryResults[0].columns.find(
                          (col) =>
                              col.type !== 'string' &&
                              col.type !== 'datetime' &&
                              col.type !== 'timespan' &&
                              col.type !== 'real'
                      )?.ordinal || 2;
            const dateHourOrTimeColumnIndex =
                dateColumnIndex >= 0 ? dateColumnIndex : hourColumnIndex >= 0 ? hourColumnIndex : timeColumnIndex;
            sortedData.forEach((row) => {
                const seriesName = row[columnIndexWithSeriesName];
                const datetime = row[dateHourOrTimeColumnIndex];
                const value = row[columnIndexWithValue];
                const series = seriesValues.get(seriesName) || { x: [], y: [] };
                series.x.push(datetime);
                series.y.push(value);
                seriesValues.set(seriesName, series);
            });
            const plotData: Partial<Plotly.ScatterData>[] = [];
            seriesValues.forEach((values, series) => {
                const scatterData: Partial<Plotly.ScatterData> = {
                    type: 'scatter',
                    name: series,
                    x: values.x,
                    y: values.y
                } as any;
                plotData.push(scatterData);
            });
            console.error(JSON.stringify(plotData));
            Plotly.newPlot(ele, plotData, layout);
        } else {
            const scatterData: Partial<Plotly.ScatterData> = {
                type: 'scatter',
                x: sortedData.map((item) => item[0]),
                y: sortedData.map((item) => item[1])
            } as any;
            Plotly.newPlot(ele, [scatterData], layout);
        }
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
        Plotly.newPlot(ele, [barData], layout);
    }
}
