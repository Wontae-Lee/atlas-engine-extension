import type * as vscode from 'vscode';
import type {BackendMode, BackendState} from '../../backend/backend_types';
import type {ActiveSession} from '../../app/active_session';

export class StatusBar implements vscode.Disposable {
    private readonly backend: vscode.StatusBarItem;
    private readonly session: vscode.StatusBarItem;

    constructor(api: typeof vscode) {
        this.backend = api.window.createStatusBarItem('atlas-engine.backend', api.StatusBarAlignment.Left, 100);
        this.backend.command = 'atlas-engine.backend.select';
        this.backend.show();
        this.session = api.window.createStatusBarItem('atlas-engine.session', api.StatusBarAlignment.Left, 99);
        this.session.command = 'atlas-engine.scene.open';
        this.session.show();
    }

    update(mode: BackendMode, state: BackendState, active?: ActiveSession): void {
        this.backend.text = `Atlas Backend: ${mode.toUpperCase()} · ${state}`;
        this.session.text = active
            ? `Atlas Session: ${active.status?.state ?? 'ready'} · Step ${active.status?.step ?? 0}`
            : 'Atlas Session: none';
    }

    dispose(): void { this.backend.dispose(); this.session.dispose(); }
}
