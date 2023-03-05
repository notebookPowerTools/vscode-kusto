import { KustoConnectionStringBuilder } from 'azure-kusto-data/source/connectionBuilder';
import { getHash } from '../../../utils';
import { EngineSchema } from '../../schema';
import { BaseConnection } from '../baseConnection';
import {
    getConnectionSecret,
    updateConnectionCache,
    addConnectionSecret,
    removeConnectionSecret,
    getCachedConnections
} from '../storage';
import { AppInsightsConnectionInfo, AppInsightsConnectionSecrets, IKustoClient, NewableKustoClient } from '../types';
import { getClusterSchema } from './schema';

export class AppInsightsConnection extends BaseConnection<AppInsightsConnectionInfo> {
    private static KustoClientCtor: NewableKustoClient;
    constructor(info: AppInsightsConnectionInfo, private secretInfo?: AppInsightsConnectionSecrets) {
        super('appInsights', info);
    }
    public static registerKustoClient(ctor: NewableKustoClient) {
        AppInsightsConnection.KustoClientCtor = ctor;
    }
    public static connectionInfofrom(
        info: { appId: string; appKey: string } | { appInsightsId: string }
    ): AppInsightsConnectionInfo {
        const connection =
            'appInsightsId' in info ? getCachedConnections().find((item) => item.id === info.appInsightsId) : info;
        if (!connection || !('appId' in connection)) {
            throw new Error(`AppInsights Connection info not found`);
        }
        const id = getHash(`${connection.appId}:${connection.appKey}`);
        return {
            displayName: `AppInsights AppId ${connection.appId.substring(0, 8)}${
                (''.padEnd(connection.appId.length - 8), '*')
            }`,
            id,
            type: 'appInsights'
        };
    }
    public static from(info: { appId: string; appKey: string }) {
        return new AppInsightsConnection(AppInsightsConnection.connectionInfofrom(info), info);
    }
    public async getSchemaInternal(): Promise<EngineSchema> {
        await this.loadSecrets();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return getClusterSchema(this.info, this.secretInfo!);
    }

    public async delete() {
        await updateConnectionCache({ info: this.info, action: 'remove' });
        await removeConnectionSecret(this.info.id);
    }
    public async save() {
        await Promise.all([
            updateConnectionCache({ info: this.info, action: 'add' }),
            addConnectionSecret(
                this.info.id,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                JSON.stringify({ ...this.info, ...this.secretInfo! })
            )
        ]);
    }
    public async getKustoClient(): Promise<IKustoClient> {
        const secret = await this.loadSecrets();
        const clusterConectionString = `data source=https://api.applicationinsights.io/v1/apps/${secret.appId};appclientid=${secret.appId}`;

        const kcs = KustoConnectionStringBuilder.withAccessToken(clusterConectionString, secret.appKey);
        // const client = new KustoClient(kcs);
        const client = new AppInsightsConnection.KustoClientCtor(kcs);
        client.headers = client.headers || {};
        client.headers['x-api-key'] = secret.appKey;
        client.headers['Prefer'] = 'ai.response-thinning=false';
        client.endpoints['query'] = `https://api.applicationinsights.io/v1/apps/${secret.appId}/query`;
        client.endpoints['queryv1'] = `https://api.applicationinsights.io/v1/apps/${secret.appId}/query`;
        return client;
    }
    private async loadSecrets(): Promise<AppInsightsConnectionSecrets> {
        if (this.secretInfo) {
            return this.secretInfo;
        }
        const secret = await getConnectionSecret(this.info.id);
        if (!secret) {
            throw new Error('Failed to load secrets from saved information');
        }
        this.secretInfo = JSON.parse(secret) as AppInsightsConnectionSecrets;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.secretInfo!;
    }
}
