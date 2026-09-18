import type * as vscode from 'vscode';
import type { CaseProject } from '../../project/case_project';
import type { Streaming } from '../../streaming/streaming';
import type { SimulationSnapshot } from '../../streaming/streaming_types';
import { snapshot_statistics } from '../../detail/private_helpers';
import type { ViewItem } from '../view_types';
import { View } from '../view';

export class SimulationStatus extends View {
	private latest?: SimulationSnapshot;
	private statistics?: ReturnType<typeof snapshot_statistics>;
	private readonly history: { step: number; time: number; particle_count: number }[] = [];

	constructor(private readonly project: CaseProject, private readonly streaming: Streaming) {
		super('atlas-engine.inspector', 'SIMULATION STATUS');
	}

	update(): void {
		this.record_snapshot();
		super.update();
	}

	getChildren(element?: vscode.TreeItem): ViewItem[] {
		if (element) {
			return (element as ViewItem).children ?? [];
		}
		this.record_snapshot();
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
			{ id: 'mean-speed', label: 'Mean speed', description: this.statistics?.mean_speed === undefined ? '—' : `${this.statistics.mean_speed.toPrecision(6)} m/s` },
			{ id: 'rms-speed', label: 'RMS speed', description: this.statistics?.rms_speed === undefined ? '—' : `${this.statistics.rms_speed.toPrecision(6)} m/s` },
			{ id: 'error', label: 'Last error', description: this.streaming.last_error?.message ?? 'None' }
		];
		const items: ViewItem[] = rows.map(row => ({
			...row,
			id: `${this.id}:${row.id}`,
			tooltip: `${row.label}: ${row.description}${snapshot && this.streaming.last_error && ['step', 'time', 'dt', 'particles', 'cells', 'mean-speed', 'rms-speed'].includes(row.id)
				? '\nLast successful engine response.' : ''}`
		}));
		const materials = applied ? this.project.get_state().materials : [];
		const species = this.statistics?.species ?? [];
		items.push({
			id: `${this.id}:species`, label: 'Species', description: String(species.length),
			collapsibleState: species.length ? this.api.TreeItemCollapsibleState.Collapsed : this.api.TreeItemCollapsibleState.None,
			children: species.map(item => ({
				id: `${this.id}:species:${item.index}`, label: materials[item.index]?.name ?? `Species ${item.index}`,
				description: `${item.count.toLocaleString()} particles · ${(100 * item.count / snapshot!.particle_count).toFixed(2)}%`
			}))
		}, {
			id: `${this.id}:history`, label: 'Recent snapshots', description: `${this.history.length} / 300`,
			collapsibleState: this.history.length ? this.api.TreeItemCollapsibleState.Collapsed : this.api.TreeItemCollapsibleState.None,
			children: [...this.history].reverse().map(item => ({
				id: `${this.id}:history:${item.step}:${item.time}`, label: `Step ${item.step}`,
				description: `${item.time} s · ${item.particle_count.toLocaleString()} particles`
			}))
		});
		return items;
	}

	private record_snapshot(): void {
		const snapshot = this.streaming.last_snapshot;
		if (!snapshot) {
			this.latest = undefined;
			this.statistics = undefined;
			this.history.length = 0;
			return;
		}
		if (snapshot === this.latest) { return; }
		if (this.latest && (snapshot.step === 0 || snapshot.step < this.latest.step || snapshot.time < this.latest.time)) {
			this.history.length = 0;
		}
		this.statistics = snapshot_statistics(snapshot);
		const sample = { step: snapshot.step, time: snapshot.time, particle_count: snapshot.particle_count };
		const previous = this.history.at(-1);
		if (previous?.step === sample.step && previous.time === sample.time) { this.history[this.history.length - 1] = sample; }
		else {
			this.history.push(sample);
			if (this.history.length > 300) { this.history.shift(); }
		}
		this.latest = snapshot;
	}
}
