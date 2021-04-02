const { Worker, isMainThread, parentPort } = require('worker_threads');
var languageService = require('./kusto/languageService/kustoLanguageService');
var types = require('vscode-languageserver-types');
var vscUri = require('vscode-uri');
const { format } = require('util');

async function main() {
    const uri = vscUri.URI.parse('file://sample.csl');
    const ls = languageService.getKustoLanguageService();
    const doc = types.TextDocument.create(uri, 'kusto', 1, `KustoLogs \n| where `);
    const position = types.Position.create(2, 7);
    const items = await ls.doComplete(doc, position);
    return items;
}

async function getCompletions(text, position) {
    const uri = vscUri.URI.parse('file://sample.csl');
    const ls = languageService.getKustoLanguageService();
    const doc = types.TextDocument.create(uri, 'kusto', 1, text);
    // const position = types.Position.create(position.line, position.character);
    return ls.doComplete(doc, types.Position.create(position.line, position.character));
}
async function getValidations(text) {
    const uri = vscUri.URI.parse('file://sample.csl');
    const ls = languageService.getKustoLanguageService();
    const doc = types.TextDocument.create(uri, 'kusto', 1, text);
    // const position = types.Position.create(position.line, position.character);
    return ls.doValidation(doc, []);
}
const messages = [];
parentPort.on('message', async (e) => {
    messages.push(e);
    // console.log('1234');
    // parentPort.postMessage(`Got message ${typeof e}`);
    // console.error(e);
    if (e.command === 'doComplete') {
        try {
            const completions = await getCompletions(e.text, e.position);
            parentPort.postMessage(`Got completions`);
            parentPort.postMessage({ completions, requestId: e.requestId });
            // parentPort.postMessage(JSON.stringify(completions));
        } catch (ex) {
            parentPort.postMessage(`Failed to get completions, ${format(ex)}`);
        }
    } else if (e.command === 'doValidate') {
        try {
            const validations = await getValidations(e.text);
            parentPort.postMessage(`Got validations`);
            parentPort.postMessage({ validations, requestId: e.requestId });
            // parentPort.postMessage(JSON.stringify(completions));
        } catch (ex) {
            parentPort.postMessage(`Failed to get validations, ${format(ex)}`);
        }
    } else {
        console.log(`Unknown message ${e}`);
    }
});

parentPort.postMessage('init');
