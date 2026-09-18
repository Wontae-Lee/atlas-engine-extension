import type * as vscode from 'vscode';
import type { Layout } from '../views/layout';
import { Command } from './command';

export class ShowLayout extends Command {
	constructor(private readonly layout: Layout) {
		super('atlas-engine.layout.show', 'Atlas Engine: Show Layout');
	}

	execute(api: typeof vscode): Promise<void> {
		return this.layout.show(api);
	}
}
