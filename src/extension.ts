/**
 * TypeScript reading guide:
 * - import brings exported names from another module into this file.
 * - "* as vscode" groups the module's exports under the name vscode.
 * - This is a runtime import: VS Code supplies the actual API when loading the extension.
 * - "{ System }" below selects one named export from a relative module path.
 * - Type annotations are checked by TypeScript and removed from emitted JavaScript.
 */
import * as vscode from 'vscode';
import { System } from './atlas/system/system';

/**
 * VS Code delegates the extension lifecycle to System.
 * Component ownership, registration, and update order remain inside the system.
 *
 * Syntax: "export function" makes this function available to the module's consumer.
 * "context: vscode.ExtensionContext" names an argument and declares its accepted type.
 * There is no explicit return annotation here; TypeScript infers void from the body.
 * VS Code calls this exported function on activation; importing the file alone does not call it.
 *
 * @param context VS Code's extension context, including the list of resources to dispose.
 * @returns No result is returned. On normal completion JavaScript returns undefined.
 * @throws Propagates an error if System construction or its initial update fails.
 */
export function activate(context: vscode.ExtensionContext) {
	const system = new System(vscode, undefined, context.globalState);
	// const prevents assigning another value to "system"; it does not freeze the object.
	// new calls the constructor and produces an instance. Its inferred type is System.
	// push adds that instance to the array. Its numeric return value (new length) is ignored.
	context.subscriptions.push(system);
	system.update();
	// The dot selects a member; parentheses invoke a method. update() returns void.
	console.log('Congratulations, your extension "atlas-engine" is now active!');
}

/**
 * VS Code disposes System through context.subscriptions.
 * The empty body deliberately performs no additional cleanup.
 *
 * @returns No result; TypeScript infers void and JavaScript returns undefined.
 */
export function deactivate() {}
