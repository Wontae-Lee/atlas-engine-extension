import type * as vscode from 'vscode';
import {randomBytes} from 'node:crypto';
import type {SimulationViewModel} from './simulation_view_model';
import {is_action, type SimulationAction} from './messages';

export class SimulationView implements vscode.Disposable {
    private panel?: vscode.WebviewPanel;
    private ready = false;
    private model?: SimulationViewModel;

    constructor(private readonly api: typeof vscode, private readonly extension_uri: vscode.Uri,
                private readonly execute: (action: SimulationAction) => Promise<void>) {}

    open(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = this.api.window.createWebviewPanel('atlas-engine.scene', 'Atlas Simulation',
            this.api.ViewColumn.One, {enableScripts: true,
                localResourceRoots: [this.api.Uri.joinPath(this.extension_uri, 'dist', 'webview')]});
        this.ready = false;
        const panel = this.panel;
        const nonce = randomBytes(16).toString('base64');
        const script = panel.webview.asWebviewUri(this.api.Uri.joinPath(this.extension_uri, 'dist', 'webview', 'main.js'));
        const style = panel.webview.asWebviewUri(this.api.Uri.joinPath(this.extension_uri, 'dist', 'webview', 'simulation.css'));
        panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';">
            <link rel="stylesheet" href="${style}"></head><body>
            <div id="controls"><button data-action="apply">Apply</button><button data-action="start">Start</button>
            <button data-action="pause">Pause</button><button data-action="step">Step</button>
            <button data-action="restart">Restart</button><button data-action="save">Save State</button>
            <button data-action="render_open">Open Renderer</button><button data-action="render_close">Close Renderer</button></div>
            <div id="summary"></div><canvas id="conditions"></canvas>
            <script nonce="${nonce}" src="${script}"></script></body></html>`;
        panel.webview.onDidReceiveMessage(message => {
            if (message && typeof message === 'object' && message.type === 'ready') {
                this.ready = true;
                this.update(this.model);
            } else if (message && typeof message === 'object' && message.type === 'action' && is_action(message.action)) {
                void this.execute(message.action).catch(error =>
                    void this.api.window.showErrorMessage(error instanceof Error ? error.message : String(error)));
            }
        });
        panel.onDidDispose(() => { this.panel = undefined; this.ready = false; });
    }

    update(model?: SimulationViewModel): void {
        this.model = model;
        if (this.panel && this.ready) {
            void this.panel.webview.postMessage({type: 'model', model});
        }
    }

    dispose(): void { this.panel?.dispose(); }
}
