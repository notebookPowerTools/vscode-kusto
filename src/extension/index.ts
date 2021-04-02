// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ContentProvider } from './content/provider';
import { KernelProvider } from './kernel/provider';
import { registerDisposableRegistry } from './utils';
import { LanguageClient } from 'vscode-languageclient/node';
import { ExtensionContext } from 'vscode';
import { initializeCache } from './cache';
import { ClusterTreeView } from './activityBar/clusterView';
import { registerNotebookConnection } from './kernel/notebookConnection';
import { initialize } from './languageServer';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    initializeCache(context.globalState);
    KernelProvider.register();
    registerDisposableRegistry(context);
    ContentProvider.register();
    // CompletionProvider.register();
    // DiagnosticProvider.register();
    ClusterTreeView.register();
    registerNotebookConnection();
    initialize(context);
}

export async function deactivate(): Promise<void> {
    if (!client) {
        return;
    }
    return client.stop();
}
