import {randomBytes} from 'node:crypto';
import type * as vscode from 'vscode';
import type {CaseProject} from '../../project/case_project';
import type {Streaming} from '../../streaming/streaming';
import {EditorView} from '../editor_view';
import type {SimulationAction, SimulationStatus} from './simulation_types';

export abstract class SimulationView extends EditorView {
    private busy = false;

    protected constructor(id: string, title: string, protected readonly project: CaseProject, protected readonly streaming: Streaming) {
        super(id, title);
    }

    async execute(api: typeof vscode, action: SimulationAction): Promise<void> {
        if (action === 'apply') {
            if (this.streaming.last_snapshot && await api.window.showWarningMessage(
                'Replace the current simulation with this case at step zero?', {modal: true}, 'Apply') !== 'Apply') {
                return;
            }
            const revision = this.project.revision;
            const config = await this.project.to_simulation_config();
            if (this.streaming.state === 'running') {
                await this.streaming.pause();
            }
            await this.streaming.initialize(config);
            this.project.mark_applied(revision);
            return;
        }
        if (action === 'pause') {
            await this.streaming.pause();
            return;
        }
        if (this.project.applied_revision !== this.project.revision || !this.streaming.last_snapshot) {
            throw new Error('Apply the current case to the engine first.');
        }
        if (action === 'start') {
            this.streaming.start();
        } else if (action === 'step') {
            await this.streaming.step();
        } else if (action === 'reset') {
            await this.streaming.pause();
            await this.streaming.reset();
        }
    }

    protected status(): SimulationStatus {
        return {
            state: this.streaming.state, revision: this.project.revision, busy: this.busy,
            applied: this.project.applied_revision === this.project.revision && this.streaming.last_snapshot !== undefined,
            error: this.streaming.last_error?.message
        };
    }

    protected document(webview: vscode.Webview, script_name: string, body: string): string {
        const nonce = randomBytes(24).toString('hex');
        const script = webview.asWebviewUri(this.api.Uri.joinPath(this.resource_root, `${script_name}.js`));
        const style = webview.asWebviewUri(this.api.Uri.joinPath(this.resource_root, 'simulation.css'));
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${style}"><title>${this.title}</title></head><body>
<header><div class="heading"><strong>ATLAS / ${this.title}</strong><span id="state" role="status">Connecting to view…</span></div>
<nav aria-label="Simulation controls">
${[['apply', 'Apply to Engine'], ['start', 'Start'], ['pause', 'Pause'], ['step', 'Step'], ['reset', 'Reset']]
            .map(([action, label]) => `<button id="${action}" data-action="${action}" disabled>${label}</button>`).join('')}
</nav><span id="applied"></span></header><p id="error" role="alert" hidden></p>
${body}<script nonce="${nonce}" src="${script}"></script></body></html>`;
    }

    protected async handle_message(message: unknown): Promise<void> {
        if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'action'
            || !('action' in message) || typeof message.action !== 'string'
            || !['apply', 'start', 'pause', 'step', 'reset'].includes(message.action)) {
            return;
        }
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.update();
        try {
            await this.execute(this.api, message.action as SimulationAction);
        } finally {
            this.busy = false;
            this.update();
        }
    }
}
