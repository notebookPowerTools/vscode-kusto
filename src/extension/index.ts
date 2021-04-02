import { ContentProvider } from './content/provider';
import { KernelProvider } from './kernel/provider';
import { registerDisposableRegistry } from './utils';
import { LanguageClient } from 'vscode-languageclient/node';
import { ExtensionContext } from 'vscode';
import { initializeCache } from './cache';
import { ClusterTreeView } from './activityBar/clusterView';
import { registerNotebookConnection } from './kernel/notebookConnection';
import { initialize } from './languageServer';
import { monitorJupyterCells } from './languageServer/jupyterNotebook';
import { registerInteractiveExperience } from './interactive';

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
    monitorJupyterCells();
    registerInteractiveExperience();
}

export async function deactivate(): Promise<void> {
    if (!client) {
        return;
    }
    return client.stop();
}
