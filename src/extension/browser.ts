// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-var, @typescript-eslint/no-explicit-any
// var console: any = {};
import { ExtensionContext } from 'vscode';
import { initialize as initializeConstants } from './constants';
import { initialize as initializeLanguageService } from './languageServer';
import { ContentProvider } from './content/provider';
import { KernelProvider } from './kernel/provider';
import { KustoClient } from './kusto/webClient';
import { AzureAuthenticatedConnection } from './kusto/connections/azAuth';
import { registerConnection } from './kusto/connections/baseConnection';
import { AppInsightsConnection } from './kusto/connections/appInsights';
import { ClusterTreeView } from './activityBar/clusterView';
import { initializeConnectionStorage } from './kusto/connections/storage';
import { registerNotebookConnection } from './kusto/connections/notebookConnection';
import { registerExportCommand } from './content/export';
import { BrowserLanguageCapabilityProvider } from './languageServer/browser';
import { initializeCache } from './cache';
import { registerConfigurationListener } from './configuration';
export async function activate(context: ExtensionContext) {
    initializeCache(context.globalState);
    initializeConstants(false); // In browser context dont use proposed API, try to always use stable stuff...
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
    KernelProvider.register(context);
    ContentProvider.register();
    ClusterTreeView.register();
    registerNotebookConnection();
    registerConfigurationListener(context);
    // monitorJupyterCells();
    registerExportCommand();
    BrowserLanguageCapabilityProvider.register();
}
