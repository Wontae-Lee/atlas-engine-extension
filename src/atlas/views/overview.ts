import type * as vscode from 'vscode';
import { View } from './view';

/**
 * Overview supplies its own declaration and data while View handles the shared lifecycle.
 * The intentionally empty tree displays the welcome message and Hello World button.
 *
 * "extends View" inherits its metadata fields, initialize/update/dispose methods, and
 * default getTreeItem implementation. This class supplies the abstract getChildren method.
 * The ordinary View import is needed at runtime because inheritance uses the actual class.
 */
export class Overview extends View {
	/**
	 * A public, zero-argument constructor makes new Overview() available to the factory.
	 * super(...) invokes the parent constructor and must run before using this in a derived constructor.
	 * Arguments are positional: id, title, container, then optional welcome text.
	 * The string's \n escape becomes a real line break, placing the command link on its own line.
	 *
	 * Construction sets metadata only; it does not open a view or execute Hello World.
	 */
	constructor() {
		super(
			'atlas-engine.overview',
			'Overview',
			'atlas-engine',
			'Welcome to Atlas Engine.\n[Hello World](command:atlas-engine.helloWorld)'
		);
	}

	/**
	 * Return TreeItems to populate the view; accept a parent element to add a hierarchy.
	 * The inherited api is available after System initializes the view.
	 * System.update() triggers the refresh event provided by the base class.
	 *
	 * This implementation ignores the optional parent parameter allowed by the base method.
	 * TypeScript permits fewer parameters when an implementation does not need those arguments.
	 *
	 * @returns A new empty TreeItem array on every call, synchronously. This is not a Promise.
	 * Returning [] deliberately selects the manifest's empty-view welcome content.
	 */
	getChildren(): vscode.TreeItem[] {
		return [];
	}
}
