import type { BackendConnection } from '../backend/backend_types';
import { cancelled, error_message, is_simulation_snapshot } from '../detail/private_helpers';
import type {
	ConnectionSource, ParticleData, RunOptions, SimulationConfig, SimulationSnapshot, StreamingState
} from './streaming_types';

export class Streaming {
	private connection?: BackendConnection;
	private readonly stop_source: () => void;
	private stop_exit?: () => void;
	private readonly snapshot_listeners = new Set<(snapshot: SimulationSnapshot) => void>();
	private readonly state_listeners = new Set<(state: StreamingState, error?: Error) => void>();
	private current_state: StreamingState = 'empty';
	private snapshot?: SimulationSnapshot;
	private failure?: Error;
	private initialized = false;
	private generation = 0;
	private operation?: AbortController;
	private pending_request?: Promise<SimulationSnapshot | undefined>;
	private timer?: ReturnType<typeof setTimeout>;
	private steps_per_update = 1;
	private interval_ms = 100;

	constructor(source: ConnectionSource) {
		this.replace_connection(source.get_connection());
		this.stop_source = source.on_connection((connection, error) => this.replace_connection(connection, error));
	}

	get state(): StreamingState {
		return this.current_state;
	}

	get last_snapshot(): SimulationSnapshot | undefined {
		return this.snapshot;
	}

	get last_error(): Error | undefined {
		return this.failure;
	}

	async initialize(config: SimulationConfig): Promise<SimulationSnapshot> {
		this.require_idle(false);
		return (await this.request('initialize', config))!;
	}

	async get_snapshot(): Promise<SimulationSnapshot> {
		this.require_idle();
		return (await this.request('snapshot'))!;
	}

	async step(count = 1): Promise<SimulationSnapshot> {
		this.require_idle();
		this.validate_count(count);
		return (await this.request('step', { count }))!;
	}

	async set_particles(particles: ParticleData): Promise<SimulationSnapshot> {
		this.require_idle();
		return (await this.request('set_particles', particles))!;
	}

	async reset(): Promise<SimulationSnapshot> {
		this.require_idle();
		return (await this.request('reset'))!;
	}

	async close(): Promise<void> {
		this.require_idle();
		await this.request('close');
	}

	start(options: RunOptions = {}): void {
		this.require_idle();
		const steps = options.steps_per_update ?? 1;
		const interval = options.interval_ms ?? 100;
		this.validate_count(steps);
		if (!Number.isFinite(interval) || interval < 0) {
			throw new Error('interval_ms must be a finite non-negative number.');
		}
		this.steps_per_update = steps;
		this.interval_ms = interval;
		this.failure = undefined;
		this.set_state('running');
		void this.run_batch(this.generation);
	}

	async pause(): Promise<void> {
		if (this.current_state === 'disposed') {
			throw new Error('Streaming has been disposed.');
		}
		if (!this.initialized) {
			throw new Error('Initialize a simulation before pausing it.');
		}
		this.stop_timer();
		this.set_state('paused');
		await this.pending_request?.then(() => {}, () => {});
	}

	on_snapshot(listener: (snapshot: SimulationSnapshot) => void): () => void {
		this.snapshot_listeners.add(listener);
		return () => { this.snapshot_listeners.delete(listener); };
	}

	on_state(listener: (state: StreamingState, error?: Error) => void): () => void {
		this.state_listeners.add(listener);
		return () => { this.state_listeners.delete(listener); };
	}

	dispose(): void {
		if (this.current_state === 'disposed') {
			return;
		}
		this.stop_source();
		this.stop_exit?.();
		this.connection = undefined;
		this.invalidate();
		this.set_state('disposed');
		this.snapshot_listeners.clear();
		this.state_listeners.clear();
	}

	private require_idle(require_session = true): void {
		if (this.current_state === 'disposed') {
			throw new Error('Streaming has been disposed.');
		}
		if (!this.connection) {
			throw new Error('The Atlas backend is not connected.');
		}
		if (this.current_state === 'running') {
			throw new Error('Pause the simulation before sending a manual request.');
		}
		if (this.operation) {
			throw new Error('A simulation operation is already in progress.');
		}
		if (require_session && !this.initialized) {
			throw new Error('Initialize a simulation before using it.');
		}
	}

	private validate_count(count: number): void {
		if (!Number.isInteger(count) || count < 1 || count > 1_000) {
			throw new Error('The step count must be an integer from 1 to 1000.');
		}
	}

	private request(method: string, params?: unknown): Promise<SimulationSnapshot | undefined> {
		const connection = this.connection!;
		const generation = this.generation;
		const operation = new AbortController();
		this.operation = operation;
		const pending = this.receive(connection, generation, operation, method, params);
		this.pending_request = pending;
		return pending;
	}

	private async receive(
		connection: BackendConnection, generation: number, operation: AbortController, method: string, params?: unknown
	): Promise<SimulationSnapshot | undefined> {
		try {
			const result = await connection.request(method, params, operation.signal);
			if (generation !== this.generation || connection !== this.connection || operation.signal.aborted) {
				throw operation.signal.reason instanceof Error ? operation.signal.reason : cancelled();
			}
			if (method === 'close') {
				if (result !== null) {
					throw new Error('The backend returned an invalid simulation close response.');
				}
				this.initialized = false;
				this.snapshot = undefined;
				this.failure = undefined;
				this.set_state('empty');
				return undefined;
			}
			if (!is_simulation_snapshot(result)) {
				throw new Error('The backend returned an invalid simulation snapshot.');
			}
			this.initialized = true;
			this.snapshot = result;
			this.failure = undefined;
			if (this.current_state !== 'running' && this.current_state !== 'paused') {
				this.set_state('ready');
			}
			for (const listener of this.snapshot_listeners) {
				if (generation !== this.generation) {
					throw cancelled();
				}
				listener(result);
			}
			if (generation !== this.generation) {
				throw cancelled();
			}
			return result;
		} catch (error) {
			if (generation !== this.generation || operation.signal.aborted) {
				throw operation.signal.reason instanceof Error ? operation.signal.reason : cancelled();
			}
			this.stop_timer();
			this.failure = error instanceof Error ? error : new Error(error_message(error));
			this.set_state('error');
			throw this.failure;
		} finally {
			if (this.operation === operation) {
				this.operation = undefined;
				this.pending_request = undefined;
			}
		}
	}

	private async run_batch(generation: number): Promise<void> {
		if (generation !== this.generation || this.current_state !== 'running' || !this.connection || this.operation) {
			return;
		}
		try {
			await this.request('step', { count: this.steps_per_update });
		} catch {
			return;
		}
		if (generation === this.generation && this.current_state === 'running') {
			this.timer = setTimeout(() => {
				this.timer = undefined;
				void this.run_batch(generation);
			}, this.interval_ms);
		}
	}

	private replace_connection(connection: BackendConnection | undefined, error?: Error): void {
		if (this.current_state === 'disposed' || (connection && connection === this.connection)) {
			return;
		}
		this.stop_exit?.();
		this.stop_exit = undefined;
		this.invalidate(error);
		this.connection = connection;
		this.set_state(connection ? 'empty' : 'disconnected');
		if (connection) {
			this.stop_exit = connection.on_exit(error => {
				if (this.connection !== connection) {
					return;
				}
				this.connection = undefined;
				this.invalidate(error);
				this.set_state('disconnected');
			});
		}
	}

	private invalidate(error?: Error): void {
		this.generation++;
		this.stop_timer();
		const operation = this.operation;
		this.operation = undefined;
		this.pending_request = undefined;
		this.initialized = false;
		this.snapshot = undefined;
		this.failure = error;
		operation?.abort(error ?? cancelled());
	}

	private stop_timer(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private set_state(state: StreamingState): void {
		this.current_state = state;
		for (const listener of this.state_listeners) {
			listener(state, this.failure);
		}
	}
}
