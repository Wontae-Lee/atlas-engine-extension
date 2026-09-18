import type * as vscode from 'vscode';
import type { CaseProject } from '../../project/case_project';
import type { ProjectState } from '../../project/project_types';
import type { Streaming } from '../../streaming/streaming';
import { ProjectView } from '../project_view';
import type { FieldDefinition, ViewAction, ViewItem } from '../view_types';

export const SOLVER_FIELDS: readonly FieldDefinition[] = [
	{ key: 'collision_model', label: 'Collision model', type: 'choice', choices: [{ label: 'VHS', value: 'vhs' }, { label: 'VSS', value: 'vss' }] },
	{ key: 'dt', label: 'Time step', type: 'number', exclusive_min: 0, unit: 's' },
	{ key: 'statistical_weight', label: 'Statistical weight', type: 'number', exclusive_min: 0 },
	{ key: 'buffer_size', label: 'Particle capacity', type: 'integer', min: 1, max: 2147483647 },
	{ key: 'majorant_sample_pairs', label: 'Majorant sample pairs', type: 'integer', min: 1, max: 2147483647 },
	{ key: 'majorant_exhaustive_limit', label: 'Majorant exhaustive limit', type: 'integer', min: 2, max: 2147483647 }
];

export class Solvers extends ProjectView {
	constructor(project: CaseProject, private readonly streaming: Streaming) {
		super(project, 'solvers', 'SOLVERS');
	}

	protected items(state: ProjectState): ViewItem[] {
		const stream_state = this.streaming.state;
		const applied = this.project.applied_revision === this.project.revision && this.streaming.last_snapshot !== undefined;
		const idle = stream_state === 'ready' || stream_state === 'paused';
		const rows = [
			this.info_row('solver', 'Solver', 'DSMC'),
			...this.field_rows(SOLVER_FIELDS, state.solver, state),
			this.info_row('state', 'Engine state', stream_state),
			this.info_row('revision', 'Project settings', applied ? 'Applied to engine' : 'Not applied to engine'),
			this.action_row('Apply to Engine', { action: 'apply' }, 'cloud-upload', stream_state !== 'running'),
			this.action_row('Start', { action: 'start' }, 'play', idle && applied),
			this.action_row('Pause', { action: 'pause' }, 'debug-pause', stream_state === 'running'),
			this.action_row('Step', { action: 'step' }, 'debug-step-over', idle && applied),
			this.action_row('Reset', { action: 'reset' }, 'debug-restart', idle && applied)
		];
		const snapshot = this.streaming.last_snapshot;
		if (snapshot) {
			rows.push(this.info_row('step', 'Current step', String(snapshot.step)),
				this.info_row('time', 'Simulation time', `${snapshot.time} s`),
				this.info_row('particles', 'Particles', String(snapshot.particle_count)));
		}
		if (this.streaming.last_error) {
			rows.push(this.info_row('error', 'Engine error', this.streaming.last_error.message));
		}
		return rows;
	}

	async execute(api: typeof vscode, action: ViewAction): Promise<void> {
		if (action.action === 'edit') {
			await this.edit_field(api, action, SOLVER_FIELDS, this.project.get_state().solver, (state, key, value) => {
				Object.assign(state.solver, { [key]: value });
			});
			return;
		}
		if (action.action === 'apply') {
			if (this.streaming.last_snapshot && await api.window.showWarningMessage(
				'Replace the current simulation with this case at step zero?', { modal: true }, 'Apply') !== 'Apply') {
				return;
			}
			const revision = this.project.revision;
			const config = await this.project.to_simulation_config();
			if (this.streaming.state === 'running') {
				await this.streaming.pause();
			}
			await this.streaming.initialize(config);
			this.project.applied_revision = revision;
			return;
		}
		if (action.action === 'pause') {
			await this.streaming.pause();
			return;
		}
		if (this.project.applied_revision !== this.project.revision || !this.streaming.last_snapshot) {
			throw new Error('Apply the current case to the engine first.');
		}
		if (action.action === 'start') {
			this.streaming.start();
		} else if (action.action === 'step') {
			await this.streaming.step();
		} else if (action.action === 'reset') {
			await this.streaming.pause();
			await this.streaming.reset();
		}
	}
}
