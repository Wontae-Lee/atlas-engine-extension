import type * as vscode from 'vscode';
import { MoleculeCatalog } from '../catalog/molecule_catalog';
import type { SimulationConfig, Vector3 } from '../streaming/streaming_types';
import { validate_project } from '../detail/project_validation';
import { AssetStore } from './asset_store';
import type { ProjectState } from './project_types';

export class CaseProject {
	readonly assets = new AssetStore();
	private storage?: vscode.Memento;
	private readonly listeners = new Set<() => void>();
	private pending: Promise<void> = Promise.resolve();
	private state: ProjectState = {
		version: 1,
		domain: { lower_corner: [0, 0, 0], upper_corner: [1, 1, 1], cell_size: 0.1 },
		solver: {
			collision_model: 'vhs', dt: 1e-6, statistical_weight: 1,
			buffer_size: 100000, majorant_sample_pairs: 8, majorant_exhaustive_limit: 5
		},
		output: { enabled: false, interval: 100, output_directory: 'results' },
		assets: [], materials: [], geometry: [], sources: [], boundaries: [], sinks: []
	};
	private current_revision = 0;
	applied_revision?: number;

	constructor(readonly catalog: MoleculeCatalog) {}

	get revision(): number {
		return this.current_revision;
	}

	initialize(api: typeof vscode, storage?: vscode.Memento): void {
		this.assets.initialize(api);
		this.storage = storage;
		const stored = storage?.get<ProjectState>('atlas-engine.project.v1');
		if (stored) {
			validate_project(stored);
			this.state = structuredClone(stored);
		}
	}

	get_state(): ProjectState {
		return structuredClone(this.state);
	}

	on_change(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	assets_changed(): void {
		this.current_revision++;
		for (const listener of this.listeners) {
			listener();
		}
	}

	change(edit: (state: ProjectState) => void): Promise<void> {
		const operation = this.pending.then(async () => {
			const candidate = this.get_state();
			edit(candidate);
			validate_project(candidate);
			await this.storage?.update('atlas-engine.project.v1', candidate);
			this.state = candidate;
			this.current_revision++;
			for (const listener of this.listeners) {
				listener();
			}
		});
		this.pending = operation.catch(() => {});
		return operation;
	}

	async to_simulation_config(): Promise<SimulationConfig> {
		const state = this.get_state();
		validate_project(state, true);
		const referenced_assets = new Set(state.geometry
			.filter(entry => entry.kind === 'triangle_mesh').map(entry => entry.fields.asset_id));
		const assets = await Promise.all(state.assets.filter(asset => referenced_assets.has(asset.id))
			.map(async asset => ({ id: asset.id, content: await this.assets.read_asset(asset) })));
		return {
			collision_model: state.solver.collision_model,
			dt: state.solver.dt,
			statistical_weight: state.solver.statistical_weight,
			buffer_size: state.solver.buffer_size,
			solver: {
				majorant_sample_pairs: state.solver.majorant_sample_pairs,
				majorant_exhaustive_limit: state.solver.majorant_exhaustive_limit
			},
			domain: {
				lower_corner: state.domain.lower_corner as Vector3,
				upper_corner: state.domain.upper_corner as Vector3,
				cell_size: state.domain.cell_size
			},
			materials: state.materials.map(material => material.properties),
			particles: { positions: [], velocities: [], species: [] },
			scene: {
				assets,
				geometry: state.geometry,
				sources: state.sources.map(source => ({
					...source,
					fields: {
						...source.fields,
						material_id: state.materials.findIndex(material => material.id === source.fields.material_id)
					}
				})),
				boundaries: state.boundaries,
				sinks: state.sinks,
				output: state.output
			}
		};
	}

	dispose(): void {
		this.listeners.clear();
	}
}
