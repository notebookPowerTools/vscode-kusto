import KustoClient from 'azure-kusto-data/source/client';
import { AppInsightsConnectionInfo, AppInsightsConnectionSecrets } from '../types';
import { EngineSchema } from '../../schema';
import { fromConnectionInfo } from '..';
import * as axios from 'axios';
import { v4 } from 'uuid';

export async function getClusterSchema(
    connection: AppInsightsConnectionInfo,
    secrets: AppInsightsConnectionSecrets
): Promise<EngineSchema> {
    const client = await fromConnectionInfo(connection).getKustoClient();
    return getSchema(client, secrets);
}

async function getSchema(client: KustoClient, secrets: AppInsightsConnectionSecrets): Promise<EngineSchema> {
    const headers: Record<string, string> = JSON.parse(JSON.stringify(client.headers));
    headers['Prefer'] = 'ai.response-thinning=false';
    headers['x-api-key'] = secrets.appKey;
    headers['Authorization'] = `Bearer ${secrets.appKey}`;
    headers['Accept'] = 'application/json';
    headers['Accept-Encoding'] = 'gzip,deflate';
    headers['x-ms-client-version'] = 'Kusto.Node.Client:2.1.5';
    headers['Content-Type'] = 'application/json; charset=utf-8';
    headers['x-ms-client-request-id'] = `KNC.execute;${v4()}`;

    const uri = `https://api.applicationinsights.io/v1/apps/${secrets.appId}/metadata`;
    const axiosConfig = {
        headers,
        gzip: true,
        timeout: 60 * 1000
    };

    const payload = {
        db: '',
        csl: '.show schema'
    };
    const response = await axios.default.post(uri, payload, axiosConfig);
    const tables: Table[] = response.data.tables;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {
        cluster: {
            connectionString: 'https://api.applicationinsights.io',
            databases: [
                {
                    functions: [],
                    majorVersion: 1,
                    minorVersion: 1,
                    name: response.data.tableGroups[0].name,
                    tables: tables.map((table) => {
                        return {
                            entityType: 'Table',
                            name: table.name,
                            columns: table.columns
                        };
                    })
                }
            ]
        },
        clusterType: 'Engine',
        database: undefined
    };
}

type Table = {
    id: string;
    name: string;
    columns: Column[];
};

type Column = {
    name: string;
    type: string;
};
