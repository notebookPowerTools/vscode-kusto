import type { ClientRequestProperties, KustoConnectionStringBuilder } from 'azure-kusto-data';
import type { KustoResponseDataSet } from 'azure-kusto-data/source/response';
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
    getKustoClient(): Promise<IKustoClient>;
}

export interface NewableKustoClient {
    new (connectionStringBuilder: KustoConnectionStringBuilder): IKustoClient;
}
export interface IKustoClient {
    headers: {
        [name: string]: string;
    };
    endpoints: {
        [name: string]: string;
    };
    executeQueryV1(db: string, query: string, properties?: ClientRequestProperties): Promise<KustoResponseDataSet>;
    execute(db: string, query: string, properties?: ClientRequestProperties): Promise<KustoResponseDataSet>;
}
