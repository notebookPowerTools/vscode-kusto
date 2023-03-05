import {
    CancellationToken,
    CancellationTokenSource,
    CompletionContext,
    CompletionItem,
    CompletionItemProvider,
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider,
    FoldingContext,
    FoldingRange,
    FoldingRangeProvider,
    FormattingOptions,
    Hover,
    HoverProvider,
    languages,
    NotebookDocument,
    Position,
    Range,
    RenameProvider,
    TextDocument,
    TextDocumentChangeEvent,
    TextEdit,
    workspace,
    WorkspaceEdit
} from 'vscode';
import { EngineSchema } from '../../kusto/schema';
import { getNotebookDocument, NotebookCellScheme, registerDisposable } from '../../utils';
import { ILanguageServiceExport, LanguageService } from './kustoLanguageService';
import * as vsclientConverter from 'vscode-languageclient/lib/common/protocolConverter';
import { TextDocument as LSTextDocument } from 'vscode-languageserver-textdocument';
import { isJupyterNotebook } from '../../kernel/provider';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const languageService: ILanguageServiceExport = require('../../../../libs/kusto/languageService/kustoLanguageService');

const selector = [{ language: 'kusto', scheme: NotebookCellScheme }];

const languageServersPerEngineSchemaAndDefaultDb = new Map<string, LanguageService>();
const documentUriAndEngineSchemaAndDefaultDb = new Map<string, string>();
function getClusterDatabaseId(engineSchema: EngineSchema): string {
    return `${engineSchema.cluster.connectionString}:${engineSchema.database?.name}`;
}
function getLanguageServer(document: TextDocument | NotebookDocument): LanguageService | undefined {
    const uri = getNotebookDocument(document)?.uri;
    const id = uri ? documentUriAndEngineSchemaAndDefaultDb.get(uri.toString()) : '';
    return languageServersPerEngineSchemaAndDefaultDb.get(id || '') || languageService.getKustoLanguageService();
}
export async function setDocumentEngineSchema(document: TextDocument | NotebookDocument, engineSchema: EngineSchema) {
    const uri = getNotebookDocument(document)?.uri || document.uri;
    const id = getClusterDatabaseId(engineSchema);
    documentUriAndEngineSchemaAndDefaultDb.set(uri.toString(), id);
    if (!languageServersPerEngineSchemaAndDefaultDb.has(id)) {
        languageServersPerEngineSchemaAndDefaultDb.set(id, languageService.createLanguageService(engineSchema));
    }
}

function isAJupyterCellThatCanBeIgnored(document: TextDocument) {
    if (!isJupyterNotebook(getNotebookDocument(document))) {
        return false;
    }
    if (document.lineCount > 1) {
        return false;
    }
    const text = document.getText();
    // Ignore some single line kql commands.
    if (
        text.startsWith('%kql') &&
        (text.includes('--version') || text.includes('--help') || text.toLowerCase().includes('azuredataexplorer'))
    ) {
        return true;
    }
    return false;
}
function fixDocument(document: TextDocument): LSTextDocument {
    if (isJupyterNotebook(getNotebookDocument(document))) {
        // With Python cells, we have %%kql, convert them to `//kql` so that we have the exact same number of characters
        // This way complesions work well and its ignored as a comment.
        // Similarly %kql is a single line query, hence it needs to be replaced with spaces.
        const text = document.getText().replace('%%kql', '//kql').replace('%kql ', '     ');
        return LSTextDocument.create(document.uri.toString(), 'kusto', document.version, text);
    } else {
        return LSTextDocument.create(
            document.uri.toString(),
            document.languageId,
            document.version,
            document.getText()
        );
    }
}

export class BrowserLanguageCapabilityProvider
    implements
        CompletionItemProvider,
        HoverProvider,
        DocumentFormattingEditProvider,
        DocumentRangeFormattingEditProvider,
        RenameProvider,
        FoldingRangeProvider
{
    private readonly protocolConverter = vsclientConverter.createConverter(undefined, true, true);
    private readonly diagnosticCollection = languages.createDiagnosticCollection('kusto');
    private readonly documentDiagnosticProgress = new WeakMap<TextDocument, CancellationTokenSource>();
    constructor() {
        registerDisposable(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this));
        registerDisposable(
            workspace.onDidCloseNotebookDocument((e) =>
                e.getCells().forEach((cell) => this.diagnosticCollection.delete(cell.document.uri))
            )
        );
        registerDisposable(workspace.onDidCloseTextDocument((e) => this.diagnosticCollection.delete(e.uri)));
        registerDisposable(this.diagnosticCollection);
    }
    public static register() {
        const provider = new BrowserLanguageCapabilityProvider();
        registerDisposable(languages.registerCompletionItemProvider(selector, provider, ' ', '=', '('));
        registerDisposable(languages.registerHoverProvider(selector, provider));
        registerDisposable(languages.registerDocumentFormattingEditProvider(selector, provider));
        registerDisposable(languages.registerDocumentRangeFormattingEditProvider(selector, provider));
        registerDisposable(languages.registerRenameProvider(selector, provider));
        registerDisposable(languages.registerFoldingRangeProvider(selector, provider));
    }
    private onDidChangeTextDocument(e: TextDocumentChangeEvent) {
        const ls = getLanguageServer(e.document);
        if (!ls) {
            this.diagnosticCollection.delete(e.document.uri);
            return;
        }
        this.documentDiagnosticProgress.get(e.document)?.cancel();
        const cancellation = new CancellationTokenSource();
        this.documentDiagnosticProgress.set(e.document, cancellation);
        ls.doValidation(fixDocument(e.document), []).then((items) => {
            if (cancellation.token.isCancellationRequested) {
                return;
            }
            const diagnosticItems = items.map((item) => this.protocolConverter.asDiagnostic(item));
            this.diagnosticCollection.set(e.document.uri, diagnosticItems);
        });
    }
    public async provideHover(
        document: TextDocument,
        position: Position,
        token: CancellationToken
    ): Promise<Hover | undefined> {
        const ls = getLanguageServer(document);
        if (!ls) {
            return;
        }
        const hover = await ls.doHover(fixDocument(document), position);
        return this.protocolConverter.asHover(hover);
    }
    public async provideDocumentFormattingEdits(
        document: TextDocument,
        options: FormattingOptions,
        token: CancellationToken
    ): Promise<TextEdit[]> {
        const ls = getLanguageServer(document);
        if (!ls || isAJupyterCellThatCanBeIgnored(document)) {
            return [];
        }
        const edits = await ls.doDocumentFormat(fixDocument(document));
        return this.protocolConverter.asTextEdits(edits);
    }
    public async provideDocumentRangeFormattingEdits(
        document: TextDocument,
        range: Range,
        _options: FormattingOptions,
        _token: CancellationToken
    ): Promise<TextEdit[]> {
        const ls = getLanguageServer(document);
        if (!ls || isAJupyterCellThatCanBeIgnored(document)) {
            return [];
        }
        const edits = await ls.doRangeFormat(fixDocument(document), range);
        return this.protocolConverter.asTextEdits(edits);
    }
    public async provideRenameEdits(
        document: TextDocument,
        position: Position,
        newName: string,
        token: CancellationToken
    ): Promise<WorkspaceEdit | undefined> {
        const ls = getLanguageServer(document);
        if (!ls || isAJupyterCellThatCanBeIgnored(document)) {
            return;
        }
        const edit = await ls.doRename(fixDocument(document), position, newName);
        return this.protocolConverter.asWorkspaceEdit(edit);
    }
    public async provideFoldingRanges(
        document: TextDocument,
        context: FoldingContext,
        token: CancellationToken
    ): Promise<FoldingRange[]> {
        const ls = getLanguageServer(document);
        if (!ls) {
            return [];
        }
        const foldingRanges = await ls.doFolding(fixDocument(document));
        return this.protocolConverter.asFoldingRanges(foldingRanges);
    }
    public async provideCompletionItems(
        document: TextDocument,
        position: Position,
        _token: CancellationToken,
        _context: CompletionContext
    ): Promise<CompletionItem[]> {
        const ls = getLanguageServer(document);
        if (!ls) {
            return [];
        }
        try {
            const items = await ls.doComplete(fixDocument(document), position);
            return items.items.map((item) => this.protocolConverter.asCompletionItem(item));
        } catch (ex) {
            console.error('Failed to get completion items', ex);
            return [];
        }
    }
}
