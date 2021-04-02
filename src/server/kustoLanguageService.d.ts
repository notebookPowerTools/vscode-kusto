import type { TextDocument } from 'vscode-languageserver-textdocument';
import type {
    CompletionList,
    Diagnostic,
    FoldingRange,
    Hover,
    Location,
    Position,
    Range,
    TextEdit,
    WorkspaceEdit
} from 'vscode-languageserver-types';
import { RenderInfo } from './renderInfo';
import type * as s from './schema';
import { LanguageSettings } from './settings';

/**
 * A plain old javascript object that is roughly equivalent to the @kusto/language-service-next object, but without
 * all the Bridge.Net properties and methods. this object is being sent from web worker to main thread and turns out
 * that when posting the message we lose all properties (and functions), thus we use a POJO instead.
 * This issue started happening once upgrading to 0.20.0 from 0.15.5.
 */
export interface ClassifiedRange {
    // kind: k2.ClassificationKind;
    kind: unknown;
    start: number;
    length: number;
    end: number;
}

/**
 * colorization data for specific line range.
 */
export interface ColorizationRange {
    classifications: ClassifiedRange[];
    absoluteStart: number;
    absoluteEnd: number;
}

export interface LanguageService {
    doComplete(document: TextDocument, position: Position): Promise<CompletionList>;
    doRangeFormat(document: TextDocument, range: Range): Promise<TextEdit[]>;
    doDocumentFormat(document: TextDocument): Promise<TextEdit[]>;
    doCurrentCommandFormat(document: TextDocument, caretPosition: Position): Promise<TextEdit[]>;
    doFolding(document: TextDocument): Promise<FoldingRange[]>;
    doValidation(document: TextDocument, intervals: { start: number; end: number }[]): Promise<Diagnostic[]>;
    doColorization(document: TextDocument, intervals: { start: number; end: number }[]): Promise<ColorizationRange[]>;
    doRename(doucment: TextDocument, position: Position, newName: string): Promise<WorkspaceEdit | undefined>;
    doHover(document: TextDocument, position: Position): Promise<Hover | undefined>;
    setParameters(parameters: s.ScalarParameter[]);
    setSchema(schema: s.Schema): Promise<void>;
    setSchemaFromShowSchema(
        schema: s.showSchema.Result,
        clusterConnectionString: string,
        databaseInContextName: string,
        globalParameters?: s.ScalarParameter[]
    ): Promise<void>;
    normalizeSchema(
        schema: s.showSchema.Result,
        clusterConnectionString: string,
        databaseInContextName: string
    ): Promise<s.EngineSchema>;
    getSchema(): Promise<s.Schema>;
    getCommandInContext(document: TextDocument, cursorOffset: number): Promise<string>;
    getCommandAndLocationInContext(
        document: TextDocument,
        cursorOffset: number
    ): Promise<{ text: string; location: Location } | null>;
    getCommandsInDocument(
        document: TextDocument
    ): Promise<{ absoluteStart: number; absoluteEnd: number; text: string }[]>;
    configure(languageSettings: LanguageSettings): void;
    getClientDirective(text: string): Promise<{ isClientDirective: boolean; directiveWithoutLeadingComments: string }>;
    getAdminCommand(text: string): Promise<{ isAdminCommand: boolean; adminCommandWithoutLeadingComments: string }>;
    findDefinition(document: TextDocument, position: Position): Promise<Location[]>;
    findReferences(document: TextDocument, position: Position): Promise<Location[]>;
    getQueryParams(document: TextDocument, cursorOffset: number): Promise<{ name: string; type: string }[]>;
    getGlobalParams(document: TextDocument): Promise<{ name: string; type: string }[]>;
    getReferencedGlobalParams(document: TextDocument, offset: number): Promise<{ name: string; type: string }[]>;
    getRenderInfo(document: TextDocument, cursorOffset: number): Promise<RenderInfo | undefined>;
}

export type ILanguageServiceExport = {
    getKustoLanguageService: () => LanguageService;
    createLanguageService: (schema: s.EngineSchema) => LanguageService;
};
