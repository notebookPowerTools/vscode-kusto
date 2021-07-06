import { authentication, window } from 'vscode';

export async function getAccessToken() {
    const scopes = ['https://management.core.windows.net/.default', 'offline_access'];
    const session = await authentication.getSession('microsoft', scopes, { createIfNone: true });
    if (session?.accessToken) {
        return session.accessToken;
    }
    return window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: '',
        prompt: 'Enter Access Token'
    });
}
