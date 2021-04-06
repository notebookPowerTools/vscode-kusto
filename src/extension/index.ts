import { ContentProvider } from './content/provider';
import { KernelProvider } from './kernel/provider';
import { registerDisposableRegistry } from './utils';
import { LanguageClient } from 'vscode-languageclient/node';
import { ExtensionContext } from 'vscode';
import { initializeCache } from './cache';
import { ClusterTreeView } from './activityBar/clusterView';
import { registerNotebookConnection } from './kusto/connections/notebookConnection';
import { initialize } from './languageServer';
import { monitorJupyterCells } from './languageServer/jupyterNotebook';
import { registerConfigurationListener } from './configuration';
import { initializeConnectionStorage } from './kusto/connections/storage';
import { registerInteractiveExperience } from './kernel/interactive';

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
    initializeConnectionStorage(context);
    initializeCache(context.globalState);
    KernelProvider.register();
    registerDisposableRegistry(context);
    ContentProvider.register();
    ClusterTreeView.register();
    registerNotebookConnection();
    registerConfigurationListener(context);
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
