import type * as vscode from 'vscode';
import type { Left } from '../views/left/left';
import type { ViewAction, ProjectSection } from '../views/view_types';
import { Command } from './command';

export class EditProject extends Command {
	constructor(private readonly sidebar: Left) {
		super('atlas-engine.project.action', 'Atlas Engine: Edit Case');
	}

	async execute(api: typeof vscode, ...args: unknown[]): Promise<void> {
		try {
			let action = args[0] as ViewAction | undefined;
			if (!action) {
				const section = await api.window.showQuickPick(['assets', 'materials', 'geometry', 'sources', 'boundaries', 'sinks'],
					{ title: 'Atlas: Add Item' });
				if (!section) {
					return;
				}
				action = { section: section as ProjectSection, action: 'add' };
			}
			await this.sidebar.execute(api, action);
		} catch (error) {
			await api.window.showErrorMessage(error instanceof Error ? error.message : String(error));
		}
	}
}
