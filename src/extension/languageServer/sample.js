var languageService = require('./kusto/languageService/kustoLanguageService');
var types = require('vscode-languageserver-types');
var vscUri = require('vscode-uri');

async function main() {
    const uri = vscUri.URI.parse('file://sample.csl');
    const ls = languageService.getKustoLanguageService();
    const doc = types.TextDocument.create(uri, 'kusto', 1, `KustoLogs \n| where `);
    const position = types.Position.create(2, 7);
    console.log(uri);
    const items = await ls.doComplete(doc, position);
    console.log(items);
}
main();
