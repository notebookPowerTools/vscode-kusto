import {
    CancellationToken,
    CodeLens,
    CodeLensProvider,
    EventEmitter,
    FoldingRange,
    languages,
    Range,
    TextDocument
} from 'vscode';
import { FoldingRangesProvider } from '../languageServer';
import { IDisposable } from '../types';
import { disposeAllDisposables, isNotebookCell, registerDisposable } from '../utils';

export class CellCodeLensProvider implements CodeLensProvider, IDisposable {
    private readonly _onDidChangeCodeLenses = new EventEmitter<void>();
    private readonly disposables: IDisposable[] = [];
    constructor() {
        FoldingRangesProvider.instance.onDidChange(() => this._onDidChangeCodeLenses.fire(), this, this.disposables);
    }
    public static register() {
        const provider = new CellCodeLensProvider();
        registerDisposable(languages.registerCodeLensProvider({ language: 'kusto' }, provider));
        registerDisposable(provider);
    }
    public dispose() {
        disposeAllDisposables(this.disposables);
    }
    public async provideCodeLenses(document: TextDocument, _token: CancellationToken): Promise<CodeLens[]> {
        if (isNotebookCell(document)) {
            return [];
        }
        const ranges = await FoldingRangesProvider.instance.getRanges(document);
        const codelenses: CodeLens[] = [];
        ranges.forEach((item) => {
            const index = getStartOfCode(document, item);
            if (typeof index !== 'number') {
                return;
            }
            codelenses.push(
                new CodeLens(new Range(index, 0, item.end, 0), {
                    title: 'Run Query',
                    command: 'kusto.executeSelectedQuery',
                    arguments: [document, index, item.end]
                })
            );
        });
        return codelenses;
    }
}

function isComment(document: TextDocument, index: number) {
    const line = document.lineAt(index);
    return line.isEmptyOrWhitespace || line.text.trim().startsWith('//');
}

function getStartOfCode(document: TextDocument, range: FoldingRange): number | undefined {
    for (let index = range.start; index <= range.end; index++) {
        if (!isComment(document, index)) {
            return index;
        }
    }
}
