import type * as vscode from 'vscode';

/**
 * Base for actions invoked from the Command Palette, view buttons, or other commands.
 * Metadata is available without VS Code; System injects the runtime API when executing.
 *
 * abstract prevents new Command(...) and requires concrete subclasses to implement execute.
 * implements Disposable checks that a compatible dispose method exists; it adds no runtime code.
 */
export abstract class Command implements vscode.Disposable {
	/**
	 * Subclasses call super(id, title) to initialize inherited metadata.
	 * public readonly parameter properties both declare fields and assign the argument values.
	 *
	 * @param id Unique command ID used by the manifest, command links, and VS Code registration.
	 * @param title User-facing label displayed in the Command Palette.
	 */
	protected constructor(
		public readonly id: string,
		public readonly title: string
	) {}

	/**
	 * ...args is a rest parameter: any arguments after api are collected into an array.
	 * unknown accepts values of any type but requires checking or narrowing before using them.
	 * Unlike any, unknown does not allow arbitrary property access without a type check.
	 * The final : unknown is the return type, not another argument annotation.
	 *
	 * @param api Live API supplied by System when the command is invoked.
	 * @param args Additional arguments supplied by the caller, if this command accepts any.
	 * @returns An implementation-defined result, which may also be a Promise or undefined.
	 * System awaits the result before refreshing UI and forwarding it to the original caller.
	 * Concrete implementations should use more specific return types when possible.
	 */
	abstract execute(api: typeof vscode, ...args: unknown[]): unknown;

	/**
	 * Override when a command instance owns resources beyond its registration handle.
	 * Unlike abstract execute, this method has a default implementation: an empty body.
	 * System separately disposes the registration handle that connects the command to VS Code.
	 *
	 * @returns Nothing; the default implementation has no resources to release.
	 */
	dispose(): void {}
}
