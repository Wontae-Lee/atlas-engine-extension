import type * as vscode from 'vscode';
import type { CaseProject } from '../../project/case_project';
import type { ProjectState } from '../../project/project_types';
import type { FieldDefinition, ViewAction, ViewItem } from '../view_types';
import { ProjectView } from '../project_view';

export const DOMAIN_FIELDS: readonly FieldDefinition[] = [
	{ key: 'lower_corner', label: 'Lower corner', type: 'vector', unit: 'm' },
	{ key: 'upper_corner', label: 'Upper corner', type: 'vector', unit: 'm' },
	{ key: 'cell_size', label: 'Cell size', type: 'number', exclusive_min: 0, unit: 'm' }
];

export class Domain extends ProjectView {
	constructor(project: CaseProject) {
		super(project, 'domain', 'DOMAIN', 'collapsed');
	}

	protected items(state: ProjectState): ViewItem[] {
		return this.field_rows(DOMAIN_FIELDS, state.domain, state);
	}

	async execute(api: typeof vscode, action: ViewAction): Promise<void> {
		if (action.action !== 'edit') { throw new Error('Unsupported DOMAIN action.'); }
		await this.edit_field(api, action, DOMAIN_FIELDS, this.project.get_state().domain, (state, key, value) => {
			Object.assign(state.domain, { [key]: value });
		});
	}
}
