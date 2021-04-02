import { Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { getFromCache } from '../cache';
import { GlobalMementoKeys } from '../constants';
import { Column, Database, EngineSchema, Table } from '../kusto/schema';
import { getClusterSchema } from '../kusto/schemas';
import { getClusterDisplayName } from '../kusto/utils';
import { DeepReadonly, IDisposable } from '../types';
import { logError } from '../utils';

export type NodeType = 'cluster' | 'database' | 'table' | 'column';
export interface ITreeData {
    readonly parent?: ITreeData;
    readonly type: NodeType;
    getTreeItem(): Promise<TreeItem>;
    getChildren?(): ITreeData[] | undefined;
}
export class ClusterNode implements ITreeData {
    public readonly type: NodeType = 'cluster';
    public get schema(): DeepReadonly<EngineSchema> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.engineSchema!;
    }
    constructor(public readonly clusterUri: string, private engineSchema?: EngineSchema) {}

    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(getClusterDisplayName(this.clusterUri), TreeItemCollapsibleState.Expanded);
        item.iconPath = new ThemeIcon('server-environment');
        item.contextValue = this.type;
        if (!this.engineSchema) {
            item.iconPath = new ThemeIcon('error');
            item.tooltip = 'Failed to fetch the schema for this cluster, please check the logs.';
        }
        return item;
    }
    public getChildren(): ITreeData[] {
        if (!this.engineSchema) {
            return [];
        }
        return this.schema.cluster.databases.map((item) => new DatabaseNode(this, item.name));
    }
    public async updateSchema(schema?: EngineSchema) {
        this.engineSchema = schema;
    }
}
export class DatabaseNode implements ITreeData {
    public readonly type: NodeType = 'database';
    public get database(): DeepReadonly<Database> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.parent.schema.cluster.databases.find(
            (item) => item.name.toLowerCase() === this.databaseName.toLowerCase()
        )!;
    }
    constructor(public readonly parent: ClusterNode, private readonly databaseName: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.databaseName, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        item.iconPath = new ThemeIcon('database');
        return item;
    }
    public getChildren(): ITreeData[] {
        return this.database.tables.map((table) => new TableNode(this, table.name));
    }
}
export class TableNode implements ITreeData {
    public readonly type: NodeType = 'table';
    public get entityType(): string | undefined {
        return this.table.entityType;
    }
    public get table(): DeepReadonly<Table> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.parent.database.tables.find((item) => item.name.toLowerCase() === this.tableName.toLowerCase())!;
    }
    constructor(public readonly parent: DatabaseNode, private readonly tableName: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const table = this.table;
        const item = new TreeItem(this.tableName, TreeItemCollapsibleState.Collapsed);
        item.contextValue = this.type;
        item.description = table.entityType ? `(${table.entityType})` : '';
        item.tooltip = table.docstring;
        item.iconPath = new ThemeIcon('table');
        return item;
    }
    public getChildren() {
        return this.table.columns.map((col) => new ColumnNode(this, col.name));
    }
}
export class ColumnNode implements ITreeData {
    public readonly type: NodeType = 'column';
    public get column(): DeepReadonly<Column> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.parent.table.columns.find((col) => col.name.toLowerCase() === this.columnName.toLowerCase())!;
    }
    constructor(public readonly parent: TableNode, private readonly columnName: string) {}
    public async getTreeItem(): Promise<TreeItem> {
        const col = this.column;
        const item = new TreeItem(this.columnName, TreeItemCollapsibleState.None);
        item.contextValue = this.type;
        item.description = `(${col.type})`;
        item.tooltip = col.docstring;
        item.iconPath = new ThemeIcon('output-view-icon');
        return item;
    }
}
export class KustoClusterExplorer implements TreeDataProvider<ITreeData>, IDisposable {
    private readonly _onDidChangeTreeData = new EventEmitter<ITreeData | void>();
    private readonly clusters: ClusterNode[] = [];

    public get onDidChangeTreeData(): Event<ITreeData | void> {
        return this._onDidChangeTreeData.event;
    }
    public dispose() {
        this._onDidChangeTreeData.dispose();
    }
    public async getTreeItem(element: ITreeData): Promise<TreeItem> {
        return element.getTreeItem();
    }
    public getChildren(element?: ITreeData): ITreeData[] | undefined {
        if (!element) {
            return this.clusters;
        }
        return element.getChildren ? element.getChildren() : undefined;
    }
    public getParent?(element: ITreeData): ITreeData | undefined {
        return element?.parent;
    }
    public async addCluster(clusterUri: string) {
        if (this.clusters.find((cluster) => cluster.clusterUri === clusterUri)) {
            return;
        }
        try {
            const schema = await getClusterSchema(clusterUri);
            this.clusters.push(new ClusterNode(clusterUri, schema));
            this._onDidChangeTreeData.fire();
        } catch (ex) {
            // If it fails, add the cluster so user can remove it & they know something is wrong.
            this.clusters.push(new ClusterNode(clusterUri));
            this._onDidChangeTreeData.fire();
            throw ex;
        }
    }
    public async refresh() {
        const clusters = getFromCache<string[]>(GlobalMementoKeys.clusterUris) || [
            'https://ddtelvscode.kusto.windows.net/'
        ];
        if (!Array.isArray(clusters)) {
            return;
        }
        if (this.clusters.length === 0) {
            await Promise.all(
                clusters.map((clusterUri) =>
                    this.addCluster(clusterUri).catch((ex) => logError(`Failed to add cluster ${clusterUri}`, ex))
                )
            );
        } else {
            await Promise.all(
                clusters.map((clusterUri) =>
                    this.refreshCluster(clusterUri).catch((ex) => logError(`Failed to add cluster ${clusterUri}`, ex))
                )
            );
        }
    }

    public async refreshCluster(clusterUri: string) {
        const clusterNode = this.clusters.find((item) => item.clusterUri === clusterUri);
        if (clusterNode) {
            try {
                const schema = await getClusterSchema(clusterUri, true);
                clusterNode.updateSchema(schema);
                this._onDidChangeTreeData.fire(clusterNode);
            } catch (ex) {
                // If it fails, update node so user knows something is wrong.
                clusterNode.updateSchema();
                this._onDidChangeTreeData.fire(clusterNode);
            }
        }
    }
}
