import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { BRIDGE } from './bridge';
import { IMAGES, type BackendMode, type BackendInfo, type BackendConnection } from '../backend/backend_types';
import { cancelled, is_container_removed, run } from './private_helpers';
import { RequestChannel } from './request_channel';

export class ContainerConnection implements BackendConnection {
	private readonly name = `atlas-engine-backend-${randomUUID()}`;
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly requests: RequestChannel;
	private readonly listeners = new Set<(error: Error) => void>();
	private closed = false;
	private stderr = '';
	private failure?: Error;
	private readonly abort: () => void;

	constructor(
		readonly mode: BackendMode,
		private readonly executable: string,
		private readonly on_output: (text: string) => void,
		private readonly signal?: AbortSignal
	) {
		const args = ['run', '--rm', '-i', '--pull=never', '--name', this.name, '--network', 'none'];
		if (mode === 'cuda') {
			args.push('--gpus', 'all');
		}
		args.push('--entrypoint', 'python', IMAGES[mode], '-u', '-c', BRIDGE);
		this.child = spawn(this.executable, args, { windowsHide: true, stdio: 'pipe' });
		this.requests = new RequestChannel(this.child.stdout, this.child.stdin, error => this.fail(error));
		this.child.stderr.setEncoding('utf8');
		this.child.stderr.on('data', (text: string) => {
			this.stderr = (this.stderr + text).slice(-16_384);
			this.on_output(text);
		});
		this.child.on('error', error => this.fail(new Error(`Could not start the backend: ${error.message}`)));
		this.child.stdin.on('error', error => this.fail(new Error(`Backend input failed: ${error.message}`)));
		this.child.on('close', code => {
			if (!this.closed) {
				this.fail(new Error(`Atlas ${mode.toUpperCase()} backend exited (${code}): ${this.stderr.trim()}`));
			}
			// Recheck after the Docker client exits to cover cancellation during container creation.
			this.remove_container();
		});
		this.abort = () => this.fail(cancelled());
		signal?.addEventListener('abort', this.abort, { once: true });
		if (signal?.aborted) {
			this.abort();
		}
	}

	async info(signal?: AbortSignal): Promise<BackendInfo> {
		const result = await this.requests.request('info', signal) as Partial<BackendInfo> | null;
		if (!result || result.protocol !== 1 || result.engine !== this.mode || typeof result.version !== 'string') {
			const error = new Error(`The ${this.mode.toUpperCase()} image returned incompatible backend information.`);
			this.fail(error);
			throw error;
		}
		return result as BackendInfo;
	}

	async smoke(signal?: AbortSignal): Promise<{ output: string }> {
		const result = await this.requests.request('smoke', signal) as { output?: unknown } | null;
		if (!result || typeof result.output !== 'string') {
			const error = new Error('The backend returned an invalid simulation result.');
			this.fail(error);
			throw error;
		}
		return { output: result.output };
	}

	on_exit(callback: (error: Error) => void): () => void {
		if (this.failure) {
			callback(this.failure);
		} else if (!this.closed) {
			this.listeners.add(callback);
		}
		return () => this.listeners.delete(callback);
	}

	private fail(error: Error): void {
		if (this.closed) {
			return;
		}
		this.failure = error;
		const listeners = [...this.listeners];
		this.dispose();
		for (const listener of listeners) {
			listener(error);
		}
	}

	private remove_container(): void {
		void run(this.executable, ['rm', '--force', this.name], undefined, () => {}, 10_000).catch(error => {
			if (!is_container_removed(error)) {
				this.on_output(`Could not remove ${this.name}: ${error.message}\n`);
			}
		});
	}

	dispose(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.signal?.removeEventListener('abort', this.abort);
		this.requests.dispose(this.failure);
		this.listeners.clear();
		this.child.stdin.end();
		this.child.kill('SIGKILL');
		this.remove_container();
	}
}
