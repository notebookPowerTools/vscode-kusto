import KustoClient from 'azure-kusto-data/source/client';
import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import {
    authentication,
    ExtensionContext,
    Memento,
    notebook,
    NotebookDocument,
    window,
    workspace,
    WorkspaceEdit
} from 'vscode';
import { GlobalMementoKeys } from '../constants';
import { IDisposable } from '../types';
import { disposeAllDisposables, registerDisposable } from '../utils';
import { getClient } from './connectionProvider';

const clientMap = new WeakMap<NotebookDocument, Promise<Client | undefined>>();
let globalState: Memento | undefined;
const clusterRegex = /cluster\(("|')\w*("|')\)/gm;
const databaseRegex = /database\(("|')\w*("|')\)/gm;
function getClusterAndDbFromDocument(document: NotebookDocument): { cluster?: string; database?: string } | undefined {
    let cluster: string | undefined = document.metadata.custom.cluster;
    let database: string | undefined = document.metadata.custom.database;
    for (const cell of document.cells) {
        const text = cell.document.getText();
        if (!cluster && text.indexOf('cluster(')) {
            const matches = text.match(clusterRegex);
            if (Array.isArray(matches) && matches.length > 0) {
                if (matches[0].indexOf('"')) {
                    cluster = matches[0].split('"')[1];
                }
                if (matches[0].indexOf("'")) {
                    cluster = matches[0].split("'")[1];
                }
            }
        }
        if (!database && text.indexOf('database(')) {
            const matches = text.match(databaseRegex);
            if (Array.isArray(matches) && matches.length > 0) {
                if (matches[0].indexOf('"')) {
                    database = matches[0].split('"')[1];
                }
                if (matches[0].indexOf("'")) {
                    database = matches[0].split("'")[1];
                }
            }
        }
        if (cluster && database) {
            break;
        }
    }
    if (cluster || database) {
        return { cluster, database };
    }
}
async function getClusterUri(document: NotebookDocument) {
    const clusterName = getClusterAndDbFromDocument(document)?.cluster || `https://<clusterName>.kusto.windows.net`;
    const value = await window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: clusterName,
        value: clusterName || globalState?.get(GlobalMementoKeys.lastEnteredClusterUri),
        title: 'Enter Kusto Cluster Uri'
    });
    if (!value) {
        return;
    }
    if (globalState) {
        globalState.update(GlobalMementoKeys.lastEnteredClusterUri, value);
    }
    if (value) {
        await updateClusterDbInNotebook(document, value);
    }
    return value;
}
async function updateClusterDbInNotebook(document: NotebookDocument, cluster?: string, database?: string) {
    if (!document.metadata.editable) {
        return;
    }
    const edit = new WorkspaceEdit();
    const custom = JSON.parse(JSON.stringify(document.metadata.custom)) || {};
    if (cluster) {
        custom.cluster = cluster;
    }
    if (database) {
        custom.database = database;
    }
    const newMetadata = document.metadata.with({ custom });
    edit.replaceNotebookMetadata(document.uri, newMetadata);
    await workspace.applyEdit(edit);
}
async function getDefaultDb(document: NotebookDocument) {
    const dbName = getClusterAndDbFromDocument(document)?.database || '';
    const value = await window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: dbName,
        value: dbName || globalState?.get(GlobalMementoKeys.lastEnteredDatabase),
        title: 'Enter Default Database'
    });
    if (!value) {
        return;
    }
    if (globalState) {
        globalState.update(GlobalMementoKeys.lastEnteredDatabase, value);
    }
    if (value) {
        await updateClusterDbInNotebook(document, undefined, value);
    }
    return value;
}
async function getAccessToken() {
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
export class Client implements IDisposable {
    private readonly disposables: IDisposable[] = [];
    private readonly client: KustoClient;
    public readonly hasAccessToken: boolean;
    constructor(
        private readonly document: NotebookDocument,
        clusterUri: string,
        private readonly db: string,
        accessToken?: string
    ) {
        this.hasAccessToken = (accessToken || '').length > 0;
        this.client = getClient(clusterUri, accessToken);
        this.addHandlers();
        registerDisposable(this);
    }
    public static register(context: ExtensionContext) {
        globalState = context.globalState;
    }
    public static async create(document: NotebookDocument): Promise<Client | undefined> {
        const client = clientMap.get(document);
        if (client) {
            return client;
        }

        // eslint-disable-next-line no-async-promise-executor
        const promise = new Promise<Client | undefined>(async (resolve) => {
            const clusterUri = await getClusterUri(document);
            if (!clusterUri) {
                return resolve(undefined);
            }
            const defaultDb = await getDefaultDb(document);
            if (!defaultDb) {
                return resolve(undefined);
            }
            const accessToken = await getAccessToken();
            resolve(new Client(document, clusterUri, defaultDb, accessToken));
        });
        promise.then((item) => {
            if (item) {
                return;
            }
            if (promise === clientMap.get(document)) {
                clientMap.delete(document);
            }
        });
        promise.catch(() => {
            if (promise === clientMap.get(document)) {
                clientMap.delete(document);
            }
        });
        clientMap.set(document, promise);
        return promise;
    }
    public async execute(query: string): Promise<KustoResponseDataSet> {
        if (!this.hasAccessToken) {
            // Ask for access token again (dirty hack until authentication is fixed).
            clientMap.delete(this.document);
        }
        return this.client.execute(this.db, query);
    }
    private addHandlers() {
        notebook.onDidCloseNotebookDocument(
            (e) => {
                if (e === this.document) {
                    this.dispose();
                }
            },
            this,
            this.disposables
        );
    }
    dispose() {
        disposeAllDisposables(this.disposables);
    }
}
