// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ExtensionContext } from 'vscode';
import { ContentProvider } from './content/provider';
import { KernelProvider } from './kernel/provider';
import { Client } from './kusto/client';
import { registerDisposableRegistry } from './utils';

export function activate(context: ExtensionContext) {
    KernelProvider.register();
    Client.register(context);
    registerDisposableRegistry(context);
    ContentProvider.register();
}

export function deactivate(): void {
    // Noop.
}
