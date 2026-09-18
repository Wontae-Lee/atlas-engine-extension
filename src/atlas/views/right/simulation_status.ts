import type * as vscode from 'vscode';
import type { CaseProject } from '../../project/case_project';
import type { Streaming } from '../../streaming/streaming';
import { View } from '../view';

export class SimulationStatus extends View {
	constructor(private readonly project: CaseProject, private readonly streaming: Streaming) {
		super('atlas-engine.inspector', 'SIMULATION STATUS');
	}

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
		if (element) {
			return [];
		}
		const snapshot = this.streaming.last_snapshot;
		const applied = snapshot && this.project.applied_revision === this.project.revision;
		const rows = [
			{ id: 'state', label: 'State', description: this.streaming.state },
			{ id: 'settings', label: 'Case settings', description: applied ? 'Applied to engine' : 'Not applied to engine' },
			{ id: 'step', label: 'Step', description: snapshot ? String(snapshot.step) : '—' },
			{ id: 'time', label: 'Simulation time', description: snapshot ? `${snapshot.time} s` : '—' },
			{ id: 'dt', label: 'Time step', description: snapshot ? `${snapshot.dt} s` : '—' },
			{ id: 'particles', label: 'Particles', description: snapshot ? String(snapshot.particle_count) : '—' },
			{ id: 'cells', label: 'Cells', description: snapshot ? String(snapshot.cell_count) : '—' },
			{ id: 'error', label: 'Last error', description: this.streaming.last_error?.message ?? 'None' }
		];
		return rows.map(row => ({
			...row,
			id: `${this.id}:${row.id}`,
			tooltip: `${row.label}: ${row.description}${snapshot && this.streaming.last_error && ['step', 'time', 'dt', 'particles', 'cells'].includes(row.id)
				? '\nLast successful engine response.' : ''}`
		}));
	}
}
