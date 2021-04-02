# Run Kusto Queries in Notebooks

A [Visual Studio Code](https://code.visualstudio.com/) [extension](https://marketplace.visualstudio.com/items?itemName=donjayamanne.kusto) that provides the ability to run Kusto queries in Notebooks.

<img src=https://raw.githubusercontent.com/DonJayamanne/vscode-kusto/main/images/main.gif>

# Features
* Run Kusto Queries
* Graphs & Data Viewer
* Code Completion
* Syntax highlighting
* Code refactoring
* Code formatting

# Works with Jupyter Notebooks as well (when using [kqlmagic](https://pypi.org/project/Kqlmagic/))
* This extension augments Jupyter Notbooks with Kusto language features, when using the [Jupyter](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) extension.
* The extension will automatically detect the cluster and database from cells containing the connection information `kql AzureDataExplorer://code;cluster='help';database='Samples'`.

# Getting Started
* Please install VS Code Insiders (stable is not yet supported)
* Install this extension
* Launch VS Code with the following command line `code-insiders --enable-proposed-api=donjayamanne.kusto`
* Create a file with extension `*.knb`

# Difference between Kusto Notebooks & Jupyter Notebooks  (with [kqlmagic](https://pypi.org/project/Kqlmagic/))
* Kusto Notebooks, there are no additional dependencies.
* With Jupyter Notebooks, you'll need to install Python and the [kqlmagic](https://pypi.org/project/Kqlmagic/) package.
    * You can use Python to further analyze the data.

# Preview
This extension is still in preview and a very early build with a long way to go before it is ready for day to day use.
* Limited to VS Code Insiders
* Launch VS Code with the following command line `code-insiders --enable-proposed-api=donjayamanne.kusto`

# Authentication
* When running a cell you'll be prompted to entre the cluster name & default database.
* You'll also be prompted to authenticate against Microsoft, if not provided, then you'll need to manually provide an Auth token
    * Use the following CLI to generate an Auth Token `az account get-access-token --resource https://<Cluster Name>.kusto.windows.net`

# Roadmap
* Support for more charts
* Ability to lock cells (preserve the results and ensure its never lost)

# License

MIT
