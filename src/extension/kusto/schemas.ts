import KustoClient from 'azure-kusto-data/source/client';
import { ProgressLocation, window } from 'vscode';
import { getFromCache, updateCache } from '../cache';
import { GlobalMementoKeys } from '../constants';
import { getAccessToken, getClient } from './connectionProvider';
import { Database, EngineSchema, Function, InputParameter, Table, TableEntityType } from './schema';

const clusterSchemaPromises = new Map<string, Promise<EngineSchema>>();
export async function getClusterSchema(clusterUri: string, ignoreCache?: boolean): Promise<EngineSchema> {
    const key = `${GlobalMementoKeys.prefixForClusterSchema}:${clusterUri.toLowerCase()}`;
    let promise = clusterSchemaPromises.get(key);
    if (promise && !ignoreCache) {
        return promise;
    }

    const cache = getFromCache<EngineSchema>(key);
    if (cache && !ignoreCache) {
        return JSON.parse(JSON.stringify(cache));
    }

    const fn = async () => {
        return window.withProgress(
            { location: ProgressLocation.Notification, title: 'Fetching Kusto Cluster Schema' },
            async (_progress, _token) => {
                try {
                    const accessToken = await getAccessToken();
                    const client = await getClient(clusterUri, accessToken);
                    const databaseNames = await getDatabases(client, clusterUri, ignoreCache);
                    const databases = await Promise.all(
                        databaseNames.map((db) => getDatabaseSchema(client, clusterUri, db, ignoreCache))
                    );
                    const engineSchema: EngineSchema = {
                        cluster: {
                            connectionString: clusterUri,
                            databases
                        },
                        clusterType: 'Engine',
                        database: undefined
                    };
                    await updateCache(key, engineSchema);
                    return engineSchema;
                } finally {
                    clusterSchemaPromises.delete(key);
                }
            }
        );
    };
    promise = fn();
    clusterSchemaPromises.set(key, promise);
    return promise;
}

const databasePromises = new Map<string, Promise<string[]>>();
async function getDatabases(client: KustoClient, clusterUri: string, ignoreCache?: boolean): Promise<string[]> {
    const key = `${GlobalMementoKeys.prefixForDatabasesInACluster}:${clusterUri.toLowerCase()}`;
    let promise = databasePromises.get(key);
    if (promise && !ignoreCache) {
        return promise;
    }
    const cache = getFromCache<string[]>(key);
    if (Array.isArray(cache) && !ignoreCache) {
        return JSON.parse(JSON.stringify(cache));
    }

    const fn = async () => {
        try {
            const result = await client.execute('', '.show databases');
            if (result.primaryResults.length === 0) {
                throw new Error(`Failed to query databases for cluster ${clusterUri}`);
            }
            const dbNameColumn = result.primaryResults[0].columns.find(
                (item) => item.name?.toLowerCase() === 'databasename'
            );
            if (!dbNameColumn) {
                throw new Error(
                    `Failed to find column 'DatabaseName' when querying databases for cluster ${clusterUri}`
                );
            }
            const dbNames: string[] = result.primaryResults[0]._rows.map((item) => item[dbNameColumn.ordinal]);
            await updateCache(key, dbNames);
            return dbNames;
        } finally {
            databasePromises.delete(key);
        }
    };
    promise = fn();
    databasePromises.set(key, promise);
    return promise;
}
type TableSchema = {
    Name: string;
    Folder: string;
    DocString: string;
    OrderedColumns: {
        Name: string;
        Type: string;
        CslType: string;
    }[];
};
type ScalarInput = {
    Name: string;
    Type: string;
    CslType: string;
    CslDefaultValue?: string;
};
type FunctionInputParameter =
    | {
          Columns: {
              Name: string;
              Type: string;
              CslType: string;
          }[];
          Name: string;
      }
    | ScalarInput;
type FunctionSchema = {
    Name: string;
    InputParameters: FunctionInputParameter[];
    Body: string;
    Folder: string;
    DocString: string;
    FunctionKind: string;
    OutputColumns: [];
};
type DatabaseSchemaResponseItem = {
    Name: string;
    Tables: Record<string, TableSchema>;
    ExternalTables: Record<string, TableSchema>;
    MaterializedViews: Record<string, TableSchema>;
    MajorVersion: number;
    MinorVersion: number;
    Functions: Record<string, FunctionSchema>;
};
type DatabaseSchemaResponse = { Databases: Record<string, DatabaseSchemaResponseItem> };

const dbSchemaPromises = new Map<string, Promise<Database>>();
function translateResponseTableToSchemaTable(table: TableSchema, entityType: TableEntityType): Table {
    return {
        entityType,
        name: table.Name,
        docstring: table.DocString,
        columns: table.OrderedColumns.map((col) => {
            return {
                name: col.Name,
                type: col.CslType,
                docstring: (col as any).DocString || ''
            };
        })
    };
}
function translateResponseScalarInputParamToInputParametere(item: ScalarInput): InputParameter {
    return {
        name: item.Name,
        cslDefaultValue: item.CslDefaultValue,
        cslType: item.CslType,
        type: item.Type,
        docstring: (item as any).DocString || ''
    };
}
function translateResponseInputParamToSchemaColumn(item: FunctionInputParameter): InputParameter {
    if ('Columns' in item) {
        const columns = item.Columns.map((col) => translateResponseScalarInputParamToInputParametere(col));
        return {
            name: item.Name,
            columns
        };
    }
    return translateResponseScalarInputParamToInputParametere(item);
}
// eslint-disable-next-line @typescript-eslint/ban-types
function translateResponseFunctionToSchemaFunction(fn: FunctionSchema): Function {
    return {
        name: fn.Name,
        docstring: fn.DocString,
        body: fn.Body,
        inputParameters: fn.InputParameters.map(translateResponseInputParamToSchemaColumn)
    };
}
async function getDatabaseSchema(
    client: KustoClient,
    clusterUri: string,
    db: string,
    ignoreCache?: boolean
): Promise<Database> {
    const key = `${GlobalMementoKeys.prefixForTablesInAClusterDB}:${clusterUri.toLowerCase()}:${db}`;
    let promise = dbSchemaPromises.get(key);
    if (promise && !ignoreCache) {
        return promise;
    }
    const cache = getFromCache<Database>(key);
    if (cache && !ignoreCache) {
        return JSON.parse(JSON.stringify(cache));
    }

    const fn = async () => {
        try {
            const result = await client.execute(db, '.show database schema as json');
            if (result.primaryResults.length === 0 || result.primaryResults[0]._rows.length == 0) {
                throw new Error(`Failed to query database schema for cluster ${clusterUri}:${db}`);
            }
            const schema: DatabaseSchemaResponse = JSON.parse(result.primaryResults[0]._rows[0]);
            const dbSchemaResponse = Object.keys(schema.Databases).map((name) => schema.Databases[name])[0];
            const tables = Object.keys(dbSchemaResponse.Tables).map((name) => dbSchemaResponse.Tables[name]);
            const externalTables = Object.keys(dbSchemaResponse.ExternalTables).map(
                (name) => dbSchemaResponse.ExternalTables[name]
            );
            const views = Object.keys(dbSchemaResponse.MaterializedViews).map(
                (name) => dbSchemaResponse.MaterializedViews[name]
            );
            const functions = Object.keys(dbSchemaResponse.Functions).map((name) => dbSchemaResponse.Functions[name]);
            const dbSchema: Database = {
                name: dbSchemaResponse.Name,
                majorVersion: dbSchemaResponse.MajorVersion,
                minorVersion: dbSchemaResponse.MinorVersion,
                tables: [
                    ...tables.map((item) => translateResponseTableToSchemaTable(item, 'Table')),
                    ...externalTables.map((item) => translateResponseTableToSchemaTable(item, 'ExternalTable')),
                    ...views.map((item) => translateResponseTableToSchemaTable(item, 'MaterializedViewTable'))
                ],
                functions: functions.map(translateResponseFunctionToSchemaFunction)
            };
            await updateCache(key, dbSchema);
            return dbSchema;
        } finally {
            dbSchemaPromises.delete(key);
        }
    };
    promise = fn();
    dbSchemaPromises.set(key, promise);
    return promise;
}
