import { NotebookKernelProvider, NotebookDocument, CancellationToken, NotebookKernel, notebook, Uri } from 'vscode';
import { Kernel } from './kernel';

export class KernelProvider implements NotebookKernelProvider {
    public provideKernels(document: NotebookDocument, _: CancellationToken): NotebookKernel[] {
        return [new Kernel(document)];
    }

    public static register() {
        notebook.registerNotebookKernelProvider(
            { viewType: ['kusto-notebook', 'kusto-interactive'] },
            new KernelProvider()
        );
    }
}

export function isJupyterNotebook(document: NotebookDocument) {
    return document.viewType === 'jupyter-notebook';
}
export function isKustoNotebook(document: NotebookDocument) {
    return document.viewType === 'kusto-notebook';
}
export function isKustoInteractive(document: Uri | NotebookDocument) {
    return 'viewType' in document
        ? document.viewType === 'kusto-interactive'
        : document.fsPath.toLowerCase().endsWith('.knb-interactive');
}
