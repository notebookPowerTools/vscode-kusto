import { commands, window } from 'vscode';
import { noop } from '../constants';
import { addClusterAddedHandler, addClusterUri } from '../kernel/notebookConnection';
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
        registerDisposable(commands.registerCommand('kusto.removeCluster', noop, handler));
        registerDisposable(commands.registerCommand('kusto.refreshNode', handler.onRefershNode, handler));
        addClusterAddedHandler((clusterUri) => clusterExplorer.addCluster(clusterUri));
        clusterExplorer.refresh();
    }

    private async onRefershNode(e) {
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
}
