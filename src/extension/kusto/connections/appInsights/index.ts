import { KustoConnectionStringBuilder } from 'azure-kusto-data';
import KustoClient from 'azure-kusto-data/source/client';
import { getHash } from '../../../utils';
import { EngineSchema } from '../../schema';
import { BaseConnection } from '../baseConnection';
import { getConnectionSecret, updateConnectionCache, addConnectionSecret, removeConnectionSecret } from '../storage';
import { AppInsightsConnectionInfo, AppInsightsConnectionSecrets } from '../types';
import { getClusterSchema } from './schema';

export class AppInsightsConnection extends BaseConnection<AppInsightsConnectionInfo> {
    constructor(info: AppInsightsConnectionInfo, private secretInfo?: AppInsightsConnectionSecrets) {
        super(info);
    }
    public static from(info: { appId: string; appKey: string }) {
        const id = getHash(`${info.appId}:${info.appKey}`);
        return new AppInsightsConnection(
            {
                displayName: `AppInsights ${info.appId.substring(0, 8)}`,
                id,
                type: 'appInsights'
            },
            info
        );
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
    public async getKustoClient(): Promise<KustoClient> {
        const secret = await this.loadSecrets();
        const clusterConectionString = `data source=https://api.applicationinsights.io/v1/apps/${secret.appId};appclientid=${secret.appId}`;

        const kcs = KustoConnectionStringBuilder.withAccessToken(clusterConectionString, secret.appKey);
        const client = new KustoClient(kcs);
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
