import type * as vscode from 'vscode';
import type { BackendMode } from '../../src/atlas/backend/backend_types';

export class UI {
	readonly status = {
		name: '', command: '', text: '', tooltip: '', shown: false, disposed: false,
		show: () => { this.status.shown = true; },
		dispose: () => { this.status.disposed = true; }
	};
	readonly values = new Map<string, unknown>();
	readonly persisted: unknown[] = [];
	readonly errors: string[] = [];
	readonly notifications: string[] = [];
	readonly logs: string[] = [];
	answer?: string;
	choice?: BackendMode;
	cancel?: () => void;
	readonly storage: vscode.Memento;
	readonly api: typeof vscode;

	constructor(private readonly events: string[]) {
		this.storage = {
			get: (key: string) => this.values.get(key),
			keys: () => [...this.values.keys()],
			update: async (key: string, value: unknown) => {
				this.events.push(`persist:${String(value)}`);
				this.values.set(key, value);
				this.persisted.push(value);
			}
		} as vscode.Memento;
		this.api = {
			StatusBarAlignment: { Left: 1 },
			ProgressLocation: { Notification: 15 },
			window: {
				createStatusBarItem: () => this.status,
				createOutputChannel: () => ({ append: (text: string) => this.logs.push(text), show: () => {}, dispose: () => {} }),
				showQuickPick: async (items: { mode: BackendMode }[]) => items.find(item => item.mode === this.choice),
				showWarningMessage: async () => {
					this.events.push('approval');
					return this.answer;
				},
				showErrorMessage: async (message: string) => { this.errors.push(message); },
				showInformationMessage: async (message: string) => { this.notifications.push(message); },
				withProgress: async <T>(_options: unknown, task: (progress: vscode.Progress<{ message?: string }>, token: vscode.CancellationToken) => Promise<T>): Promise<T> => {
					let cancelled = false;
					let listener: (() => void) | undefined;
					this.cancel = () => { cancelled = true; listener?.(); };
					return task({ report: () => {} }, {
						get isCancellationRequested() { return cancelled; },
						onCancellationRequested: callback => {
							listener = () => { callback(undefined); };
							return { dispose: () => { listener = undefined; } };
						}
					});
				}
			}
		} as unknown as typeof vscode;
	}
}
