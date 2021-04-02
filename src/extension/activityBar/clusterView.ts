import { EOL } from 'os';
import { commands, window } from 'vscode';
import { createUntitledNotebook } from '../content/provider';
import { addClusterAddedHandler, addClusterUri, removeCachedCluster } from '../kernel/notebookConnection';
import { Connection } from '../types';
import { registerDisposable } from '../utils';
import { ClusterNode, DatabaseNode, KustoClusterExplorer, TableNode } from './treeData';

export class ClusterTreeView {
    constructor(private readonly clusterExplorer: KustoClusterExplorer) {}
    public static register() {
        const clusterExplorer = new KustoClusterExplorer();
        registerDisposable(clusterExplorer);
        const treeView = window.createTreeView('kustoExplorer', {
            treeDataProvider: clusterExplorer,
            canSelectMany: false,
            showCollapseAll: true
        });
        registerDisposable(treeView);
        const handler = new ClusterTreeView(clusterExplorer);
        registerDisposable(commands.registerCommand('kusto.addCluster', addClusterUri));
        registerDisposable(commands.registerCommand('kusto.removeCluster', handler.removeCluster, handler));
        registerDisposable(commands.registerCommand('kusto.refreshNode', handler.onRefreshNode, handler));
        registerDisposable(commands.registerCommand('kusto.createNotebook', handler.createNotebook, handler));
        addClusterAddedHandler((e) =>
            e.change === 'added'
                ? clusterExplorer.addCluster(e.clusterUri)
                : clusterExplorer.removeCluster(e.clusterUri)
        );
        clusterExplorer.refresh();
    }

    private async onRefreshNode(e) {
        if (e instanceof ClusterNode) {
            this.clusterExplorer.refreshCluster(e.clusterUri);
        }
        if (e instanceof DatabaseNode) {
            this.clusterExplorer.refreshCluster(e.parent.clusterUri);
        }
        if (e instanceof TableNode) {
            this.clusterExplorer.refreshCluster(e.parent.parent.clusterUri);
        }
        if (!e) {
            this.clusterExplorer.refresh();
        }
    }

    private async removeCluster(cluster: ClusterNode) {
        // In case this command gets added else where & I forget.
        if (!cluster || !(cluster instanceof ClusterNode)) {
            return;
        }
        const selection = await window.showWarningMessage(
            `Are you sure you want to remove the cluster ${cluster.clusterUri}`,
            {
                modal: true
            },
            'Yes'
        );
        if (selection !== 'Yes') {
            return;
        }
        await removeCachedCluster(cluster.clusterUri);
    }

    private async createNotebook(dataBaseOrTableNote: DatabaseNode | TableNode) {
        // In case this command gets added else where & I forget.
        if (
            !dataBaseOrTableNote ||
            (!(dataBaseOrTableNote instanceof DatabaseNode) && !(dataBaseOrTableNote instanceof TableNode))
        ) {
            return;
        }
        const clusterUri =
            dataBaseOrTableNote instanceof DatabaseNode
                ? dataBaseOrTableNote.parent.clusterUri
                : dataBaseOrTableNote.parent.parent.clusterUri;
        const database =
            dataBaseOrTableNote instanceof DatabaseNode
                ? dataBaseOrTableNote.database.name
                : dataBaseOrTableNote.parent.database.name;
        const connection: Connection = {
            cluster: clusterUri,
            database
        };
        let cellCode = '';
        if (dataBaseOrTableNote instanceof TableNode) {
            cellCode = [dataBaseOrTableNote.table.name, '| take 1'].join(EOL);
        }
        await createUntitledNotebook(connection, cellCode);
    }
}
