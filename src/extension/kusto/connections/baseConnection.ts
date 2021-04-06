import KustoClient from 'azure-kusto-data/source/client';
import { ProgressLocation, window } from 'vscode';
import { getFromCache, updateCache } from '../../cache';
import { GlobalMementoKeys } from '../../constants';
import { EngineSchema } from '../schema';
import { IConnection, IConnectionInfo } from './types';

export abstract class BaseConnection<T extends IConnectionInfo> implements IConnection<T> {
    private schema?: Promise<EngineSchema>;
    private get schemaCacheId() {
        return `${GlobalMementoKeys.prefixForClusterSchema}:${this.info.id.toLowerCase()}`;
    }
    constructor(public readonly info: T) {}
    public async getSchema(ignoreCache?: boolean): Promise<EngineSchema> {
        const key = `${GlobalMementoKeys.prefixForClusterSchema}:${this.info.id.toLowerCase()}`;
        if (this.schema && !ignoreCache) {
            return this.schema;
        }

        const cache = getFromCache<EngineSchema>(key);
        if (cache && !ignoreCache) {
            return JSON.parse(JSON.stringify(cache));
        }
        this.schema = new Promise<EngineSchema>((resolve, reject) =>
            window
                .withProgress(
                    { location: ProgressLocation.Notification, title: 'Fetching Kusto Cluster Schema' },
                    async (_progress, _token) => {
                        try {
                            const schema = await this.getSchemaInternal();
                            await updateCache(this.schemaCacheId, schema);
                            return schema;
                        } finally {
                            this.schema = undefined;
                        }
                    }
                )
                .then(resolve, reject)
        );
        return this.schema;
    }
    abstract getSchemaInternal(): Promise<EngineSchema>;
    abstract delete(): Promise<void>;
    abstract save(): Promise<void>;
    abstract getKustoClient(): Promise<KustoClient>;
}
