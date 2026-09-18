import type { BackendConnection, BackendInfo, BackendMode } from '../../src/atlas/backend/backend_types';
import { Deferred } from './deferred';

interface StreamingRequest {
	method: string;
	params: unknown;
	signal?: AbortSignal;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}

export class StreamingConnection implements BackendConnection {
	readonly requests: StreamingRequest[] = [];
	disposed = false;
	ignore_abort = false;
	in_flight = 0;
	max_in_flight = 0;
	private readonly received = new Map<number, Deferred<StreamingRequest>>();
	private readonly listeners = new Set<(error: Error) => void>();

	constructor(readonly mode: BackendMode = 'tbb') {}

	async info(): Promise<BackendInfo> {
		return { engine: this.mode, version: '0.1.0', protocol: 1 };
	}

	async request(method: string, params?: unknown, signal?: AbortSignal): Promise<unknown> {
		let resolve!: (value: unknown) => void;
		let reject!: (error: Error) => void;
		const response = new Promise<unknown>((accept, fail) => {
			resolve = accept;
			reject = fail;
		});
		const abort = () => {
			if (!this.ignore_abort) {
				const error = new Error('Streaming request cancelled.');
				error.name = 'AbortError';
				reject(error);
			}
		};
		const request = { method, params, signal, resolve, reject };
		const index = this.requests.length;
		this.requests.push(request);
		this.in_flight++;
		this.max_in_flight = Math.max(this.max_in_flight, this.in_flight);
		this.received.get(index)?.resolve(request);
		signal?.addEventListener('abort', abort, { once: true });
		if (signal?.aborted) {
			abort();
		}
		try {
			return await response;
		} finally {
			this.in_flight--;
			signal?.removeEventListener('abort', abort);
		}
	}

	async wait_for_request(index: number): Promise<StreamingRequest> {
		const existing = this.requests[index];
		if (existing) {
			return existing;
		}
		let received = this.received.get(index);
		if (!received) {
			received = new Deferred<StreamingRequest>();
			this.received.set(index, received);
		}
		return received.promise;
	}

	on_exit(callback: (error: Error) => void): () => void {
		this.listeners.add(callback);
		return () => { this.listeners.delete(callback); };
	}

	exit(error: Error): void {
		for (const listener of this.listeners) {
			listener(error);
		}
	}

	dispose(): void {
		this.disposed = true;
		this.listeners.clear();
	}
}
