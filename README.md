# Kusto in Notebooks

A [Visual Studio Code](https://code.visualstudio.com/) [extension](https://marketplace.visualstudio.com/items?itemName=donjayamanne.kusto) that provides the ability to run Kusto queries in Notebooks.

<img src=https://raw.githubusercontent.com/DonJayamanne/vscode-kusto/main/images/main.gif>

# Features
* Run Kusto Queries
* Graphs & Data Viewer
* Code Completion
* Syntax highlighting
* Code refactoring
* Code formatting
* Kusto panel with access to Clusters, Databases, Tables, etc

# Getting Started
* Please install VS Code Insiders (stable is not yet supported)
* Install this extension
* Launch VS Code with the following command line `code-insiders --enable-proposed-api=donjayamanne.kusto`
* Create a file with extension `*.knb` (or use the command `Create Kusto Notebook`)
* Use the command `Configure Kusto Connection` to configure the Kusto connection.

# Works with Jupyter Notebooks as well (when using [kqlmagic](https://pypi.org/project/Kqlmagic/))
* This extension augments Jupyter Notebooks with Kusto language features, when using the [Jupyter](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) extension.
* The extension will automatically detect the cluster and database from cells containing the connection information `kql AzureDataExplorer://code;cluster='help';database='Samples'`.

# Difference between Kusto Notebooks & Jupyter Notebooks  (with [kqlmagic](https://pypi.org/project/Kqlmagic/))
* Kusto Notebooks, there are no additional dependencies.
    * Authentication against Azure is handled by VS Code.
* With Jupyter Notebooks, you'll need to install Python and the [kqlmagic](https://pypi.org/project/Kqlmagic/) package.
    * You can use Python to further analyze the data.

# Preview
This extension is still in preview and a very early build with a long way to go before it is ready for day to day use.
* Limited to VS Code Insiders
* Launch VS Code with the following command line `code-insiders --enable-proposed-api=donjayamanne.kusto`

# Authentication
* VS Code handles Azure Authentication (if required)
# Roadmap
* Support for more charts
* Ability to lock cells (preserve the results and ensure its never lost)
* Support for plain text files (*.csl/*.kql)
* & more...

# Thanks to the contributors
[Joyce Er](https://github.com/joyceerhl)
[SteVen Batten](https://github.com/sbatten)
[Peng Lyu](https://github.com/rebornix)
[Tanha Kabir](https://github.com/tanhakabir)

# License

MIT
