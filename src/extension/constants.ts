import { commands } from 'vscode';

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const noop = () => {};

export enum GlobalMementoKeys {
    clusterUris = 'clusterUris',
    lastUsedConnection = 'lastUsedConnection',
    lastEnteredClusterUri = 'lastEnteredClusterUri',
    lastEnteredDatabase = 'lastEnteredDatabase',
    prefixForClusterSchema = 'prefixForClusterSchema',
    prefixForDatabasesInACluster = 'prefixForDatabasesInACluster',
    prefixForTablesInAClusterDB = 'prefixForTablesInAClusterDB'
}

let _useProposedApi = false;
export const useProposedApi = () => _useProposedApi;
export function initialize(useProposedApi: boolean) {
    _useProposedApi = useProposedApi;
    commands.executeCommand('setContext', 'kusto.useProposedApi', useProposedApi);
}
