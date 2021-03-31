# Run Kusto Queries in Notebooks

A [Visual Studio Code](https://code.visualstudio.com/) [extension](https://marketplace.visualstudio.com/items?itemName=donjayamanne.kusto) that provides the ability to run Kusto queries in Notebooks.

<img src=https://raw.githubusercontent.com/DonJayamanne/vscode-kusto/main/images/main.gif>

# Getting Started
* Please install VS Code Insiders (stable is not yet supported)
* Install the [Kusto extensions pack](https://marketplace.visualstudio.com/items?itemName=rosshamish.kuskus-extensions-pack) from the marketplace
* Install this extension
* Launch VS Code with the following command line `code --enable-proposed-api=donjayamanne.kusto`
* Create a file with extension `*.knb`

# Preview
This extension is still in preview and a very early build with a long way to go before it is ready for day to day use.
* Limited to VS Code Insiders
* Launch VS Code with the following command line `code --enable-proposed-api=donjayamanne.kusto`

# Authentication
* When running a cell you'll be prompted to entre the cluster name & default database.
* You'll also be prompted to authenticate against Microsoft, if not provided, then you'll need to manually provide an Auth token
    * Use the following CLI to generate an Auth Token `az account get-access-token --resource https://<Cluster Name>.kusto.windows.net`

# Roadmap
* Support more charts
* Ability to lock cells (preserve the results and ensure its never lost)
* Better code completion, syntax highlighting

# License

MIT
