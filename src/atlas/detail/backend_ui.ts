import type * as vscode from 'vscode';
import type {BackendMode} from '../backend/backend_types';

interface BackendStatus {
    mode: BackendMode;
    stage: string;
    failure?: string;
    connected: boolean;
    busy: boolean;
}

export class BackendUi implements vscode.Disposable {
    private api!: typeof vscode;
    private status?: vscode.StatusBarItem;
    private output?: vscode.OutputChannel;
    private disposed = false;

    initialize(api: typeof vscode): void {
        this.api = api;
        this.output = api.window.createOutputChannel('atlas-engine-backend');
        this.status = api.window.createStatusBarItem('atlas-engine-backend', api.StatusBarAlignment.Left, 100);
        this.status.name = 'atlas-engine-backend';
        this.status.command = 'atlas-engine.backend.select';
        this.status.show();
    }

    async select(mode: BackendMode): Promise<BackendMode | undefined> {
        const choice = await this.api.window.showQuickPick([
            {label: 'TBB', description: 'CPU · default', mode: 'tbb' as const, picked: mode === 'tbb'},
            {
                label: 'CUDA',
                description: 'NVIDIA GPU · requires compatibility check',
                mode: 'cuda' as const,
                picked: mode === 'cuda'
            }
        ], {title: 'atlas-engine-backend', placeHolder: 'Select a backend'});
        return choice?.mode;
    }

    async confirm_cuda(hardware: string): Promise<boolean> {
        const answer = await this.api.window.showWarningMessage(
            'Install the optional CUDA backend image (about 2.5 GB)',
            {
                modal: true,
                detail: `${hardware}\n\nThe CUDA backend will be tested before switching. Your current backend stays active if installation fails.`
            },
            'Install CUDA'
        );
        return answer === 'Install CUDA';
    }

    async with_progress<T>(
        title: string,
        operation: AbortController,
        task: (progress: vscode.Progress<{ message?: string }>) => Promise<T>
    ): Promise<T> {
        return this.api.window.withProgress({
            location: this.api.ProgressLocation.Notification, title, cancellable: true
        }, async (progress, token) => {
            const cancel = token.onCancellationRequested(() => operation.abort());
            if (token.isCancellationRequested) {
                operation.abort();
            }
            try {
                return await task(progress);
            } finally {
                cancel.dispose();
            }
        });
    }

    log(text: string): void {
        if (!this.disposed) {
            this.output?.append(text);
        }
    }

    show_failure(message: string): void {
        void this.api.window.showErrorMessage(`atlas-engine-backend: ${message}`, 'Show Output').then(action => {
            if (action === 'Show Output' && !this.disposed) {
                this.output?.show(true);
            }
        });
    }

    show_verified(mode: BackendMode): void {
        void this.api.window.showInformationMessage(`${mode.toUpperCase()} backend check passed.`);
    }

    render(state: BackendStatus): void {
        if (!this.status || this.disposed) {
            return;
        }
        const icon = state.busy ? 'sync~spin' : state.failure ? 'warning' : state.connected ? 'server' : 'debug-disconnect';
        this.status.text = `$(${icon}) atlas-engine-backend: ${state.mode.toUpperCase()}`;
        this.status.tooltip = `${state.mode.toUpperCase()} · ${state.connected ? 'connected' : 'not connected'}\n${state.failure ?? state.stage}\nClick to select TBB or CUDA.`;
    }

    dispose(): void {
        this.disposed = true;
        this.status?.dispose();
        this.output?.dispose();
    }
}
