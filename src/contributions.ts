/**
 * "import type" is used only for compile-time checking and is erased from JavaScript.
 * Ordinary imports are needed for classes constructed with new, such as HelloWorld.
 * Relative paths start at this file's directory; "./" means the current directory.
 */
import type { Command } from './commands/command';
import { HelloWorld } from './commands/helloWorld';
import type { Panel } from './panels/panel';
import { Overview } from './views/overview';
import type { View } from './views/view';

/**
 * Components are ordinary instances of shared base classes, not constructor interfaces.
 * System takes ownership of the returned instances; the generator only reads their metadata.
 *
 * An interface describes an object's shape. It is not an instantiated class and emits
 * no JavaScript. "export" lets other modules use this type in their own declarations.
 * TypeScript checks compatibility structurally: values must provide the required members.
 */
export interface Contributions {
	/**
	 * The first readonly prevents replacing the containers property through this interface.
	 * The second readonly makes the array read-only: callers cannot push or remove elements.
	 * Neither is a runtime freeze, and neither makes each contained object deeply immutable.
	 * The inline { ... } type requires three string properties on every container object.
	 * The [] suffix means "array of these objects", not one container.
	 */
	readonly containers: readonly { id: string; title: string; icon: string }[];
	/** Derived View instances fit this base-class array and retain their own method behavior. */
	readonly views: readonly View[];
	/** Each entry is an existing object, not a class constructor or an interface. */
	readonly commands: readonly Command[];
	/** An empty array is valid; declaring the type does not create or open any panels. */
	readonly panels: readonly Panel[];
}

/**
 * Assemble the extension once for each System or manifest generation.
 * Add derived instances here. Constructors must not use VS Code or start external work,
 * because this factory also runs in ordinary Node.js during manifest generation.
 *
 * The ": Contributions" after the parameter list declares the function's return type.
 * "return { ... }" returns an object literal. Its named properties contain array literals.
 * Each call creates fresh arrays and fresh instances rather than reusing global singletons.
 *
 * @returns The assembled metadata and component instances. Creating them does not register UI.
 */
export function createContributions(): Contributions {
	return {
		// Object properties use "key: value" and commas; type declarations above use type names.
		containers: [
			{ id: 'atlas-engine', title: 'Atlas Engine', icon: 'media/atlas-engine-logo.svg' }
		],
		// new Overview() returns an Overview instance, assignable to the View base type.
		views: [new Overview()],
		commands: [new HelloWorld()],
		// [] contains zero elements. Add a derived Panel instance here to expose its open command.
		panels: []
	};
}
