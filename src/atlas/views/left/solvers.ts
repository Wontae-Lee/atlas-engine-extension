import type * as vscode from 'vscode';
import type {CaseProject} from '../../project/case_project';
import type {ProjectState} from '../../project/project_types';
import {ProjectView} from '../project_view';
import type {FieldDefinition, ViewAction, ViewItem} from '../view_types';

export const SOLVER_FIELDS: readonly FieldDefinition[] = [
    {
        key: 'collision_model',
        label: 'Collision model',
        type: 'choice',
        choices: [{label: 'VHS', value: 'vhs'}, {label: 'VSS', value: 'vss'}]
    },
    {key: 'dt', label: 'Time step', type: 'number', exclusive_min: 0, unit: 's'},
    {key: 'statistical_weight', label: 'Statistical weight', type: 'number', exclusive_min: 0},
    {key: 'buffer_size', label: 'Particle capacity', type: 'integer', min: 1, max: 2147483647},
    {key: 'majorant_sample_pairs', label: 'Majorant sample pairs', type: 'integer', min: 1, max: 2147483647},
    {key: 'majorant_exhaustive_limit', label: 'Majorant exhaustive limit', type: 'integer', min: 2, max: 2147483647}
];

export class Solvers extends ProjectView {
    constructor(project: CaseProject) {
        super(project, 'solvers', 'SOLVERS');
    }

    async execute(api: typeof vscode, action: ViewAction): Promise<void> {
        if (action.action !== 'edit') {
            throw new Error('Unsupported SOLVERS action.');
        }
        await this.edit_field(api, action, SOLVER_FIELDS, this.project.get_state().solver, (state, key, value) => {
            Object.assign(state.solver, {[key]: value});
        });
    }

    protected items(state: ProjectState): ViewItem[] {
        return [this.info_row('solver', 'Solver', 'DSMC'), ...this.field_rows(SOLVER_FIELDS, state.solver, state)];
    }
}
