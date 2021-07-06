import { AppInsightsConnection } from './appInsights';
import { AzureAuthenticatedConnection } from './azAuth';
import { IConnectionInfo } from './types';

// export type Connection = AzureAuthenticatedConnection | AppInsightsConnection;

export function fromConnectionInfo(
    connectionInfo: IConnectionInfo
): AzureAuthenticatedConnection | AppInsightsConnection {
    if (connectionInfo.type === 'appInsights') {
        return new AppInsightsConnection(connectionInfo);
    } else if (connectionInfo.type === 'azAuth') {
        return new AzureAuthenticatedConnection(connectionInfo);
    } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const partialInfo: Partial<IConnectionInfo> = connectionInfo as any;
        if (typeof partialInfo.type === 'undefined' && 'cluster' in partialInfo) {
            return AzureAuthenticatedConnection.from(connectionInfo);
        }
        console.error(`Unknown Connection information ${connectionInfo}`);
        return AzureAuthenticatedConnection.from(connectionInfo);
    }
}
