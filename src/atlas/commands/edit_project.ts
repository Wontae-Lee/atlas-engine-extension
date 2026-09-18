import type * as vscode from 'vscode';
import type { ProjectEditor } from '../project/project_editor';
import type { ProjectAction, ProjectSection } from '../project/project_types';
import { Command } from './command';

export class EditProject extends Command {
	constructor(private readonly editor: ProjectEditor) {
		super('atlas-engine.project.action', 'Atlas Engine: Edit Case');
	}

	async execute(api: typeof vscode, ...args: unknown[]): Promise<void> {
		try {
			let action = args[0] as ProjectAction | undefined;
			if (!action) {
				const section = await api.window.showQuickPick(['assets', 'materials', 'geometry', 'sources', 'boundaries', 'sinks'],
					{ title: 'Atlas: Add Item' });
				if (!section) {
					return;
				}
				action = { section: section as ProjectSection, action: 'add' };
			}
			await this.editor.execute(api, action);
		} catch (error) {
			await api.window.showErrorMessage(error instanceof Error ? error.message : String(error));
		}
	}
}
