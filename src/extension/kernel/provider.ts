import { NotebookKernelProvider, NotebookDocument, CancellationToken, NotebookKernel, notebook } from 'vscode';
import { Kernel } from './kernel';

export class KernelProvider implements NotebookKernelProvider {
    public provideKernels(document: NotebookDocument, _: CancellationToken): NotebookKernel[] {
        return [new Kernel(document)];
    }

    public static register() {
        notebook.registerNotebookKernelProvider({ filenamePattern: '*.knb' }, new KernelProvider());
    }
}
