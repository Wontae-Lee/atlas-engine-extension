/** Type-only imports disappear from JavaScript; constructors here do not load the VS Code API. */
import type * as vscode from 'vscode';

/**
 * Base for sidebar tree views. Construction only defines metadata for the manifest.
 * System supplies the VS Code API during initialization and owns this view's lifetime.
 * Derived views implement their data; registration, refresh events, and cleanup are shared.
 *
 * "abstract class" cannot be instantiated directly with new View(...).
 * A concrete subclass uses "extends View" to inherit its fields and method implementations.
 * "implements" checks contracts without inheriting code; multiple contracts are comma-separated.
 * TreeDataProvider<TreeItem> is a generic type: TreeItem is the element type supplied to
 * the provider's methods, similar to choosing a template type argument in C++.
 */
export abstract class View implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	/**
	 * protected permits access from View and its subclasses, not ordinary external callers.
	 * The ! is a definite-assignment assertion: TypeScript trusts initialization will happen later.
	 * It neither supplies a value nor checks one at runtime. Do not access api in constructors.
	 * typeof vscode describes the injected module API's type, including its constructors.
	 */
	protected api!: typeof vscode;
	/**
	 * ? makes a field optional, so reading it may produce undefined.
	 * EventEmitter<T> sends values of type T to listeners. The | signs form a union of allowed types.
	 * An event with no element requests a root refresh; a TreeItem identifies a changed element.
	 */
	private changes?: vscode.EventEmitter<vscode.TreeItem | undefined | void>;
	/** The handle unregisters the provider; it is absent before initialization and after disposal. */
	private registration?: vscode.Disposable;

	/**
	 * A protected constructor is called by subclass constructors through super(...).
	 * public readonly arguments are parameter properties: they also become instance fields.
	 * readonly prevents later assignment through TypeScript; it does not freeze the object.
	 * welcome? is optional; omitting its argument stores undefined.
	 *
	 * @param id Unique view ID shared by the generated manifest and runtime registration.
	 * @param title Display label emitted as the manifest view's name property.
	 * @param container ID of a container in createContributions().containers.
	 * @param welcome Optional empty-tree text; a command link on its own line becomes a button.
	 * No return type is written on a constructor; new on a concrete subclass returns an instance.
	 */
	protected constructor(
		public readonly id: string,
		public readonly title: string,
		public readonly container: string,
		public readonly welcome?: string
	) {}

	/**
	 * A getter is read like a property: view.onDidChangeTreeData, without parentheses.
	 * Its function body runs on each property read.
	 * The inner union describes event payloads; the outer "| undefined" describes an absent event.
	 *
	 * @returns The emitter's subscription function, or undefined when no emitter exists.
	 * Returning an event does not fire it; VS Code uses the returned function to subscribe.
	 */
	get onDidChangeTreeData(): vscode.Event<vscode.TreeItem | undefined | void> | undefined {
		// ?. is optional chaining: when changes is null or undefined, return undefined instead.
		return this.changes?.event;
	}

	/**
	 * Called once by System before VS Code requests data or update() refreshes the tree.
	 *
	 * @param api Live VS Code API used to create the emitter and register this provider.
	 * @returns Nothing. The registration handle is stored on the instance rather than returned.
	 * @throws Propagates errors from emitter creation or provider registration.
	 */
	initialize(api: typeof vscode): void {
		this.api = api;
		this.changes = new api.EventEmitter<vscode.TreeItem | undefined | void>();
		// this passes the current View-derived object as the provider, including overridden methods.
		this.registration = api.window.registerTreeDataProvider(this.id, this);
	}

	/**
	 * The colon inside the parentheses specifies the input type; the colon after them
	 * specifies the return type. Both annotations disappear from emitted JavaScript.
	 *
	 * @param item An element previously returned by getChildren.
	 * @returns The same object, not a copy. Elements are already displayable TreeItems.
	 */
	getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
		return item;
	}

	/**
	 * Abstract methods declare a contract without a body; concrete subclasses supply one.
	 * element? is optional, allowing getChildren() to request the root list.
	 * TreeItem[] means an array of TreeItems. ProviderResult<T> is VS Code's type alias for
	 * T, undefined, null, or a Thenable resolving to one of those values.
	 * A Thenable exposes a then method; a JavaScript Promise is compatible with it.
	 *
	 * @param element Parent item, or undefined when VS Code requests root items.
	 * @returns Child items immediately or asynchronously; null/undefined also mean no items.
	 */
	abstract getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]>;

	/**
	 * Request that VS Code read the current tree again; no background polling is started.
	 *
	 * @returns Nothing. Firing the event requests a refresh; it does not return rendered items.
	 */
	update(): void {
		this.changes?.fire();
	}

	/**
	 * Unregister the provider and release its event emitter.
	 * Optional chaining skips already absent handles; assigning undefined clears our references.
	 *
	 * @returns Nothing. System calls this during teardown or failed initialization cleanup.
	 */
	dispose(): void {
		this.registration?.dispose();
		this.registration = undefined;
		this.changes?.dispose();
		this.changes = undefined;
	}
}
