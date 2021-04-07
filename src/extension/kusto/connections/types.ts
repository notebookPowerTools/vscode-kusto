import KustoClient from 'azure-kusto-data/source/client';
import { EngineSchema } from '../schema';

export type AzureAuthenticatedConnectionInfo = {
    readonly id: string;
    readonly displayName: string;
    readonly type: 'azAuth';
    readonly cluster: string;
    readonly database?: string;
};
export type AppInsightsConnectionInfo = {
    readonly id: string;
    readonly displayName: string;
    readonly type: 'appInsights';
};

export type AppInsightsConnectionSecrets = {
    appId: string;
    appKey: string;
};
export type ConnectionType = 'appInsights' | 'azAuth';
export type IConnectionInfo = AzureAuthenticatedConnectionInfo | AppInsightsConnectionInfo;

export interface IConnection<T extends IConnectionInfo> {
    readonly info: T;
    getSchema(ignoreCache?: boolean): Promise<EngineSchema>;
    delete(): Promise<void>;
    save(): Promise<void>;
    getKustoClient(): Promise<KustoClient>;
}
