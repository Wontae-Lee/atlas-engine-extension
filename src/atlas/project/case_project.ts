import type * as vscode from 'vscode';
import {MoleculeCatalog} from '../catalog/molecule_catalog';
import type {SimulationConfig, Vector3} from '../streaming/streaming_types';
import {validate_project} from '../detail/project_validation';
import {AssetStore} from './asset_store';
import type {ProjectEntry, ProjectState} from './project_types';

export class CaseProject {
    readonly assets = new AssetStore();
    applied_revision?: number;
    private storage?: vscode.Memento;
    private readonly listeners = new Set<() => void>();
    private pending: Promise<void> = Promise.resolve();
    private state: ProjectState;
    private current_revision = 0;

    constructor(readonly catalog: MoleculeCatalog, initial_state?: ProjectState) {
        this.state = initial_state === undefined ? this.default_state() : structuredClone(initial_state);
    }

    get revision(): number {
        return this.current_revision;
    }

    initialize(api: typeof vscode, storage?: vscode.Memento): void {
        this.assets.initialize(api);
        this.storage = storage;
        const stored = storage?.get<ProjectState>('atlas-engine.project.v1');
        if (stored) {
            validate_project(stored);
            if (stored.initial_preset || [stored.assets, stored.materials, stored.geometry, stored.sources, stored.boundaries, stored.sinks]
                .some(entries => entries.length > 0)) {
                this.state = structuredClone(stored);
                this.remove_legacy_domain_sink();
            }
        }
    }

    get_state(): ProjectState {
        return structuredClone(this.state);
    }

    on_change(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    mark_applied(revision: number): void {
        this.applied_revision = revision;
        for (const listener of this.listeners) {
            listener();
        }
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
        this.pending = operation.catch(() => {
        });
        return operation;
    }

    async to_simulation_config(): Promise<SimulationConfig> {
        const state = this.get_state();
        validate_project(state, true);
        const referenced_assets = new Set(state.geometry
            .filter(entry => entry.kind === 'triangle_mesh').map(entry => entry.fields.asset_id));
        const assets = await Promise.all(state.assets.filter(asset => referenced_assets.has(asset.id))
            .map(async asset => ({id: asset.id, content: await this.assets.read_asset(asset)})));
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
            particles: {positions: [], velocities: [], species: []},
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

    private default_state(): ProjectState {
        const preset_id = 'n2-piclas-reference-vhs';
        const properties = this.catalog.create_materials([{
            preset_id, energy: {translational_energy: 0, rotational_energy: 0, vibrational_energy: 0}
        }]).materials[0];
        const geometry: ProjectEntry[] = [
            {id: 'sphere', name: 'Sphere', kind: 'sphere', fields: {center: [0, 0, 0], radius: 0.5}},
            {
                id: 'inlet-face',
                name: 'Nitrogen Inlet Face',
                kind: 'square',
                fields: {center: [-1, 0, 0], normal: [1, 0, 0], side_length: 2}
            }
        ];
        for (const entry of geometry) {
            Object.assign(entry.fields, {
                translation: [0, 0, 0], rotation: [0, 0, 0], velocity: [0, 0, 0], angular_velocity: [0, 0, 0]
            });
        }
        return {
            version: 1,
            initial_preset: 'nitrogen_sphere',
            domain: {lower_corner: [-1, -1, -1], upper_corner: [1, 1, 1], cell_size: 0.1},
            solver: {
                collision_model: 'vhs', dt: 1e-5, statistical_weight: 1,
                buffer_size: 1000000, majorant_sample_pairs: 8, majorant_exhaustive_limit: 5
            },
            output: {enabled: false, interval: 100, output_directory: 'results'},
            assets: [],
            materials: [{id: 'nitrogen', name: 'Nitrogen (N2)', preset_id, collision_model: 'vhs', properties}],
            geometry,
            sources: [{
                id: 'nitrogen-inlet', name: 'Nitrogen Inlet', kind: 'surface', fields: {
                    geometry_id: 'inlet-face', material_id: 'nitrogen', spacing: 0.1,
                    tolerance: 1e-6, temperature: 300, bulk_velocity: [500, 0, 0]
                }
            }],
            boundaries: [{
                id: 'sphere-wall', name: 'Sphere Collider', kind: 'isothermal', fields: {
                    geometry_id: 'sphere', momentum_accommodation_coefficient: 1,
                    restitution: 1, diffuse_sampling: 'cosine_weighted'
                }
            }],
            sinks: []
        };
    }

    private remove_legacy_domain_sink(): void {
        if (this.state.initial_preset !== 'nitrogen_sphere') {
            return;
        }
        const box = this.state.geometry.find(entry => entry.id === 'escape-box' && entry.kind === 'box');
        if (!box || JSON.stringify(box.fields.lower) !== JSON.stringify(this.state.domain.lower_corner)
            || JSON.stringify(box.fields.upper) !== JSON.stringify(this.state.domain.upper_corner)
            || ['translation', 'rotation', 'velocity', 'angular_velocity'].some(key =>
                JSON.stringify(box.fields[key]) !== '[0,0,0]')) {
            return;
        }
        this.state.sinks = this.state.sinks.filter(sink => !(sink.id === 'outside-box'
            && sink.kind === 'outside_box' && sink.fields.geometry_id === box.id));
        const referenced = [...this.state.sources, ...this.state.boundaries, ...this.state.sinks]
            .some(entry => entry.fields.geometry_id === box.id);
        if (!referenced) {
            this.state.geometry = this.state.geometry.filter(entry => entry.id !== box.id);
        }
    }
}
