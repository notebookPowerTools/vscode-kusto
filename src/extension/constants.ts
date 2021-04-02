// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
export const EXTENSION_ROOT_DIR = path.join(__dirname, '..', '..');

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const noop = () => {};

export enum GlobalMementoKeys {
    clusterUris = 'clusterUris',
    lastEnteredClusterUri = 'lastEnteredClusterUri',
    lastEnteredDatabase = 'lastEnteredDatabase',
    prefixForClusterSchema = 'prefixForClusterSchema',
    prefixForDatabasesInACluster = 'prefixForDatabasesInACluster',
    prefixForTablesInAClusterDB = 'prefixForTablesInAClusterDB'
}
