import type { Command } from './commands/command';
import { HelloWorld } from './commands/hello_world';
import { SelectBackend } from './commands/select_backend';
import { CheckBackend } from './commands/check_backend';
import { ShowLayout } from './commands/show_layout';
import { Backend } from './backend/backend';
import { Streaming } from './streaming/streaming';
import { Layout } from './views/layout';
import { MoleculeCatalog } from './catalog/molecule_catalog';

export interface Contributions {
	readonly catalog: MoleculeCatalog;
	readonly backend: Backend;
	readonly streaming: Streaming;
	readonly layout: Layout;
	readonly commands: readonly Command[];
}

export function createContributions(): Contributions {
	const backend = new Backend();
	const layout = new Layout();
	return {
		catalog: new MoleculeCatalog(),
		backend,
		streaming: new Streaming(backend),
		layout,
		commands: [new HelloWorld(), new SelectBackend(backend), new CheckBackend(backend), new ShowLayout(layout)]
	};
}
