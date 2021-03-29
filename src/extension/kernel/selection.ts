import { ExtensionContext, languages, notebook, NotebookCellKind, workspace, WorkspaceEdit } from 'vscode';
import { Kernel } from './kernel';

export function registerKernelSelection(context: ExtensionContext) {
    const disposable = notebook.onDidChangeActiveNotebookKernel((data) => {
        if (data.kernel instanceof Kernel) {
            data.document.cells
                .filter((cell) => cell.kind === NotebookCellKind.Code)
                .forEach((cell) => languages.setTextDocumentLanguage(cell.document, 'kusto'));

            const edit = new WorkspaceEdit();
            edit.replaceNotebookMetadata(
                data.document.uri,
                data.document.metadata.with({
                    custom: {
                        metadata: {
                            kernelspec: { name: 'kusto', display_name: 'Kusto' },
                            language_info: {
                                name: 'kusto',
                                file_extension: '.csl'
                            }
                        }
                    }
                })
            );
            workspace.applyEdit(edit);
        }
    });

    context.subscriptions.push(disposable);
}
