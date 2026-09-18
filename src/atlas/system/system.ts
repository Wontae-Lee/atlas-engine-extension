/**
 * Type-only namespace import: this file describes API types without loading vscode itself.
 * The mixed import below loads createContributions but erases the Contributions type import.
 * "../" selects the parent directory relative to this source file.
 */
import type * as vscode from 'vscode';
import { createContributions, type Contributions } from '../contributions';
import { error_message } from '../detail/private_helpers';

/**
 * Owns the extension's components and controls registration, command execution, and refresh.
 * Like the engine's System, update() makes the component execution order explicit.
 * VS Code drives events; Backend owns the Docker connection used by backend commands.
 *
 * "class" defines instances with state and methods. "implements vscode.Disposable"
 * asks the type checker to verify the dispose contract; it does not inherit implementation.
 * Members without an access modifier are public. "private" restricts access in TypeScript;
 * it is not JavaScript's runtime-private #field syntax.
 */
export class System implements vscode.Disposable {
	/**
	 * An initially empty, mutable array of registration handles owned by this instance.
	 * readonly forbids replacing the field, but push/splice may still mutate this array.
	 */
	private readonly registrations: vscode.Disposable[] = [];
	/** TypeScript infers boolean from false; each System instance has its own flag. */
	private disposed = false;
	private layout_started = false;

	/**
	 * Constructor parameter properties combine arguments, field declarations, and assignments:
	 * "private readonly api: typeof vscode" creates this.api from the supplied argument.
	 * In this type position, typeof describes the module API's type; it is not a runtime check.
	 * The default initializer runs only if contributions is omitted or explicitly undefined.
	 *
	 * @param api The live API supplied by extension.ts, not acquired by the generator.
	 * @param contributions Component instances whose lifetime this System takes ownership of.
	 * @param storage Extension state used to remember a successfully connected backend.
	 * @throws Initialization errors after attempting to clean up resources already acquired.
	 * Constructors have no return-type annotation; new System(...) returns the new instance.
	 */
	constructor(
		private readonly api: typeof vscode,
		private readonly contributions: Contributions = createContributions(),
		private readonly storage?: vscode.Memento,
		private readonly workspace_storage?: vscode.Memento,
		private readonly extension_uri?: vscode.Uri
	) {
		try {
			// this denotes the current System instance. Initialization registers components once.
			this.initialize();
		} catch (error) {
			// catch receives a thrown error; throw forwards it instead of reporting success.
			this.dispose();
			throw error;
		}
	}

	/**
	 * Registers views and the callbacks that VS Code will invoke for command IDs.
	 * A callback is stored now and executed later; registering it does not execute the command.
	 *
	 * @returns Nothing. ": void" means callers should not expect a useful result.
	 * @throws Errors from a component's initialization or the VS Code registration API.
	 */
	private initialize(): void {
		this.contributions.project.initialize(this.api, this.workspace_storage);
		this.contributions.backend.initialize(this.api, this.storage);
		this.contributions.layout.initialize(this.api, this.extension_uri);
		const refresh = () => this.contributions.layout.update();
		const refresh_simulation = () => {
			this.contributions.layout.left.views.find(view => view.id === 'atlas-engine.output')?.update();
			for (const view of this.contributions.layout.right.views) {
				view.update();
			}
			for (const view of this.contributions.layout.center.views) { view.update(); }
		};
		this.registrations.push(
			{ dispose: this.contributions.project.on_change(refresh) },
			{ dispose: this.contributions.streaming.on_state(refresh_simulation) },
			{ dispose: this.contributions.streaming.on_snapshot(refresh_simulation) }
		);
		const watcher = this.api.workspace.createFileSystemWatcher('**/assets/geometry/**');
		const assets_changed = () => this.contributions.project.assets_changed();
		this.registrations.push(watcher, watcher.onDidCreate(assets_changed), watcher.onDidChange(assets_changed), watcher.onDidDelete(assets_changed),
			this.api.workspace.onDidChangeWorkspaceFolders(assets_changed));
		for (const command of this.contributions.commands) {
			// (...args: unknown[]) collects all callback arguments into an array (rest syntax).
			// unknown accepts any value, but consumers must narrow its type before using it.
			// An arrow function keeps the surrounding this, so this.update() refers to System.
			// async makes the callback return a Promise even when the command returns a plain value.
			this.registrations.push(this.api.commands.registerCommand(command.id, async (...args: unknown[]) => {
				// ...args here expands the array into positional arguments (spread syntax).
				// await unwraps a value or Promise; it suspends this callback, not the host thread.
				// A rejection throws here, so the following update is skipped on command failure.
				const result = await command.execute(this.api, ...args);
				this.update();
				// Resolves the callback's Promise with the command result for its caller.
				return result;
			}));
		}
		for (const view of this.contributions.layout.center.views) {
			// The async callback resolves after the Webview editor is shown and the layout refreshes.
			this.registrations.push(this.api.commands.registerCommand(view.command_id, async () => {
				await view.show(this.api);
				this.update();
			}));
		}
	}

	/**
	 * Start the initial backend connection, then update the layout's regional views.
	 * Backend.update() starts only once; repeated updates do not repeat registrations or downloads.
	 * Derived methods are dispatched through base-class references at runtime.
	 *
	 * @returns Nothing, including when the disposed guard exits early with bare return.
	 * @throws Propagates component update errors; this method does not silently ignore them.
	 */
	update(): void {
		// An asynchronous command can finish after the extension has been disposed.
		if (this.disposed) {
			return;
		}
		this.contributions.backend.update();
		this.contributions.layout.update();
		if (!this.layout_started) {
			this.layout_started = true;
			void this.contributions.layout.show(this.api).catch(error => {
				if (!this.disposed) {
					void this.api.window.showErrorMessage(`Atlas layout: ${error_message(error)}`);
				}
			});
		}
	}

	/**
	 * Stop the backend and streaming, then release registrations, commands, and layout views.
	 * VS Code invokes this via context.subscriptions. This is explicit cleanup, not a C++
	 * destructor: JavaScript garbage collection does not automatically call dispose().
	 *
	 * @returns Nothing. Repeated calls return immediately after the first call sets disposed.
	 */
	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.contributions.backend.dispose();
		this.contributions.streaming.dispose();
		this.contributions.project.dispose();
		// splice(0) removes and returns every element, leaving the owned array empty.
		// reverse() reverses that returned array, releasing the newest registration first.
		for (const registration of this.registrations.splice(0).reverse()) {
			registration.dispose();
		}
		for (const command of this.contributions.commands) {
			command.dispose();
		}
		this.contributions.layout.dispose();
	}
}
