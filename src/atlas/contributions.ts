import type { Command } from './commands/command';
import { HelloWorld } from './commands/hello_world';
import { SelectBackend } from './commands/select_backend';
import { CheckBackend } from './commands/check_backend';
import { ShowLayout } from './commands/show_layout';
import { Backend } from './backend/backend';
import { Streaming } from './streaming/streaming';
import { Layout } from './views/layout';
import { MoleculeCatalog } from './catalog/molecule_catalog';
import { CaseProject } from './project/case_project';
import { ProjectEditor } from './project/project_editor';
import { EditProject } from './commands/edit_project';

export interface Contributions {
	readonly catalog: MoleculeCatalog;
	readonly project: CaseProject;
	readonly backend: Backend;
	readonly streaming: Streaming;
	readonly layout: Layout;
	readonly commands: readonly Command[];
}

export function createContributions(): Contributions {
	const backend = new Backend();
	const catalog = new MoleculeCatalog();
	const project = new CaseProject(catalog);
	const streaming = new Streaming(backend);
	const layout = new Layout(project, streaming);
	return {
		catalog,
		project,
		backend,
		streaming,
		layout,
		commands: [
			new HelloWorld(), new SelectBackend(backend), new CheckBackend(backend), new ShowLayout(layout),
			new EditProject(new ProjectEditor(project, streaming))
		]
	};
}
