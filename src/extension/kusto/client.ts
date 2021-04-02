import KustoClient from 'azure-kusto-data/source/client';
import { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import { notebook, NotebookDocument, TextDocument } from 'vscode';
import {
    addNotebookConnectionHandler,
    ensureNotebookHasClusterDbInfo,
    getClusterAndDbFromDocumentMetadata
} from '../kernel/notebookConnection';
import { IDisposable } from '../types';
import { disposeAllDisposables, registerDisposable } from '../utils';
import { getAccessToken, getClient } from './connectionProvider';

const clientMap = new WeakMap<NotebookDocument | TextDocument, Promise<Client | undefined>>();

export class Client implements IDisposable {
    private readonly disposables: IDisposable[] = [];
    private readonly client: KustoClient;
    public readonly hasAccessToken: boolean;
    constructor(
        private readonly document: NotebookDocument | TextDocument,
        public readonly clusterUri: string,
        private readonly db: string,
        accessToken?: string
    ) {
        this.hasAccessToken = (accessToken || '').length > 0;
        this.client = getClient(clusterUri, accessToken);
        this.addHandlers();
        registerDisposable(this);
    }
    public static async remove(document: NotebookDocument) {
        clientMap.delete(document);
    }
    public static async create(document: NotebookDocument | TextDocument): Promise<Client | undefined> {
        const client = clientMap.get(document);
        if (client) {
            return client;
        }

        // eslint-disable-next-line no-async-promise-executor
        const promise = new Promise<Client | undefined>(async (resolve) => {
            await ensureNotebookHasClusterDbInfo(document);
            const info = getClusterAndDbFromDocumentMetadata(document);
            if (!info || !info.cluster || !info.database) {
                return resolve(undefined);
            }
            const accessToken = await getAccessToken();
            resolve(new Client(document, info.cluster, info.database, accessToken));
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
            // We need to see if the old way ever gets used.
            clientMap.delete(this.document);
        }
        return this.client.execute(this.db, query);
    }
    private addHandlers() {
        addNotebookConnectionHandler((e) => clientMap.delete(e));
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
