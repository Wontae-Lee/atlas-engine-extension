import * as assert from 'node:assert';
import { empty_project } from './helpers/empty_project';
import type * as vscode from 'vscode';
import { MoleculeCatalog } from '../src/atlas/catalog/molecule_catalog';
import { CaseProject } from '../src/atlas/project/case_project';
import { Solvers } from '../src/atlas/views/left/solvers';
import { Streaming } from '../src/atlas/streaming/streaming';
import type { SimulationConfig, SimulationSnapshot } from '../src/atlas/streaming/streaming_types';
import { ConnectionSource } from './helpers/connection_source';
import { StreamingConnection } from './helpers/streaming_connection';

function snapshot(): SimulationSnapshot {
	return {
		step: 0, dt: 1e-6, time: 0, particle_count: 0, cell_count: 1331,
		positions: [], velocities: [], species: []
	};
}

suite('Solver view simulation controls', () => {
	let connection: StreamingConnection;
	let streaming: Streaming;
	let project: CaseProject;
	let solvers: Solvers;
	let api: typeof vscode;
	let confirmation: string | undefined;
	let warnings: string[];

	setup(async () => {
		connection = new StreamingConnection();
		streaming = new Streaming(new ConnectionSource(connection));
		const catalog = new MoleculeCatalog();
		project = new CaseProject(catalog, empty_project());
		const properties = catalog.create_materials([{
			preset_id: 'ar-sparta-argon-vhs',
			energy: { translational_energy: 0, rotational_energy: 0, vibrational_energy: 0 }
		}]).materials[0];
		await project.change(state => {
			state.solver.buffer_size = 1024;
			state.materials.push({
				id: 'argon', name: 'Argon', preset_id: 'ar-sparta-argon-vhs', collision_model: 'vhs', properties
			});
			state.geometry.push({
				id: 'sphere', name: 'Sphere', kind: 'sphere',
				fields: {
					center: [0.5, 0.5, 0.5], radius: 0.25,
					translation: [0, 0, 0], rotation: [0, 0, 0],
					velocity: [0, 0, 0], angular_velocity: [0, 0, 0]
				}
			});
			state.sources.push({
				id: 'emitter', name: 'Emitter', kind: 'volume',
				fields: {
					geometry_id: 'sphere', material_id: 'argon', spacing: 0.1,
					tolerance: 0, temperature: 300, bulk_velocity: [2, 0, 0]
				}
			});
			state.boundaries.push({
				id: 'wall', name: 'Wall', kind: 'isothermal',
				fields: { geometry_id: 'sphere', momentum_accommodation_coefficient: 1, restitution: 1, diffuse_sampling: 'uniform' }
			});
			state.sinks.push({ id: 'sink', name: 'Sink', kind: 'tracing', fields: { geometry_id: 'sphere' } });
			state.output.enabled = true;
		});
		solvers = new Solvers(project, streaming);
		confirmation = 'Apply';
		warnings = [];
		api = {
			window: {
				showWarningMessage: async (message: string) => {
					warnings.push(message);
					return confirmation;
				}
			}
		} as unknown as typeof vscode;
	});

	teardown(() => {
		solvers.dispose();
		streaming.dispose();
		project.dispose();
	});

	async function begin_apply(index: number) {
		const pending = solvers.execute(api, { section: 'solvers', action: 'apply' });
		const request = await Promise.race([
			connection.wait_for_request(index),
			pending.then(() => { throw new Error('Apply completed without sending an initialize request.'); })
		]);
		return { pending, request };
	}

	async function apply_initial(): Promise<void> {
		const { pending, request } = await begin_apply(0);
		request.resolve(snapshot());
		await pending;
	}

	test('First Apply initializes an empty session with the scene and reserved particle capacity', async () => {
		assert.strictEqual(streaming.state, 'empty');
		const revision = project.revision;
		const { pending, request } = await begin_apply(0);
		assert.strictEqual(request.method, 'initialize');
		assert.strictEqual(project.applied_revision, undefined);
		assert.deepStrictEqual(warnings, []);
		const config = request.params as SimulationConfig;
		assert.strictEqual(config.buffer_size, 1024);
		assert.strictEqual(config.collision_model, 'vhs');
		assert.deepStrictEqual(config.solver, { majorant_sample_pairs: 8, majorant_exhaustive_limit: 5 });
		assert.deepStrictEqual(config.particles, { positions: [], velocities: [], species: [] });
		assert.strictEqual(config.materials.length, 1);
		assert.ok(config.scene);
		assert.strictEqual(config.scene.geometry[0].kind, 'sphere');
		assert.strictEqual(config.scene.sources[0].fields.material_id, 0);
		assert.strictEqual(config.scene.sources[0].fields.geometry_id, 'sphere');
		assert.strictEqual(config.scene.sources[0].fields.temperature, 300);
		assert.deepStrictEqual(config.scene.sources[0].fields.bulk_velocity, [2, 0, 0]);
		assert.strictEqual(config.scene.boundaries[0].kind, 'isothermal');
		assert.strictEqual(config.scene.sinks[0].kind, 'tracing');
		assert.deepStrictEqual(config.scene.output, { enabled: true, interval: 100, output_directory: 'results' });
		request.resolve(snapshot());
		await pending;
		assert.strictEqual(project.applied_revision, revision);
		assert.strictEqual(streaming.state, 'ready');
		assert.strictEqual(connection.requests.length, 1);
	});

	test('A rejected first Apply leaves the case unapplied', async () => {
		const { pending, request } = await begin_apply(0);
		const rejection = assert.rejects(pending, /Invalid source geometry/);
		request.reject(new Error('Invalid source geometry'));
		await rejection;
		assert.strictEqual(project.applied_revision, undefined);
		assert.strictEqual(streaming.last_snapshot, undefined);
		assert.strictEqual(streaming.state, 'error');
	});

	test('A failed replacement preserves the previous applied revision and snapshot', async () => {
		await apply_initial();
		const applied = project.applied_revision;
		const previous = streaming.last_snapshot;
		await project.change(state => { state.solver.dt = 2e-6; });
		const { pending, request } = await begin_apply(1);
		assert.strictEqual(project.applied_revision, applied);
		const rejection = assert.rejects(pending, /Engine rejected case/);
		request.reject(new Error('Engine rejected case'));
		await rejection;
		assert.strictEqual(project.applied_revision, applied);
		assert.notStrictEqual(project.applied_revision, project.revision);
		assert.strictEqual(streaming.last_snapshot, previous);
	});

	test('Cancelling replacement Apply leaves the current engine session untouched', async () => {
		await apply_initial();
		const previous = streaming.last_snapshot;
		const applied = project.applied_revision;
		confirmation = undefined;
		await solvers.execute(api, { section: 'solvers', action: 'apply' });
		assert.strictEqual(warnings.length, 1);
		assert.strictEqual(connection.requests.length, 1);
		assert.strictEqual(streaming.last_snapshot, previous);
		assert.strictEqual(streaming.state, 'ready');
		assert.strictEqual(project.applied_revision, applied);
	});

	test('Changing a case after Apply blocks Start until the new revision is applied', async () => {
		await apply_initial();
		await project.change(state => { state.solver.dt = 2e-6; });
		await assert.rejects(solvers.execute(api, { section: 'solvers', action: 'start' }), /Apply the current case/);
		assert.strictEqual(connection.requests.length, 1);
		assert.strictEqual(streaming.state, 'ready');
	});
});
