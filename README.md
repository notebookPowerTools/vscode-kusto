# Run Kusto Queries in Notebooks

A [Visual Studio Code](https://code.visualstudio.com/) [extension](https://marketplace.visualstudio.com/items?itemName=donjayamanne.kusto) that provides the ability to run Kusto queries in Notebooks.

<img src=https://raw.githubusercontent.com/DonJayamanne/vscode-kusto/main/images/main.gif>

# Getting Started
* Please install VS Code Insiders (stable is not yet supported)
* Ensure you have install the [Jupyter](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) extension from the marketplace
* Ensure you have install the [Kusto extensions pack](https://marketplace.visualstudio.com/items?itemName=rosshamish.kuskus-extensions-pack) from the marketplace
* Install this extension
* Launch VS Code with the following command line `code --enable-proposed-api=donjayamanne.kusto`
* Create a file with extension `*.knb`

# Preview
This extension is still in preview and a very early build with a long way to go before it is ready for day to day use.
* Limited to VS Code Insiders
* Launch VS Code with the following command line `code --enable-proposed-api=donjayamanne.kusto`
* Authenticating (against Kustos clusters) is not the best experience.

# Authentication
* When running a cell you'll be prompted to entre the cluster name & default database.
* Unfortunately you'll need to authenticate every execution, unless you manually generate an auth token using the following CLI:
    `az account get-access-token --resource https://<Cluster Name>.kusto.windows.net`
* Please note, this is temporary and there are plans for better (persistent) authentication mechanisms.

# License

MIT
