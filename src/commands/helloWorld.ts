import type * as vscode from 'vscode';
import { Command } from './command';

/**
 * The base class holds manifest metadata; System registers and invokes this action.
 * API access is injected during execution, so construction also works in the generator.
 * "extends Command" inherits id, title, and the default dispose implementation.
 */
export class HelloWorld extends Command {
	/** Initialize the parent's metadata. new HelloWorld() returns an instance without executing it. */
	constructor() {
		super('atlas-engine.helloWorld', 'Hello World');
	}

	/**
	 * Complete when the notification is dismissed; failures propagate to the caller.
	 * "async" means a call immediately returns a Promise rather than blocking the host thread.
	 * "await" pauses this function until the notification API's Thenable settles.
	 * Promise<void> describes asynchronous completion without a useful resolved value.
	 * It differs from : void, which does not expose an asynchronous completion result.
	 *
	 * The inherited signature accepts extra arguments; this command ignores them and declares only api.
	 *
	 * @param api VS Code API passed by System, rather than imported at runtime by this module.
	 * @returns A Promise resolving with undefined after the notification is dismissed.
	 * @throws API failures reject that Promise and propagate through System's command callback.
	 */
	async execute(api: typeof vscode): Promise<void> {
		// The notification API's result is intentionally ignored; there are no action buttons here.
		await api.window.showInformationMessage('Hello World from atlas-engine!');
	}
}
