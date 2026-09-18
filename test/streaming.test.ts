import * as assert from 'node:assert';
import { Streaming } from '../src/atlas/streaming/streaming';
import type { ParticleData, SimulationConfig, SimulationSnapshot, StreamingState } from '../src/atlas/streaming/streaming_types';
import { ConnectionSource } from './helpers/connection_source';
import { StreamingConnection } from './helpers/streaming_connection';

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

function configuration(): SimulationConfig {
	return {
		dt: 0.000001,
		statistical_weight: 1,
		materials: [{
			mass: 6.63e-26,
			translational_energy: 1,
			rotational_energy: 0,
			vibrational_energy: 0,
			reference_diameter: 3.66e-10,
			reference_temperature: 273,
			viscosity_index: 0.81,
			scattering_parameter: 1
		}],
		domain: { lower_corner: [0, 0, 0], upper_corner: [1, 1, 1], cell_size: 1 },
		particles: { positions: [[0.5, 0.5, 0.5]], velocities: [[1, 0, 0]], species: [0] }
	};
}

function snapshot(step = 0): SimulationSnapshot {
	return {
		step,
		dt: 0.000001,
		time: step * 0.000001,
		particle_count: 1,
		cell_count: 8,
		positions: [[0.5 + step * 0.000001, 0.5, 0.5]],
		velocities: [[1, 0, 0]],
		species: [0]
	};
}

async function initialize(streaming: Streaming, connection: StreamingConnection): Promise<void> {
	const pending = streaming.initialize(configuration());
	const request = await connection.wait_for_request(0);
	request.resolve(snapshot());
	await pending;
}

suite('Simulation streaming', () => {
	let connection: StreamingConnection;
	let source: ConnectionSource;
	let streaming: Streaming;

	setup(() => {
		connection = new StreamingConnection();
		source = new ConnectionSource(connection);
		streaming = new Streaming(source);
	});

	teardown(() => streaming.dispose());

	test('Initializes a session with the complete configuration and publishes its snapshot', async () => {
		const config = configuration();
		const snapshots: SimulationSnapshot[] = [];
		const unsubscribe = streaming.on_snapshot(value => snapshots.push(value));
		const pending = streaming.initialize(config);
		const request = await connection.wait_for_request(0);
		assert.strictEqual(request.method, 'initialize');
		assert.deepStrictEqual(request.params, config);
		assert.deepStrictEqual(snapshots, []);
		const initial = snapshot();
		request.resolve(initial);
		assert.deepStrictEqual(await pending, initial);
		assert.strictEqual(streaming.state, 'ready');
		assert.deepStrictEqual(streaming.last_snapshot, initial);
		assert.deepStrictEqual(snapshots, [initial]);
		assert.strictEqual(connection.disposed, false);
		unsubscribe();
	});

	test('Steps explicitly, rejects overlapping operations, and reads the current snapshot', async () => {
		await initialize(streaming, connection);
		const pending = streaming.step(3);
		const request = await connection.wait_for_request(1);
		assert.strictEqual(request.method, 'step');
		assert.deepStrictEqual(request.params, { count: 3 });
		await assert.rejects(streaming.reset(), /operation is already in progress/i);
		assert.strictEqual(connection.requests.length, 2);
		request.resolve(snapshot(3));
		assert.deepStrictEqual(await pending, snapshot(3));
		assert.strictEqual(streaming.state, 'ready');
		const reading = streaming.get_snapshot();
		const query = await connection.wait_for_request(2);
		assert.strictEqual(query.method, 'snapshot');
		assert.strictEqual(query.params, undefined);
		query.resolve(snapshot(3));
		assert.deepStrictEqual(await reading, snapshot(3));
	});

	test('Updates particles, resets the session, and closes it without disposing the backend', async () => {
		await initialize(streaming, connection);
		const particles: ParticleData = {
			positions: [[0.2, 0.3, 0.4]],
			velocities: [[-1, 0, 0]],
			species: [0]
		};
		const updating = streaming.set_particles(particles);
		const update = await connection.wait_for_request(1);
		assert.strictEqual(update.method, 'set_particles');
		assert.deepStrictEqual(update.params, particles);
		const changed = { ...snapshot(), ...particles };
		update.resolve(changed);
		assert.deepStrictEqual(await updating, changed);
		const resetting = streaming.reset();
		const reset = await connection.wait_for_request(2);
		assert.strictEqual(reset.method, 'reset');
		assert.strictEqual(reset.params, undefined);
		reset.resolve(snapshot());
		assert.deepStrictEqual(await resetting, snapshot());
		const closing = streaming.close();
		const close = await connection.wait_for_request(3);
		assert.strictEqual(close.method, 'close');
		assert.strictEqual(close.params, undefined);
		close.resolve(null);
		await closing;
		assert.strictEqual(streaming.state, 'empty');
		assert.strictEqual(streaming.last_snapshot, undefined);
		assert.strictEqual(connection.disposed, false);
	});

	test('Streaming allows one pending batch and pause waits for it without aborting the connection', async () => {
		await initialize(streaming, connection);
		const states: StreamingState[] = [];
		streaming.on_state(state => states.push(state));
		streaming.start({ steps_per_update: 2, interval_ms: 0 });
		const first = await connection.wait_for_request(1);
		assert.strictEqual(first.method, 'step');
		assert.deepStrictEqual(first.params, { count: 2 });
		await settle();
		assert.strictEqual(connection.requests.length, 2);
		assert.strictEqual(connection.in_flight, 1);
		await assert.rejects(streaming.set_particles(configuration().particles), /Pause/i);
		first.resolve(snapshot(2));
		const second = await connection.wait_for_request(2);
		assert.deepStrictEqual(second.params, { count: 2 });
		let paused = false;
		const pausing = streaming.pause().then(() => { paused = true; });
		await settle();
		assert.strictEqual(paused, false);
		assert.strictEqual(second.signal?.aborted, false);
		second.resolve(snapshot(4));
		await pausing;
		assert.strictEqual(streaming.state, 'paused');
		assert.deepStrictEqual(streaming.last_snapshot, snapshot(4));
		await settle();
		assert.strictEqual(connection.requests.length, 3);
		streaming.start({ steps_per_update: 2, interval_ms: 0 });
		const third = await connection.wait_for_request(3);
		const stopping = streaming.pause();
		third.resolve(snapshot(6));
		await stopping;
		assert.strictEqual(connection.max_in_flight, 1);
		assert.strictEqual(connection.disposed, false);
		assert.deepStrictEqual(states, ['running', 'paused', 'running', 'paused']);
	});

	test('Rejects malformed snapshots without publishing or replacing the last valid result', async () => {
		await initialize(streaming, connection);
		const snapshots: SimulationSnapshot[] = [];
		streaming.on_snapshot(value => snapshots.push(value));
		const pending = streaming.get_snapshot();
		const rejection = assert.rejects(pending);
		const request = await connection.wait_for_request(1);
		request.resolve({ ...snapshot(), particle_count: 2 });
		await rejection;
		assert.strictEqual(streaming.state, 'error');
		assert.ok(streaming.last_error instanceof Error);
		assert.deepStrictEqual(streaming.last_snapshot, snapshot());
		assert.deepStrictEqual(snapshots, []);
	});

	test('Unexpected disconnection preserves its transport error in the pending request and state', async () => {
		await initialize(streaming, connection);
		const snapshots: SimulationSnapshot[] = [];
		const states: { state: StreamingState; error?: Error }[] = [];
		streaming.on_snapshot(value => snapshots.push(value));
		streaming.on_state((state, error) => states.push({ state, error }));
		const failure = new Error('Docker connection lost: engine process exited');
		const pending = streaming.get_snapshot();
		const rejection = assert.rejects(pending, error => error === failure);
		await connection.wait_for_request(1);
		source.set_connection(undefined, failure);
		connection.exit(failure);
		await rejection;
		assert.strictEqual(streaming.state, 'disconnected');
		assert.strictEqual(streaming.last_error, failure);
		assert.strictEqual(streaming.last_snapshot, undefined);
		assert.deepStrictEqual(states, [{ state: 'disconnected', error: failure }]);
		assert.deepStrictEqual(snapshots, []);
	});

	test('Backend replacement ignores a late response and permits a new session immediately', async () => {
		await initialize(streaming, connection);
		connection.ignore_abort = true;
		const snapshots: SimulationSnapshot[] = [];
		streaming.on_snapshot(value => snapshots.push(value));
		const pending = streaming.step();
		const rejection = assert.rejects(pending, { name: 'AbortError' });
		const old_request = await connection.wait_for_request(1);
		const replacement = new StreamingConnection('cuda');
		source.set_connection(replacement);
		assert.strictEqual(old_request.signal?.aborted, true);
		assert.strictEqual(streaming.last_snapshot, undefined);
		await initialize(streaming, replacement);
		old_request.resolve(snapshot(99));
		await rejection;
		assert.strictEqual(streaming.state, 'ready');
		assert.deepStrictEqual(streaming.last_snapshot, snapshot());
		assert.deepStrictEqual(snapshots, [snapshot()]);
		assert.strictEqual(connection.disposed, false);
		assert.strictEqual(replacement.disposed, false);
	});

	test('Disposal suppresses late responses and releases its source subscription', async () => {
		await initialize(streaming, connection);
		connection.ignore_abort = true;
		const snapshots: SimulationSnapshot[] = [];
		streaming.on_snapshot(value => snapshots.push(value));
		const pending = streaming.step();
		const rejection = assert.rejects(pending, { name: 'AbortError' });
		const request = await connection.wait_for_request(1);
		streaming.dispose();
		assert.strictEqual(request.signal?.aborted, true);
		source.set_connection(new StreamingConnection('cuda'));
		request.resolve(snapshot(99));
		await rejection;
		assert.strictEqual(streaming.state, 'disposed');
		assert.deepStrictEqual(snapshots, []);
		assert.strictEqual(connection.disposed, false);
	});

	test('A failed streaming batch stops scheduling and allows the session to be reset', async () => {
		await initialize(streaming, connection);
		streaming.start({ interval_ms: 0 });
		const request = await connection.wait_for_request(1);
		request.reject(new Error('Atlas device operation failed'));
		await settle();
		assert.strictEqual(streaming.state, 'error');
		assert.match(streaming.last_error!.message, /Atlas device operation failed/);
		assert.strictEqual(connection.requests.length, 2);
		const resetting = streaming.reset();
		const reset = await connection.wait_for_request(2);
		reset.resolve(snapshot());
		await resetting;
		assert.strictEqual(streaming.state, 'ready');
		assert.strictEqual(streaming.last_error, undefined);
	});
});
