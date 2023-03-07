import * as vscode from 'vscode';
import { NotebookCellData, NotebookCellKind, NotebookData, workspace } from 'vscode';
import { registerDisposable } from '../utils';
import { decoder, encoder } from './utils';
import { EOL } from 'os';
import { FoldingRangesProvider } from '../languageServer';

type KustoCell = {
    source: string[];
    kind: 'markdown' | 'code';
};
export type KustoNotebookConnectionMetadata =
    | {
          cluster: string;
          database: string;
      }
    | { appInsightsId: string };
type KustoNotebookMetadata = {
    locked?: boolean;
    connection?: KustoNotebookConnectionMetadata;
};
export type KustoNotebook = {
    cells: KustoCell[];
    metadata?: KustoNotebookMetadata;
};

let eolFromDocument = '';
function determineEOL(contents = '') {
    if (EOL || eolFromDocument) {
        return EOL || eolFromDocument;
    }
    eolFromDocument = contents ? (contents.includes('\r\n') ? '\r\n' : '\n') : '';

    return eolFromDocument || '\n';
}
export class KqlContentProvider implements vscode.NotebookSerializer {
    async deserializeNotebook(content: Uint8Array, _token: vscode.CancellationToken): Promise<vscode.NotebookData> {
        const kql = decoder.decode(content);
        try {
            const ranges = await FoldingRangesProvider.instance.getRanges(kql);
            const lines = kql.split(/\r?\n/);

            const cells: KustoCell[] = [];
            let currentCellStartLine = 0;
            for (const range of ranges) {
                const previousLines =
                    range.start === currentCellStartLine ? [] : lines.slice(currentCellStartLine, range.start);

                // If this is the first cell, and we have some leading white space, make it part of that cell.
                if (cells.length > 0 && previousLines.length) {
                    // All of the leading white space will be treated as white space but part of the previous cell.
                    cells[cells.length - 1].source.push(...previousLines);
                }

                currentCellStartLine = range.end + 1;

                const source = lines.slice(range.start, range.end + 1);
                const kind = source.every((line) => line.trim().length === 0 || line.trim().startsWith('//'))
                    ? 'markdown'
                    : 'code';

                // We always have an empty line at the end of each cell.
                // No point adding this empty line to the cell.
                if (source.length > 1 && source[source.length - 1].trim().length === 0) {
                    source.pop();
                }

                if (kind === 'markdown') {
                    // Strip all of the leading // from the markdown lines and add empty space ad the end of each line.
                    source.forEach((line, index) => {
                        line = line.trim();
                        if (line.startsWith('//')) {
                            line = line.substring(2);
                        }
                        source[index] = `${line}  `;
                    });
                }
                cells.push({
                    kind,
                    source
                });
            }
            const separator = determineEOL(kql);
            const nbCells = cells.map((item) => {
                const kind = item.kind === 'code' ? NotebookCellKind.Code : NotebookCellKind.Markup;
                const cell = new NotebookCellData(
                    kind,
                    item.source.join(separator),
                    item.kind === 'code' ? 'kusto' : 'markdown'
                );
                return cell;
            });
            const notebookData = new NotebookData(nbCells);
            return notebookData;
        } catch (ex) {
            console.error('Failed to parse notebook contents', ex);
            return new NotebookData([]);
        }
    }
    serializeNotebook(
        document: vscode.NotebookData,
        _token: vscode.CancellationToken
    ): Uint8Array | Thenable<Uint8Array> {
        const kqlLines: string[] = [];
        document.cells.forEach((cell) => {
            const lines = cell.value.split(/\r?\n/);
            let lastLine: string | undefined = undefined;

            // If the last line is empty, keep track of that.
            if (lines.length && lines[lines.length - 1].trim().length === 0) {
                lastLine = lines.splice(lines.length - 1, 1)[0];
            }
            if (cell.kind === NotebookCellKind.Markup) {
                kqlLines.push(...lines.map((line) => `// ${line.trim()}`));
            } else {
                kqlLines.push(...lines);
            }
            // Ensure we have a trailing new line.
            kqlLines.push(lastLine || '');
        });
        const separator = determineEOL();
        return encoder.encode(kqlLines.join(separator));
    }

    public static register() {
        const disposable = workspace.registerNotebookSerializer('kusto-notebook-kql', new KqlContentProvider(), {
            transientOutputs: true,
            transientDocumentMetadata: {}
        });
        registerDisposable(disposable);
    }
}
