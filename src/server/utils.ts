import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

export function getNotebookUri(notebookCellOrUri: TextDocument | URI | string) {
    const uri =
        typeof notebookCellOrUri === 'string'
            ? notebookCellOrUri
            : 'uri' in notebookCellOrUri
            ? notebookCellOrUri.uri.toString()
            : notebookCellOrUri.toString();
    // Generate uri of the notebook document.
    // Assume its file uri, we'll always use File uri.
    // Unlikely we'll have a clash where user opens two file systems & has a file with same name in both file systems.
    return URI.parse(uri).with({ fragment: '', scheme: 'file' });
}
