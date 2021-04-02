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
import * as deck from '@deck.gl/core';
import * as layers from '@deck.gl/layers';
import * as luma from '@luma.gl/core';
import * as fluentui from '@fluentui/react';
import * as vega from 'vega';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Explorer, Explorer_Class, use } from '@msrvida/sanddance-explorer';

import '@msrvida/sanddance-explorer/dist/css/sanddance-explorer.css';
import './sanddance.css';
import { getTabularData } from './utils';

fluentui.initializeIcons();

use(fluentui, React, ReactDOM, vega as any, deck, layers, luma);

const notebookApi = acquireNotebookRendererApi('kusto-notebook-renderer-sand');

notebookApi.onDidCreateOutput(renderOutput);

function renderOutput(request: NotebookOutputEventParams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mimeString = request.mime || (request as any).mimeType;
    try {
        console.log('request Sanddance', request);
        const data = getTabularData(request.value);
        if (!data) {
            return;
        }
        const explorerProps = {
            logoClickUrl: 'https://microsoft.github.io/SandDance/',

            mounted: (explorer: Explorer_Class) => {
                console.log('sanddance loaded', data.data);
                explorer.load(JSON.parse(JSON.stringify(data.data)));
            }
        };

        console.log('sanddance renderered', data.data);
        request.element.style.backgroundColor = 'white';
        request.element.style.height = '800px';
        ReactDOM.render(React.createElement(Explorer, explorerProps), request.element);
    } catch (ex) {
        console.error(`Failed to render mime type ${mimeString}`, ex);
    }
}
