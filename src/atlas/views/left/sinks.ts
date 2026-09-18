import type * as vscode from 'vscode';
import type { CaseProject } from '../../project/case_project';
import type { ProjectState } from '../../project/project_types';
import type { EntryDefinition, FieldDefinition, ViewAction, ViewItem } from '../view_types';
import { EntryView } from '../entry_view';

const sink_fields: readonly FieldDefinition[] = [
	{ key: 'geometry_id', label: 'Geometry', type: 'geometry' },
	{ key: 'tolerance', label: 'Tolerance', type: 'number', default_value: 0, min: 0, unit: 'm' }
];

export const SINK_KINDS: readonly EntryDefinition[] = [
	{ kind: 'outside_box', label: 'Outside Box Sink', fields: sink_fields.slice(0, 1) },
	{ kind: 'volume', label: 'Volume Sink', fields: sink_fields },
	{ kind: 'surface', label: 'Surface Sink', fields: sink_fields },
	{ kind: 'tracing', label: 'Tracing Sink', fields: sink_fields.slice(0, 1) }
];

export class Sinks extends EntryView {
	constructor(project: CaseProject) {
		super(project, 'sinks', 'SINKS');
	}

	protected async items(state: ProjectState): Promise<ViewItem[]> {
		return [
			...await this.entry_rows(state.sinks, SINK_KINDS, state),
			this.action_row('Add Sink', { action: 'add' }, 'add')
		];
	}

	execute(api: typeof vscode, action: ViewAction): Promise<void> {
		return this.edit_entries(api, action, SINK_KINDS);
	}
}
