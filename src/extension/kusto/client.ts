import KustoClient from 'azure-kusto-data/source/client';
import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import { ExtensionContext, Memento, notebook, NotebookDocument, window } from 'vscode';
import { GlobalMementoKeys } from '../constants';
import { IDisposable } from '../types';
import { disposeAllDisposables, registerDisposable } from '../utils';
import { getClient } from './connectionProvider';

const clientMap = new WeakMap<NotebookDocument, Promise<Client | undefined>>();
let globalState: Memento | undefined;

async function getClusterUri() {
    const value = await window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: 'https://<clusterName>.kusto.windows.net',
        value: globalState?.get(GlobalMementoKeys.lastEnteredClusterUri) || 'https://<clusterName>.kusto.windows.net',
        title: 'Enter Kusto Cluster Uri'
    });
    if (!value) {
        return;
    }
    if (globalState) {
        globalState.update(GlobalMementoKeys.lastEnteredClusterUri, value);
    }
    return value;
}
async function getDefaultDb() {
    const value = await window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: '',
        value: globalState?.get(GlobalMementoKeys.lastEnteredDatabase) || '',
        title: 'Enter Default Database'
    });
    if (!value) {
        return;
    }
    if (globalState) {
        globalState.update(GlobalMementoKeys.lastEnteredDatabase, value);
    }
    return value;
}
function getAccessToken() {
    return window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: '',
        title: 'Enter Access Token'
    });
}
export class Client implements IDisposable {
    private readonly disposables: IDisposable[] = [];
    private readonly client: KustoClient;
    constructor(
        private readonly document: NotebookDocument,
        clusterUri: string,
        private readonly db: string,
        accessToken?: string
    ) {
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
            const clusterUri = await getClusterUri();
            if (!clusterUri) {
                return resolve(undefined);
            }
            const defaultDb = await getDefaultDb();
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
