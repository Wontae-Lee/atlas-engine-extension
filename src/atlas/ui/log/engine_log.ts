import type * as vscode from 'vscode';

export class EngineLog implements vscode.Disposable {
    private readonly channel: vscode.OutputChannel;

    constructor(api: typeof vscode) {
        this.channel = api.window.createOutputChannel('ATLAS ENGINE LOG');
    }

    append(message: string): void { this.channel.append(message); }
    show(): void { this.channel.show(true); }
    dispose(): void { this.channel.dispose(); }
}
