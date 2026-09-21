import type * as vscode from 'vscode';
import type {CaseProject} from '../../project/case_project';
import type {ProjectState} from '../../project/project_types';
import type {EntryDefinition, ViewAction, ViewItem} from '../view_types';
import {EntryView} from '../entry_view';

export const BOUNDARY_KINDS: readonly EntryDefinition[] = [{
    kind: 'isothermal', label: 'Isothermal Collider', fields: [
        {key: 'geometry_id', label: 'Geometry', type: 'geometry'},
        {
            key: 'momentum_accommodation_coefficient',
            label: 'Momentum accommodation',
            type: 'number',
            default_value: 1,
            min: 0,
            max: 1
        },
        {key: 'restitution', label: 'Restitution', type: 'number', default_value: 1, min: 0},
        {
            key: 'diffuse_sampling', label: 'Diffuse sampling', type: 'choice', default_value: 'uniform', choices: [
                {label: 'Uniform', value: 'uniform'}, {label: 'Cosine weighted', value: 'cosine_weighted'}
            ]
        }
    ]
}];

export class Boundaries extends EntryView {
    constructor(project: CaseProject) {
        super(project, 'boundaries', 'BOUNDARIES');
    }

    execute(api: typeof vscode, action: ViewAction): Promise<void> {
        return this.edit_entries(api, action, BOUNDARY_KINDS);
    }

    protected async items(state: ProjectState): Promise<ViewItem[]> {
        return [
            ...await this.entry_rows(state.boundaries, BOUNDARY_KINDS, state),
            this.action_row('Add Boundary', {action: 'add'}, 'add')
        ];
    }
}
