import type * as vscode from 'vscode';

export abstract class EditorView implements vscode.TextDocumentContentProvider, vscode.Disposable {
	private registration?: vscode.Disposable;

	protected constructor(
		public readonly id: string,
		public readonly title: string
	) {}

	get command_id(): string {
		return `${this.id}.open`;
	}

	initialize(api: typeof vscode): void {
		this.registration = api.workspace.registerTextDocumentContentProvider(this.id, this);
	}

	provideTextDocumentContent(): string {
		return '';
	}

	async show(api: typeof vscode): Promise<void> {
		const uri = api.Uri.from({ scheme: this.id, path: `/${this.title}` });
		await api.window.showTextDocument(uri, { viewColumn: api.ViewColumn.One, preview: false });
	}

	update(): void {}

	dispose(): void {
		this.registration?.dispose();
		this.registration = undefined;
	}
}
