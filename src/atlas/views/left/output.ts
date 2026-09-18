import type * as vscode from 'vscode';
import type { CaseProject } from '../../project/case_project';
import type { ProjectState } from '../../project/project_types';
import type { FieldDefinition, ViewAction, ViewItem } from '../view_types';
import { ProjectView } from '../project_view';

export const OUTPUT_FIELDS: readonly FieldDefinition[] = [
	{ key: 'enabled', label: 'CSV observer enabled', type: 'boolean' },
	{ key: 'interval', label: 'Sampling interval', type: 'integer', min: 1, max: 2147483647, unit: 'steps' },
	{ key: 'output_directory', label: 'Directory in container', type: 'text' }
];

export class Output extends ProjectView {
	constructor(project: CaseProject) {
		super(project, 'output', 'OUTPUT');
	}

	protected items(state: ProjectState): ViewItem[] {
		return [...this.field_rows(OUTPUT_FIELDS, state.output, state),
			this.info_row('storage', 'CSV files stay in the backend container', undefined, 'Files are removed when the backend container is closed.')];
	}

	async execute(api: typeof vscode, action: ViewAction): Promise<void> {
		if (action.action !== 'edit') { throw new Error('Unsupported OUTPUT action.'); }
		await this.edit_field(api, action, OUTPUT_FIELDS, this.project.get_state().output, (state, key, value) => {
			Object.assign(state.output, { [key]: value });
		});
	}
}
