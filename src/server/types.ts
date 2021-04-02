import type { CompletionList, Position } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, FoldingRange, Hover, Location, Range, TextEdit, WorkspaceEdit } from 'vscode-languageserver-types';
import { ScalarParameter, showSchema, Schema, EngineSchema } from './schema';

export type ILanguageServer = {
    doComplete(document: TextDocument, position: Position): Promise<CompletionList>;
    doRangeFormat(document: TextDocument, range: Range): Promise<TextEdit[]>;
    doDocumentFormat(document: TextDocument): Promise<TextEdit[]>;
    doCurrentCommandFormat(document: TextDocument, caretPosition: Position): Promise<TextEdit[]>;
    doFolding(document: TextDocument): Promise<FoldingRange[]>;
    doValidation(document: TextDocument, intervals: { start: number; end: number }[]): Promise<Diagnostic[]>;
    // doColorization(document: TextDocument, intervals: { start: number; end: number }[]): Promise<ColorizationRange[]>;
    doRename(doucment: TextDocument, position: Position, newName: string): Promise<WorkspaceEdit | undefined>;
    doHover(document: TextDocument, position: Position): Promise<Hover | undefined>;
    setParameters(parameters: ScalarParameter[]);
    setSchema(schema: Schema): Promise<void>;
    setSchemaFromShowSchema(
        schema: showSchema.Result,
        clusterConnectionString: string,
        databaseInContextName: string,
        globalParameters?: ScalarParameter[]
    ): Promise<void>;
    normalizeSchema(
        schema: showSchema.Result,
        clusterConnectionString: string,
        databaseInContextName: string
    ): Promise<EngineSchema>;
    getSchema(): Promise<Schema>;
    getCommandInContext(document: TextDocument, cursorOffset: number): Promise<string>;
    getCommandAndLocationInContext(
        document: TextDocument,
        cursorOffset: number
    ): Promise<{ text: string; location: Location } | null>;
    getCommandsInDocument(
        document: TextDocument
    ): Promise<{ absoluteStart: number; absoluteEnd: number; text: string }[]>;
    // configure(languageSettings: LanguageSettings): void;
    getClientDirective(text: string): Promise<{ isClientDirective: boolean; directiveWithoutLeadingComments: string }>;
    getAdminCommand(text: string): Promise<{ isAdminCommand: boolean; adminCommandWithoutLeadingComments: string }>;
    findDefinition(document: TextDocument, position: Position): Promise<Location[]>;
    findReferences(document: TextDocument, position: Position): Promise<Location[]>;
    getQueryParams(document: TextDocument, cursorOffset: number): Promise<{ name: string; type: string }[]>;
    getGlobalParams(document: TextDocument): Promise<{ name: string; type: string }[]>;
    getReferencedGlobalParams(document: TextDocument, offset: number): Promise<{ name: string; type: string }[]>;
    // getRenderInfo(document: TextDocument, cursorOffset: number): Promise<RenderInfo | undefined>;
};
