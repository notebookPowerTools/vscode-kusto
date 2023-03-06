import { ContentProvider } from './content/provider';
import { initialize as initializeConstants } from './constants';
import { KernelProvider } from './kernel/provider';
import { registerDisposableRegistry } from './utils';
import { LanguageClient } from 'vscode-languageclient/node';
import { ExtensionContext } from 'vscode';
import { initializeCache } from './cache';
import { ClusterTreeView } from './activityBar/clusterView';
import { registerNotebookConnection } from './kusto/connections/notebookConnection';
import { initialize as initializeLanguageService } from './languageServer';
import { monitorJupyterCells } from './languageServer/jupyterNotebook';
import { registerConfigurationListener } from './configuration';
import { initializeConnectionStorage } from './kusto/connections/storage';
import { registerInteractiveExperience } from './interactive/interactive';
import { registerExportCommand } from './content/export';
import { StatusBarProvider } from './kernel/statusbar';
import { AzureAuthenticatedConnection } from './kusto/connections/azAuth';
import KustoClient from 'azure-kusto-data/source/client';
import { registerConnection } from './kusto/connections/baseConnection';
import { AppInsightsConnection } from './kusto/connections/appInsights';
import { CellCodeLensProvider } from './interactive/cells';
import { KqlContentProvider } from './content/kqlProvider';

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
    initializeConstants(context.extension.packageJSON.enableProposedApi); // In browser context dont use proposed API, try to always use stable stuff...
    initializeLanguageService(context);
    initializeConnectionStorage(context);
    registerConnection('azAuth', AzureAuthenticatedConnection, (info) =>
        'cluster' in info ? AzureAuthenticatedConnection.connectionInfofrom(info) : undefined
    );
    registerConnection('appInsights', AppInsightsConnection, (info) =>
        'cluster' in info ? undefined : AppInsightsConnection.connectionInfofrom(info)
    );
    AzureAuthenticatedConnection.registerKustoClient(KustoClient);
    AppInsightsConnection.registerKustoClient(KustoClient);
    initializeCache(context.globalState);
    KernelProvider.register(context);
    StatusBarProvider.register(context);
    registerDisposableRegistry(context);
    ContentProvider.register();
    KqlContentProvider.register();
    ClusterTreeView.register();
    registerNotebookConnection();
    registerConfigurationListener(context);
    monitorJupyterCells();
    registerInteractiveExperience();
    registerExportCommand();
    CellCodeLensProvider.register();
}

export async function deactivate(): Promise<void> {
    if (!client) {
        return;
    }
    return client.stop();
}
