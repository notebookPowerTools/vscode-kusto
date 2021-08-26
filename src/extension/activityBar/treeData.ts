import { Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { fromConnectionInfo } from '../kusto/connections';
import { getCachedConnections } from '../kusto/connections/storage';
import { IConnectionInfo } from '../kusto/connections/types';
import { Column, Database, EngineSchema, Table } from '../kusto/schema';
import { DeepReadonly, IDisposable } from '../types';

export type NodeType = 'cluster' | 'database' | 'table' | 'column';
export interface ITreeData {
    readonly parent?: ITreeData;
    readonly type: NodeType;
    getTreeItem(): Promise<TreeItem>;
    getChildren?(): Promise<ITreeData[] | undefined>;
}
export class ClusterNode implements ITreeData {
    public readonly type: NodeType = 'cluster';
    public get schema(): DeepReadonly<EngineSchema> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.engineSchema!;
    }
    constructor(public readonly info: IConnectionInfo, private engineSchema?: EngineSchema) {}

    public async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.info.displayName, TreeItemCollapsibleState.Expanded);
        item.iconPath = new ThemeIcon('server-environment');
        item.contextValue = this.type;
        if (!this.engineSchema) {
            item.iconPath = new ThemeIcon('error');
            item.tooltip = 'Failed to fetch the schema for this cluster, please check the logs.';
        }
        return item;
    }
    public async getChildren(): Promise<ITreeData[]> {
        if (!this.engineSchema) {
            return [];
        }
        return this.engineSchema.cluster.databases.map((item) => new DatabaseNode(this, item.name));
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
    public async getChildren(): Promise<ITreeData[]> {
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
    public async getChildren() {
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
    private readonly connections: ClusterNode[] = [];

    public get onDidChangeTreeData(): Event<ITreeData | void> {
        return this._onDidChangeTreeData.event;
    }
    public dispose() {
        this._onDidChangeTreeData.dispose();
    }
    public async getTreeItem(element: ITreeData): Promise<TreeItem> {
        return element.getTreeItem();
    }
    public async getChildren(element?: ITreeData): Promise<ITreeData[] | undefined> {
        if (!element) {
            return this.connections;
        }
        return element.getChildren ? element.getChildren() : undefined;
    }
    public getParent?(element: ITreeData): ITreeData | undefined {
        return element?.parent;
    }
    public async removeCluster(connection: IConnectionInfo) {
        const indexToRemove = this.connections.findIndex((item) => item.info.id === connection.id);
        if (indexToRemove === -1) {
            return;
        }
        this.connections.splice(indexToRemove, 1);
        this._onDidChangeTreeData.fire();
    }
    public async addConnection(connection: IConnectionInfo) {
        if (this.connections.find((cluster) => cluster.info.id === connection.id)) {
            return;
        }
        try {
            const schema = await fromConnectionInfo(connection).getSchema();
            this.connections.push(new ClusterNode(connection, schema));
            this._onDidChangeTreeData.fire();
        } catch (ex) {
            // If it fails, add the cluster so user can remove it & they know something is wrong.
            this.connections.push(new ClusterNode(connection));
            this._onDidChangeTreeData.fire();
            throw ex;
        }
    }
    public async refresh() {
        const connections = getCachedConnections();
        if (!Array.isArray(connections)) {
            return;
        }
        if (this.connections.length === 0) {
            await Promise.all(
                connections.map((clusterUri) =>
                    this.addConnection(clusterUri).catch((ex) =>
                        console.error(`Failed to add cluster ${clusterUri}`, ex)
                    )
                )
            );
        } else {
            await Promise.all(
                connections.map((item) =>
                    this.refreshConnection(item).catch((ex) =>
                        console.error(`Failed to add cluster ${JSON.stringify(item)}`, ex)
                    )
                )
            );
        }
    }

    public async refreshConnection(connection: IConnectionInfo) {
        const connectionNode = this.connections.find((item) => item.info.id === connection.id);
        if (connectionNode) {
            try {
                const schema = await fromConnectionInfo(connection).getSchema({ ignoreCache: true });
                connectionNode.updateSchema(schema);
                this._onDidChangeTreeData.fire(connectionNode);
            } catch (ex) {
                // If it fails, update node so user knows something is wrong.
                connectionNode.updateSchema();
                this._onDidChangeTreeData.fire(connectionNode);
            }
        }
    }
}
