import type * as vscode from 'vscode';

/**
 * Base for custom editor tabs, separate from sidebar tree views.
 * Derived panels provide HTML; System owns their open commands and refresh order.
 * Construction is metadata-only so the manifest generator can create instances in Node.js.
 *
 * abstract prevents direct construction. A concrete class must extend Panel and implement render.
 * implements Disposable checks the cleanup method's shape without adding a destructor.
 * A Panel instance and its private WebviewPanel handle are different objects: the instance
 * can survive closing a tab and later create a new handle when the user opens it again.
 */
export abstract class Panel implements vscode.Disposable {
	/** ? allows undefined: no tab exists before show(), or after the user closes it. */
	private panel?: vscode.WebviewPanel;
	/** Subscription handle for the tab's close event, not a boolean "closed" flag. */
	private closed?: vscode.Disposable;

	/**
	 * protected allows subclass constructors to call super(id, title).
	 * public readonly parameter properties store these arguments on each instance.
	 *
	 * @param id Webview type ID, also used as the prefix of the generated open-command ID.
	 * @param title Label used for the editor tab and its generated command.
	 * Construction declares metadata only; no VS Code tab is created here.
	 */
	protected constructor(
		public readonly id: string,
		public readonly title: string
	) {}

	/**
	 * The generator and System use the same command ID to open this panel.
	 * "get" defines an accessor property: use panel.command_id, not panel.command_id().
	 * A template literal uses backticks; an interpolation such as ${this.id} inserts a value.
	 *
	 * @returns The panel ID followed by .open, for example atlas-engine.inspector.open.
	 */
	get command_id(): string {
		return `${this.id}.open`;
	}

	/**
	 * Reuse an open tab; a user-closed tab is created again on the next invocation.
	 *
	 * @param api Live VS Code API supplied by System's registered open-command callback.
	 * @returns Nothing. The created WebviewPanel is stored in this.panel, not returned.
	 * System calls update() after show() to supply the content through render().
	 * @throws Propagates VS Code errors when revealing or creating a panel.
	 */
	show(api: typeof vscode): void {
		// The truthiness check excludes undefined; TypeScript narrows the field inside this branch.
		if (this.panel) {
			this.panel.reveal();
			// A bare return exits this method immediately without returning an object or boolean.
			return;
		}
		// ViewColumn.One chooses the first editor column; {} is an empty options object.
		this.panel = api.window.createWebviewPanel(this.id, this.title, api.ViewColumn.One, {});
		// Calling the event with a listener subscribes it and returns a Disposable subscription.
		// The arrow callback preserves this Panel instance; VS Code calls it later on tab disposal.
		this.closed = this.panel.onDidDispose(() => {
			this.panel = undefined;
			// Optional chaining calls dispose only if the subscription handle is present.
			this.closed?.dispose();
			this.closed = undefined;
		});
	}

	/**
	 * protected limits calls to this class and subclasses; abstract supplies no default body.
	 * Subclasses implement the method, and this.render(...) dispatches to that implementation.
	 *
	 * @param webview The open tab's webview, available for operations such as asWebviewUri().
	 * @returns HTML text synchronously. The : string annotation excludes Promise<string>.
	 * The base update() method assigns the result to the webview; render itself need not assign it.
	 */
	protected abstract render(webview: vscode.Webview): string;

	/**
	 * Refresh only an existing tab; a system update must not open editor tabs implicitly.
	 *
	 * @returns Nothing. With no panel handle, the method simply reaches its end.
	 * @throws Propagates render or webview update errors to System.update().
	 */
	update(): void {
		if (this.panel) {
			// const's type is inferred as string from render's declared return type.
			const html = this.render(this.panel.webview);
			// !== compares without coercion. Avoid replacing identical HTML and resetting its document.
			if (this.panel.webview.html !== html) {
				this.panel.webview.html = html;
			}
		}
	}

	/**
	 * Remove the close listener before closing the tab, then clear the retained references.
	 * Undefined handles are skipped by optional chaining, making absent-tab cleanup harmless.
	 * Assigning undefined does not itself close a tab; the explicit dispose call does that.
	 *
	 * @returns Nothing. System calls this as part of releasing its owned components.
	 */
	dispose(): void {
		this.closed?.dispose();
		this.closed = undefined;
		this.panel?.dispose();
		this.panel = undefined;
	}
}
