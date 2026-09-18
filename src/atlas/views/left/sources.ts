import type * as vscode from 'vscode';
import type { CaseProject } from '../../project/case_project';
import type { ProjectState } from '../../project/project_types';
import type { EntryDefinition, FieldDefinition, ViewAction, ViewItem } from '../view_types';
import { EntryView } from '../entry_view';

const source_fields: readonly FieldDefinition[] = [
	{ key: 'geometry_id', label: 'Geometry', type: 'geometry' },
	{ key: 'material_id', label: 'Material', type: 'material' },
	{ key: 'spacing', label: 'Particle spacing', type: 'number', default_value: 0.1, exclusive_min: 0, unit: 'm' },
	{ key: 'tolerance', label: 'Tolerance', type: 'number', default_value: 0, min: 0, unit: 'm' },
	{ key: 'temperature', label: 'Temperature', type: 'number', default_value: 273.15, min: 0, unit: 'K' },
	{ key: 'bulk_velocity', label: 'Bulk velocity', type: 'vector', default_value: [0, 0, 0], unit: 'm/s' }
];

export const SOURCE_KINDS: readonly EntryDefinition[] = [
	{ kind: 'volume', label: 'Volume Source', fields: source_fields },
	{ kind: 'surface', label: 'Surface Source', fields: source_fields }
];

export class Sources extends EntryView {
	constructor(project: CaseProject) {
		super(project, 'sources', 'SOURCES');
	}

	protected async items(state: ProjectState): Promise<ViewItem[]> {
		return [
			...await this.entry_rows(state.sources, SOURCE_KINDS, state),
			this.action_row('Add Source', { action: 'add' }, 'add')
		];
	}

	execute(api: typeof vscode, action: ViewAction): Promise<void> {
		return this.edit_entries(api, action, SOURCE_KINDS);
	}
}
