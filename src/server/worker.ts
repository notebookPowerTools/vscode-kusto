import * as path from 'path';
import type { ILanguageServiceExport, LanguageService } from './kustoLanguageService';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dynamicRequireToDisableWebPackBundling = eval(['r', 'e', 'q' + 'uire'].join(''));
const languageService: ILanguageServiceExport = dynamicRequireToDisableWebPackBundling(
    path.join(__dirname, '..', '..', 'libs', 'kusto', 'languageService', 'kustoLanguageService')
);
import {
    Diagnostic,
    CompletionList,
    FoldingRange,
    Hover,
    Position,
    Range,
    TextEdit,
    WorkspaceEdit
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { EngineSchema } from './schema';
import { getNotebookUri } from './utils';

const languageServersPerEngineSchemaAndDefaultDb = new Map<string, LanguageService>();
const documentUriAndEngineSchemaAndDefaultDb = new Map<string, string>();
function getClusterDatabaseId(engineSchema: EngineSchema): string {
    return `${engineSchema.cluster.connectionString}:${engineSchema.database?.name}`;
}
function getLanguageServer(document: TextDocument): LanguageService {
    const uri = getNotebookUri(document);
    const id = documentUriAndEngineSchemaAndDefaultDb.get(uri.toString());
    return languageServersPerEngineSchemaAndDefaultDb.get(id || '') || languageService.getKustoLanguageService();
}
export async function setDocumentEngineSchema(uri: string, engineSchema: EngineSchema) {
    uri = getNotebookUri(uri).toString();
    const id = getClusterDatabaseId(engineSchema);
    documentUriAndEngineSchemaAndDefaultDb.set(uri, id);
    const oldLs = languageServersPerEngineSchemaAndDefaultDb.get(id);
    if (oldLs) {
        await oldLs.setSchema(engineSchema);
        return;
    }
    const newLs = languageService.createLanguageService(engineSchema);
    languageServersPerEngineSchemaAndDefaultDb.set(id, newLs);
}
export async function getCompletions(document: TextDocument, position: Position): Promise<CompletionList> {
    const ls = getLanguageServer(document);
    return ls.doComplete(document, Position.create(position.line, position.character));
}
export async function getValidations(
    document: TextDocument,
    intervals: { start: number; end: number }[]
): Promise<Diagnostic[]> {
    const ls = getLanguageServer(document);
    return ls.doValidation(document, intervals);
}
export async function doHover(document: TextDocument, position: Position): Promise<Hover | undefined> {
    const ls = getLanguageServer(document);
    return ls.doHover(document, position);
}
export async function doDocumentFormat(document: TextDocument): Promise<TextEdit[]> {
    const ls = getLanguageServer(document);
    return ls.doDocumentFormat(document);
}
export async function doRangeFormat(document: TextDocument, range: Range): Promise<TextEdit[]> {
    const ls = getLanguageServer(document);
    return ls.doRangeFormat(document, range);
}
export async function doRename(
    document: TextDocument,
    position: Position,
    newName: string
): Promise<WorkspaceEdit | undefined> {
    const ls = getLanguageServer(document);
    return ls.doRename(document, position, newName);
}
export async function doFolding(document: TextDocument): Promise<FoldingRange[]> {
    const ls = getLanguageServer(document);
    return ls.doFolding(document);
}

export function disposeAllLanguageServers() {
    languageServersPerEngineSchemaAndDefaultDb.clear();
}
