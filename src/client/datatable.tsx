console.error(`Start render output table 1111`);
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

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

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import type { NotebookOutputEventParams } from 'vscode-notebook-renderer';
import type { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import type { KustoResultTable } from 'azure-kusto-data/source/models';
import { hasDataTable } from './utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import ReactJson from 'react-json-view'; // eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AgGridReact } from 'ag-grid-react';

import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-balham.css';
import { CellDoubleClickedEvent, ColDef, RowSelectedEvent } from 'ag-grid-community';

const notebookApi = acquireNotebookRendererApi('kusto-notebook-renderer-table');

notebookApi.onDidCreateOutput(renderOutput);

/**
 * Called from renderer to render output.
 * This will be exposed as a public method on window for renderer to render output.
 */
function renderOutput(request: NotebookOutputEventParams) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderDataTable(request.value as any, request.element);
    } catch (ex) {
        console.error(`Failed to render output ${JSON.stringify(request.value)}`, ex);
    }
}
const columnDataType = new Map<string, string>();
function createAgGridData(resultTable: KustoResultTable) {
    const gridData = {
        columnDefs: [] as ColDef[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rowData: [] as { [idx: string]: any }[]
    };
    columnDataType.clear();
    const columns = resultTable.columns;
    for (const col of columns) {
        gridData.columnDefs.push({
            headerName: col.name || '',
            field: col.name || '',
            sortable: true,
            // type: col.type || 'string',
            filter: true
        });
        columnDataType.set(col.name || '', col.type || '');
    }

    for (const row of resultTable._rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowDatum: { [idx: string]: any } = {};
        for (const col of columns) {
            rowDatum[col.name || ''] = row[col.ordinal];
        }
        gridData.rowData.push(rowDatum);
    }

    return gridData;
}

function renderDataTable(results: KustoResponseDataSet, ele: HTMLElement) {
    if (!hasDataTable(results)) {
        console.error('No data table');
        return;
    }
    const data = createAgGridData(results.primaryResults[0]);
    ReactDOM.render(React.createElement(DataTable, data, null), ele);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DataTable(props: { columnDefs: any; rowData: any }) {
    function onCellDoubleClicked(e: CellDoubleClickedEvent) {
        if (columnDataType.get(e.colDef.field || '') === 'dynamic' && e.colDef.field) {
            try {
                const json = JSON.parse(e.data[e.colDef.field]);
                console.info(`Displaying details for ${e.colDef.field}`);
                setDetailsField(e.colDef.field);
                setDetailsJson(json);
                displayDetails(true);
            } catch (ex) {
                setDetailsJson(undefined);
                console.error(
                    `Failed to parse details into JSON for ${e.colDef.field} with data ${e.data[e.colDef.field]}`,
                    ex
                );
            }
        }
    }
    function onRowSelected(e: RowSelectedEvent) {
        if (!detailsVisible || !detailsField) {
            console.info(`Nothing to render`);
            return;
        }
        try {
            const json = JSON.parse(e.data[detailsField]);
            console.info(`Displaying details for ${detailsField}`);
            setDetailsJson(json);
        } catch (ex) {
            setDetailsJson(undefined);
        }
    }
    const [detailsVisible, displayDetails] = React.useState<boolean>(false);
    const [detailsField, setDetailsField] = React.useState<string | undefined>(undefined);
    const [detailsJson, setDetailsJson] = React.useState<any>(undefined);
    return (
        <div className="ag-theme-balham" style={{ width: '100%', backgroundColor: 'white' }}>
            <AgGridReact
                domLayout="autoHeight"
                pagination={true}
                paginationPageSize={10}
                defaultColDef={{ resizable: true, filter: true, sortable: true, floatingFilter: true }}
                columnDefs={props.columnDefs}
                rowData={props.rowData}
                rowSelection="multiple"
                rowMultiSelectWithClick={false}
                onCellDoubleClicked={onCellDoubleClicked}
                onRowSelected={onRowSelected}
            ></AgGridReact>
            {detailsVisible && detailsJson && (
                <ReactJson src={detailsJson} displayDataTypes={false} displayObjectSize={false} />
            )}
        </div>
    );
}
