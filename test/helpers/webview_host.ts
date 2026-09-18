import * as vscode from 'vscode';

export interface HostedWebview {
	readonly panel: vscode.WebviewPanel;
	readonly options: vscode.WebviewPanelOptions & vscode.WebviewOptions;
	readonly messages: unknown[];
	readonly html_writes: string[];
	readonly listener_count: number;
	readonly disposed: boolean;
	receive(message: unknown): void;
	set_visible(visible: boolean): void;
}

export class WebviewHost {
	readonly panels: HostedWebview[] = [];
	readonly errors: string[] = [];
	readonly api: typeof vscode;
	readonly extension_uri = vscode.Uri.file('/atlas-extension');

	constructor() {
		this.api = {
			Uri: vscode.Uri,
			ViewColumn: vscode.ViewColumn,
			window: {
				createWebviewPanel: (
					id: string, title: string, column: vscode.ViewColumn,
					options: vscode.WebviewPanelOptions & vscode.WebviewOptions
				) => this.create_panel(id, title, column, options),
				showErrorMessage: async (message: string) => { this.errors.push(message); }
			}
		} as unknown as typeof vscode;
	}

	private create_panel(
		id: string, title: string, column: vscode.ViewColumn,
		options: vscode.WebviewPanelOptions & vscode.WebviewOptions
	): vscode.WebviewPanel {
		const message_listeners = new Set<(message: unknown) => unknown>();
		const state_listeners = new Set<(event: vscode.WebviewPanelOnDidChangeViewStateEvent) => unknown>();
		const dispose_listeners = new Set<() => unknown>();
		const messages: unknown[] = [];
		const html_writes: string[] = [];
		let visible = true;
		let disposed = false;
		const panel = {
			viewType: id,
			title,
			viewColumn: column,
			get visible() { return visible; },
			get active() { return visible; },
			webview: {
				cspSource: 'vscode-webview://atlas-test',
				options,
				get html() { return html_writes.at(-1) ?? ''; },
				set html(value: string) { html_writes.push(value); },
				asWebviewUri: (uri: vscode.Uri) => uri.with({ scheme: 'vscode-webview-resource' }),
				postMessage: async (message: unknown) => {
					if (disposed) {
						throw new Error('Cannot post a message to a disposed webview.');
					}
					messages.push(message);
					return visible;
				},
				onDidReceiveMessage: (listener: (message: unknown) => unknown) => {
					message_listeners.add(listener);
					return { dispose: () => { message_listeners.delete(listener); } };
				}
			},
			reveal: () => set_visible(true),
			onDidChangeViewState: (listener: (event: vscode.WebviewPanelOnDidChangeViewStateEvent) => unknown) => {
				state_listeners.add(listener);
				return { dispose: () => { state_listeners.delete(listener); } };
			},
			onDidDispose: (listener: () => unknown) => {
				dispose_listeners.add(listener);
				return { dispose: () => { dispose_listeners.delete(listener); } };
			},
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				for (const listener of [...dispose_listeners]) {
					listener();
				}
			}
		} as unknown as vscode.WebviewPanel;
		const set_visible = (value: boolean) => {
			visible = value;
			for (const listener of [...state_listeners]) {
				listener({ webviewPanel: panel });
			}
		};
		this.panels.push({
			panel,
			options,
			messages,
			html_writes,
			get listener_count() { return message_listeners.size + state_listeners.size + dispose_listeners.size; },
			get disposed() { return disposed; },
			receive: message => {
				for (const listener of [...message_listeners]) {
					listener(message);
				}
			},
			set_visible
		});
		return panel;
	}
}
