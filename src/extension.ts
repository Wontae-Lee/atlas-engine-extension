import * as vscode from 'vscode';
import {ExtensionApp} from './atlas/app/extension_app';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const app = new ExtensionApp(context);
    context.subscriptions.push(app);
    await app.initialize();
}

export function deactivate(): void {}
