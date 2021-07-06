import { KustoConnectionStringBuilder } from 'azure-kusto-data/source/connectionBuilder';
import type { ClientRequestProperties } from 'azure-kusto-data';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const azurePackage = require('../../../node_modules/azure-kusto-data/package.json');
import { KustoResponseDataSet, KustoResponseDataSetV1, KustoResponseDataSetV2 } from 'azure-kusto-data/source/response';
import { IKustoClient } from './connections/types';
import axios from 'axios';
import * as moment from 'moment';
import * as uuid from 'uuid';

const COMMAND_TIMEOUT_IN_MILLISECS = moment.duration(10.5, 'minutes').asMilliseconds();
const QUERY_TIMEOUT_IN_MILLISECS = moment.duration(4.5, 'minutes').asMilliseconds();
const CLIENT_SERVER_DELTA_IN_MILLISECS = moment.duration(0.5, 'minutes').asMilliseconds();
const MGMT_PREFIX = '.';

enum ExecutionType {
    Mgmt = 'mgmt',
    Query = 'query',
    Ingest = 'ingest',
    QueryV1 = 'queryv1'
}

export class KustoClient implements IKustoClient {
    private readonly connectionString: KustoConnectionStringBuilder;
    private readonly cluster?: string;
    public readonly headers: Record<string, string> = {};
    public readonly endpoints: Record<string, string> = {};
    constructor(kcsb: string | KustoConnectionStringBuilder) {
        this.connectionString = typeof kcsb === 'string' ? new KustoConnectionStringBuilder(kcsb) : kcsb;
        this.cluster = this.connectionString.dataSource;
        this.endpoints = {
            [ExecutionType.Mgmt]: `${this.cluster}/v1/rest/mgmt`,
            [ExecutionType.Query]: `${this.cluster}/v2/rest/query`,
            [ExecutionType.Ingest]: `${this.cluster}/v1/rest/ingest`,
            [ExecutionType.QueryV1]: `${this.cluster}/v1/rest/query`
        };
        this.headers = {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip,deflate',
            'x-ms-client-version': `Kusto.Node.Client:${azurePackage.version}`
        };
    }
    public async executeQueryV1(db: string, query: string, properties?: ClientRequestProperties) {
        return this._execute(this.endpoints[ExecutionType.QueryV1], ExecutionType.QueryV1, db, query, null, properties);
    }

    public async execute(
        db: string,
        query: string,
        properties?: ClientRequestProperties
    ): Promise<KustoResponseDataSet> {
        query = query.trim();
        if (query.startsWith(MGMT_PREFIX)) {
            return this.executeMgmt(db, query, properties);
        }

        return this.executeQuery(db, query, properties);
    }
    async executeMgmt(db: string, query: string, properties?: ClientRequestProperties) {
        return this._execute(this.endpoints[ExecutionType.Mgmt], ExecutionType.Mgmt, db, query, null, properties);
    }
    async executeQuery(db: string, query: string, properties?: ClientRequestProperties) {
        return this._execute(this.endpoints[ExecutionType.Query], ExecutionType.Query, db, query, null, properties);
    }
    async _execute(
        endpoint: string,
        executionType: ExecutionType,
        db: string,
        query: string | null,
        stream: string | null,
        properties?: ClientRequestProperties | null
    ): Promise<KustoResponseDataSet> {
        const headers: { [header: string]: string } = {};

        let payload: { db: string; csl: string; properties?: any };
        let clientRequestPrefix = '';
        let clientRequestId;

        const timeout = this._getClientTimeout(executionType, properties);
        let payloadStr = '';
        if (query != null) {
            payload = {
                db: db,
                csl: query
            };

            if (properties != null) {
                payload.properties = properties.toJson();
                clientRequestId = properties.clientRequestId;

                // if (properties.application != null) {
                //     headers['x-ms-app'] = properties.application;
                // }

                // if (properties.user != null) {
                //     headers['x-ms-user'] = properties.user;
                // }
            }

            payloadStr = JSON.stringify(payload);

            headers['Content-Type'] = 'application/json; charset=utf-8';
            clientRequestPrefix = 'KNC.execute;';
        } else if (stream != null) {
            payloadStr = stream;
            clientRequestPrefix = 'KNC.executeStreamingIngest;';
            headers['Content-Encoding'] = 'gzip';
            headers['Content-Type'] = 'multipart/form-data';
        }

        headers['x-ms-client-request-id'] = clientRequestId || clientRequestPrefix + `${uuid.v4()}`;

        // headers.Authorization = await this.aadHelper._getAuthHeader();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { accessToken } = this.connectionString as any;
        headers.Authorization = `Bearer ${accessToken}`;

        return this._doRequest(endpoint, executionType, headers, payloadStr, timeout, properties);
    }

    async _doRequest(
        endpoint: string,
        executionType: ExecutionType,
        headers: { [header: string]: string },
        payload: string,
        timeout: number,
        properties?: ClientRequestProperties | null
    ): Promise<KustoResponseDataSet> {
        const axiosConfig = {
            headers,
            timeout
        };

        let axiosResponse;
        try {
            axiosResponse = await axios.post(endpoint, payload, axiosConfig);
        } catch (error) {
            if (error.response?.data?.error) {
                throw error.response.data.error;
            }
            if (error.response?.data?.Message) {
                throw error.response.data.Message;
            }
            throw error;
        }

        return this._parseResponse(axiosResponse.data, executionType, properties, axiosResponse.status);
    }

    _parseResponse(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: any,
        executionType: ExecutionType,
        properties?: ClientRequestProperties | null,
        status?: number
    ): KustoResponseDataSet {
        const { raw } = properties || {};
        if (raw === true || executionType == ExecutionType.Ingest) {
            return response;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let kustoResponse: any = null;
        try {
            if (executionType == ExecutionType.Query) {
                kustoResponse = new KustoResponseDataSetV2(response);
            } else {
                kustoResponse = new KustoResponseDataSetV1(response);
            }
        } catch (ex) {
            throw new Error(`Failed to parse response ({${status}}) with the following error [${ex}].`);
        }
        if (kustoResponse.getErrorsCount().errors > 0) {
            throw new Error(`Kusto request had errors. ${kustoResponse.getExceptions()}`);
        }
        return kustoResponse;
    }

    _getClientTimeout(executionType: ExecutionType, properties?: ClientRequestProperties | null): number {
        if (properties != null) {
            const clientTimeout = properties.getClientTimeout();
            if (clientTimeout) {
                return clientTimeout;
            }

            const serverTimeout = properties.getTimeout();
            if (serverTimeout) {
                return serverTimeout + CLIENT_SERVER_DELTA_IN_MILLISECS;
            }
        }

        return executionType == ExecutionType.Query || executionType == ExecutionType.QueryV1
            ? QUERY_TIMEOUT_IN_MILLISECS
            : COMMAND_TIMEOUT_IN_MILLISECS;
    }
}
