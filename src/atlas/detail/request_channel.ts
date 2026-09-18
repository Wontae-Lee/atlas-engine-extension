import { cancelled, error_message } from './private_helpers';
import { createInterface, type Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	cleanup: () => void;
}

export class RequestChannel {
	private readonly lines: Interface;
	private readonly pending = new Map<number, PendingRequest>();
	private next_id = 0;
	private closed = false;
	private failure?: Error;

	constructor(
		input: Readable,
		private readonly output: Writable,
		private readonly on_failure: (error: Error) => void
	) {
		this.lines = createInterface({ input });
		this.lines.on('line', line => this.receive(line));
	}

	request(method: string, params?: unknown, signal?: AbortSignal): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(cancelled());
				return;
			}
			if (this.closed) {
				reject(this.failure ?? new Error('Backend connection has been disposed.'));
				return;
			}
			const id = ++this.next_id;
			const abort = () => this.on_failure(cancelled());
			const timer = setTimeout(() => this.on_failure(new Error(`Backend ${method} request timed out.`)), 60_000);
			signal?.addEventListener('abort', abort, { once: true });
			this.pending.set(id, {
				resolve,
				reject,
				cleanup: () => {
					clearTimeout(timer);
					signal?.removeEventListener('abort', abort);
				}
			});
			try {
				this.output.write(`${JSON.stringify({ id, method, params })}\n`);
			} catch (error) {
				this.pending.delete(id);
				clearTimeout(timer);
				signal?.removeEventListener('abort', abort);
				reject(error instanceof Error ? error : new Error(error_message(error)));
			}
		});
	}

	private receive(line: string): void {
		if (this.closed) {
			return;
		}
		try {
			const response = JSON.parse(line) as { id?: unknown; result?: unknown; error?: unknown } | null;
			if (!response || typeof response.id !== 'number' || !this.pending.has(response.id)
				|| (('result' in response) === ('error' in response))
				|| ('error' in response && typeof response.error !== 'string')) {
				throw new Error('Unexpected response shape or request ID.');
			}
			const pending = this.pending.get(response.id)!;
			this.pending.delete(response.id);
			pending.cleanup();
			if ('error' in response) {
				pending.reject(new Error(`Atlas backend: ${response.error}`));
			} else {
				pending.resolve(response.result);
			}
		} catch (error) {
			this.on_failure(new Error(`Invalid backend JSON response: ${error_message(error)}`));
		}
	}

	dispose(error?: Error): void {
		this.closed = true;
		this.failure = error;
		this.lines.close();
		for (const request of this.pending.values()) {
			request.cleanup();
			request.reject(this.failure ?? new Error('Backend connection has been disposed.'));
		}
		this.pending.clear();
	}
}
