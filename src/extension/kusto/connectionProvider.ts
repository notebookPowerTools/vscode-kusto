import { KustoConnectionStringBuilder } from 'azure-kusto-data';
import KustoClient from 'azure-kusto-data/source/client';
import { window, env, Uri, authentication } from 'vscode';

const clients = new Map<string, KustoClient>();
function getConnection(clusterUri: string, accessToken?: string): KustoConnectionStringBuilder {
    if (accessToken) {
        return KustoConnectionStringBuilder.withAccessToken(clusterUri, accessToken);
    }
    return KustoConnectionStringBuilder.withAadDeviceAuthentication(clusterUri, 'common', async (tokenResponse) => {
        const option = await window.showInformationMessage(
            tokenResponse.message,
            'Copy token to clipboard and open browser'
        );

        if (option) {
            await env.clipboard.writeText(tokenResponse.userCode);
            env.openExternal(Uri.parse(tokenResponse.verificationUrl), {
                allowContributedOpeners: false
            });
        }
    });
}

export async function getAccessToken() {
    const scopes = ['https://management.core.windows.net/.default', 'offline_access'];

    const session = await authentication.getSession('microsoft', scopes, { createIfNone: true });
    if (session?.accessToken) {
        return session.accessToken;
    }
    return window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: '',
        title: 'Enter Access Token'
    });
}

export function getClient(clusterUri: string, accessToken?: string): KustoClient {
    let client = clients.get(clusterUri);
    if (client) {
        return client;
    }
    const connection = getConnection(clusterUri, accessToken);
    client = new KustoClient(connection);
    clients.set(clusterUri, client);
    return client;
}
