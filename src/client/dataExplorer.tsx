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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import DataExplorer from '@nteract/data-explorer';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import type { NotebookOutputEventParams } from 'vscode-notebook-renderer';
import { getTabularData } from './utils';

const notebookApi = acquireNotebookRendererApi('kusto-notebook-renderer-dx');

notebookApi.onDidCreateOutput(renderOutput);

/**
 * Called from renderer to render output.
 * This will be exposed as a public method on window for renderer to render output.
 */
function renderOutput(request: NotebookOutputEventParams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mimeString = request.mime || (request as any).mimeType;
    try {
        console.log('request', request);
        const data = getTabularData(request.value);
        if (!data) {
            return;
        }
        request.element.style.backgroundColor = 'white';
        ReactDOM.render(React.createElement(DataExplorer as any, { data }, null), request.element);
    } catch (ex) {
        console.error(`Failed to render mime type ${mimeString}`, ex);
    }
}
