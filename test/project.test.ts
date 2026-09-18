import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import { MoleculeCatalog } from '../src/atlas/catalog/molecule_catalog';
import { CaseProject } from '../src/atlas/project/case_project';
import type { EntrySection, FieldValue, MaterialRecord, ProjectEntry, ProjectState } from '../src/atlas/project/project_types';
import type { CollisionModel } from '../src/atlas/streaming/streaming_types';
import { empty_project } from './helpers/empty_project';

const api = {} as typeof vscode;

function fixture() {
	const catalog = new MoleculeCatalog();
	const stored = new Map<string, unknown>();
	const writes: { key: string; value: unknown }[] = [];
	let next_failure: Error | undefined;
	const storage: vscode.Memento = {
		keys: () => [...stored.keys()],
		get: <T>(key: string, fallback?: T): T =>
			(stored.has(key) ? structuredClone(stored.get(key)) : fallback) as T,
		update: async (key: string, value: unknown): Promise<void> => {
			if (next_failure) {
				const failure = next_failure;
				next_failure = undefined;
				throw failure;
			}
			const copy = structuredClone(value);
			stored.set(key, copy);
			writes.push({ key, value: copy });
		}
	};
	const project = new CaseProject(catalog, empty_project());
	project.initialize(api, storage);
	return {
		project, catalog, storage, stored, writes,
		fail_next_update(error: Error): void { next_failure = error; }
	};
}

function material(catalog: MoleculeCatalog, id: string, model: CollisionModel = 'vhs'): MaterialRecord {
	const preset_id = `ar-sparta-argon-${model}`;
	const selection = catalog.create_materials([{
		preset_id,
		energy: { translational_energy: 0, rotational_energy: 0, vibrational_energy: 0 }
	}]);
	return { id, name: id, preset_id, collision_model: model, properties: selection.materials[0] };
}

function entry(section: EntrySection, kind: string, id: string, references: Record<string, FieldValue> = {}): ProjectEntry {
	const fixtures: Record<string, Record<string, FieldValue>> = {
		'geometry:sphere': { center: [0, 0, 0], radius: 0.5 },
		'geometry:box': { lower: [-0.5, -0.5, -0.5], upper: [0.5, 0.5, 0.5] },
		'geometry:plane': { normal: [0, 0, 1], offset: 0 },
		'geometry:triangle': { a: [0, 0, 0], b: [1, 0, 0], c: [0, 1, 0] },
		'geometry:triangle_mesh': {},
		'sources:volume': { spacing: 0.1, tolerance: 0, temperature: 273.15, bulk_velocity: [0, 0, 0] },
		'boundaries:isothermal': { momentum_accommodation_coefficient: 1, restitution: 1, diffuse_sampling: 'uniform' },
		'sinks:tracing': {}
	};
	const fields = fixtures[`${section}:${kind}`];
	assert.ok(fields, `${section}: ${kind}`);
	if (section === 'geometry') {
		Object.assign(fields, { translation: [0, 0, 0], rotation: [0, 0, 0], velocity: [0, 0, 0], angular_velocity: [0, 0, 0] });
	}
	return { id, name: id, kind, fields: { ...fields, ...references } };
}

suite('Atlas case project', () => {
	test('persists valid edits and restores independently editable snapshots', async () => {
		const { project, catalog, storage, writes } = fixture();
		await project.change(state => {
			state.materials.push(material(catalog, 'argon'));
			state.geometry.push(entry('geometry', 'sphere', 'body'));
			state.domain.upper_corner = [2, 3, 4];
		});
		assert.strictEqual(project.revision, 1);
		assert.strictEqual(writes.length, 1);
		assert.strictEqual(writes[0].key, 'atlas-engine.project.v1');
		const restored = new CaseProject(catalog);
		restored.initialize(api, storage);
		assert.deepStrictEqual(restored.get_state(), project.get_state());
		const editable = restored.get_state();
		editable.domain.upper_corner[0] = 90;
		editable.materials[0].properties.mass = 1;
		(editable.geometry[0].fields.center as number[])[0] = 90;
		assert.strictEqual(restored.get_state().domain.upper_corner[0], 2);
		assert.strictEqual(restored.get_state().materials[0].properties.mass, 6.63e-26);
		assert.deepStrictEqual(restored.get_state().geometry[0].fields.center, [0, 0, 0]);
		assert.strictEqual(catalog.get_preset('ar-sparta-argon-vhs').mass, 6.63e-26);
	});

	test('does not publish or retain edits when persistence fails and accepts the next edit', async () => {
		const { project, writes, fail_next_update } = fixture();
		const before = project.get_state();
		const observed: number[] = [];
		project.on_change(() => observed.push(project.revision));
		const failure = new Error('Workspace storage is unavailable');
		fail_next_update(failure);
		await assert.rejects(project.change(state => { state.domain.cell_size = 0.25; }), error => error === failure);
		assert.deepStrictEqual(project.get_state(), before);
		assert.strictEqual(project.revision, 0);
		assert.deepStrictEqual(observed, []);
		assert.deepStrictEqual(writes, []);
		await project.change(state => { state.domain.cell_size = 0.5; });
		assert.strictEqual(project.get_state().domain.cell_size, 0.5);
		assert.strictEqual(project.revision, 1);
		assert.deepStrictEqual(observed, [1]);
		assert.strictEqual(writes.length, 1);
	});

	test('serializes concurrent changes against the latest committed state', async () => {
		const { project, writes } = fixture();
		await Promise.all([
			project.change(state => { state.solver.statistical_weight += 2; }),
			project.change(state => { state.solver.statistical_weight *= 3; })
		]);
		assert.strictEqual(project.get_state().solver.statistical_weight, 9);
		assert.strictEqual(project.revision, 2);
		assert.strictEqual(writes.length, 2);
	});

	test('rejects dangling references and deletion of geometry, material, or assets still in use', async () => {
		const { project, catalog, writes } = fixture();
		await project.change(state => {
			state.materials.push(material(catalog, 'argon'));
			state.assets.push({ id: 'obj', name: 'body.obj', path: 'assets/geometry/body.obj', workspace_uri: 'file:///project' });
			state.geometry.push(entry('geometry', 'triangle_mesh', 'body', { asset_id: 'obj' }));
			state.sources.push(entry('sources', 'volume', 'source', { geometry_id: 'body', material_id: 'argon' }));
		});
		const before = project.get_state();
		for (const section of ['geometry', 'materials', 'assets'] as const) {
			await assert.rejects(project.change(state => { state[section] = []; }), /missing/);
			assert.deepStrictEqual(project.get_state(), before);
		}
		await assert.rejects(project.change(state => {
			state.sources[0].fields.geometry_id = 'unknown';
		}), /missing geometry/);
		assert.strictEqual(writes.length, 1);
		assert.strictEqual(project.revision, 1);
		await project.change(state => {
			state.sources = [];
			state.geometry = [];
			state.materials = [];
			state.assets = [];
		});
		assert.deepStrictEqual(project.get_state().assets, []);
	});

	test('keeps invalid numerical values and degenerate geometry out of persisted state', async () => {
		const { project, writes } = fixture();
		const invalid_edits: ((state: ProjectState) => void)[] = [
			state => { state.domain.cell_size = Number.NaN; },
			state => { state.domain.lower_corner = [1, 0, 0]; },
			state => { state.solver.buffer_size = 1.5; },
			state => { state.output.output_directory = '../results'; },
			state => { state.geometry.push(entry('geometry', 'plane', 'plane', { normal: [0, 0, 0] })); },
			state => { state.geometry.push(entry('geometry', 'triangle', 'triangle', { c: [2, 0, 0] })); }
		];
		for (const edit of invalid_edits) {
			await assert.rejects(project.change(edit));
		}
		assert.strictEqual(project.revision, 0);
		assert.deepStrictEqual(writes, []);
	});

	test('allows a solver model change while editing and requires matching coefficients when applying', async () => {
		const { project, catalog } = fixture();
		await project.change(state => { state.materials.push(material(catalog, 'argon')); });
		assert.strictEqual((await project.to_simulation_config()).collision_model, 'vhs');
		await project.change(state => { state.solver.collision_model = 'vss'; });
		await assert.rejects(project.to_simulation_config(), /VSS material preset/);
		await project.change(state => { state.materials[0] = material(catalog, 'argon', 'vss'); });
		const config = await project.to_simulation_config();
		assert.strictEqual(config.collision_model, 'vss');
		assert.strictEqual(config.materials[0].scattering_parameter, 1.4);
		assert.strictEqual(config.materials[0].reference_diameter, 4.11e-10);
		await project.change(state => {
			state.solver.collision_model = 'vhs';
			state.materials[0] = material(catalog, 'argon');
			state.materials[0].properties.scattering_parameter = 1.4;
		});
		await assert.rejects(project.to_simulation_config(), /VHS requires a scattering parameter of 1/);
	});

	test('exports the scene and numeric material indices without mutating project references', async () => {
		const { project, catalog } = fixture();
		await project.change(state => {
			state.materials.push(material(catalog, 'first'), material(catalog, 'second'));
			state.geometry.push(entry('geometry', 'box', 'body'));
			state.sources.push(entry('sources', 'volume', 'source', { geometry_id: 'body', material_id: 'second' }));
			state.boundaries.push(entry('boundaries', 'isothermal', 'wall', { geometry_id: 'body' }));
			state.sinks.push(entry('sinks', 'tracing', 'outlet', { geometry_id: 'body' }));
			state.assets.push({ id: 'unused', name: 'unused.obj', path: 'assets/geometry/unused.obj', workspace_uri: 'file:///project' });
			state.solver.buffer_size = 12345;
			state.solver.majorant_sample_pairs = 12;
			state.solver.majorant_exhaustive_limit = 8;
			state.output = { enabled: true, interval: 25, output_directory: 'results/run_1' };
		});
		const config = await project.to_simulation_config();
		assert.ok(config.scene);
		assert.strictEqual(config.buffer_size, 12345);
		assert.deepStrictEqual(config.solver, { majorant_sample_pairs: 12, majorant_exhaustive_limit: 8 });
		assert.deepStrictEqual(config.particles, { positions: [], velocities: [], species: [] });
		assert.deepStrictEqual(config.scene.assets, []);
		assert.strictEqual(config.scene.sources[0].fields.material_id, 1);
		assert.strictEqual(config.scene.sources[0].fields.geometry_id, 'body');
		assert.strictEqual(config.scene.sources[0].fields.spacing, 0.1);
		assert.deepStrictEqual(config.scene.geometry, project.get_state().geometry);
		assert.deepStrictEqual(config.scene.boundaries, project.get_state().boundaries);
		assert.deepStrictEqual(config.scene.sinks, project.get_state().sinks);
		assert.deepStrictEqual(config.scene.output, { enabled: true, interval: 25, output_directory: 'results/run_1' });
		assert.strictEqual(project.get_state().sources[0].fields.material_id, 'second');
		config.materials[0].mass = 1;
		config.scene.geometry[0].fields.lower = [-90, -90, -90];
		assert.strictEqual(project.get_state().materials[0].properties.mass, 6.63e-26);
		assert.deepStrictEqual(project.get_state().geometry[0].fields.lower, [-0.5, -0.5, -0.5]);
	});

	test('allows an empty editable project but refuses to apply it without materials', async () => {
		const { project } = fixture();
		await project.change(state => { state.output.interval = 10; });
		await assert.rejects(project.to_simulation_config(), /at least one material/);
	});
});
