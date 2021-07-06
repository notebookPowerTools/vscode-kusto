import { TextEditor } from 'vscode';
import { commands } from 'vscode';
import { isKustoFile, registerDisposable } from '../utils';

export function registerInteractiveExperience() {
    registerDisposable(commands.registerTextEditorCommand('kusto.executeSelectedQuery', executeSelectedQuery));
}

async function executeSelectedQuery(editor: TextEditor) {
    if (!isKustoFile(editor.document)) {
        return;
    }
}
