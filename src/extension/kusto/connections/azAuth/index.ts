import { KustoConnectionStringBuilder } from 'azure-kusto-data/source/connectionBuilder';
import { authentication, env, Uri, window } from 'vscode';
import { EngineSchema } from '../../schema';
import { getClusterDisplayName } from '../../utils';
import { BaseConnection } from '../baseConnection';
import { updateConnectionCache } from '../storage';
import { AzureAuthenticatedConnectionInfo, IKustoClient, NewableKustoClient } from '../types';
import { getClusterSchema } from './schema';

export class AzureAuthenticatedConnection extends BaseConnection<AzureAuthenticatedConnectionInfo> {
    private static KustoClientCtor: NewableKustoClient;
    constructor(info: AzureAuthenticatedConnectionInfo) {
        super('azAuth', info);
    }
    public static registerKustoClient(ctor: NewableKustoClient) {
        AzureAuthenticatedConnection.KustoClientCtor = ctor;
    }
    public static connectionInfofrom(info: { cluster: string; database?: string }): AzureAuthenticatedConnectionInfo {
        return {
            cluster: info.cluster,
            database: info.database,
            displayName: getClusterDisplayName(info.cluster),
            id: info.cluster,
            type: 'azAuth'
        };
    }
    public static from(info: { cluster: string; database?: string }) {
        return new AzureAuthenticatedConnection(AzureAuthenticatedConnection.connectionInfofrom(info));
    }
    public async delete() {
        await updateConnectionCache({ info: this.info, action: 'remove' });
    }
    public async save() {
        await updateConnectionCache({ info: this.info, action: 'add' });
    }
    public getSchemaInternal(): Promise<EngineSchema> {
        return getClusterSchema(this.info);
    }
    public async getKustoClient(): Promise<IKustoClient> {
        const accessToken = await this.getAccessToken();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const connection = this.getConnectionBuilder(this.info.cluster!, accessToken);
        return new AzureAuthenticatedConnection.KustoClientCtor(connection);
    }
    private getConnectionBuilder(cluster: string, accessToken?: string) {
        if (accessToken) {
            return KustoConnectionStringBuilder.withAccessToken(cluster, accessToken);
        }
        return KustoConnectionStringBuilder.withAadDeviceAuthentication(cluster, 'common', async (tokenResponse) => {
            const option = await window.showInformationMessage(
                tokenResponse.message,
                'Copy token to clipboard and open browser'
            );

            if (option) {
                await env.clipboard.writeText(tokenResponse.userCode);
                env.openExternal(Uri.parse(tokenResponse.verificationUri));
            }
        });
    }
    private async getAccessToken() {
        const scopes = ['https://management.core.windows.net/.default', 'offline_access'];

        const session = await authentication.getSession('microsoft', scopes, { createIfNone: true });
        if (session?.accessToken) {
            return session.accessToken;
        }
        return window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: '',
            prompt: 'Enter Access Token'
        });
    }
}
