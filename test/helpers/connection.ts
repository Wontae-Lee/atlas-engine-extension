import type { BackendConnection, BackendInfo, BackendMode } from '../../src/atlas/backend/backend_types';

export class Connection implements BackendConnection {
	disposed = false;
	info_result?: Promise<BackendInfo>;
	info_error?: Error;
	private readonly listeners = new Set<(error: Error) => void>();

	constructor(readonly mode: BackendMode, private readonly events: string[]) {}

	async info(): Promise<BackendInfo> {
		this.events.push(`info:${this.mode}`);
		if (this.info_error) {
			throw this.info_error;
		}
		return this.info_result ?? { engine: this.mode, version: '0.1.0', protocol: 1 };
	}

	async smoke(): Promise<{ output: string }> {
		return { output: 'simulation passed' };
	}

	on_exit(callback: (error: Error) => void): () => void {
		this.listeners.add(callback);
		return () => { this.listeners.delete(callback); };
	}

	exit(error: Error): void {
		for (const callback of this.listeners) {
			callback(error);
		}
	}

	dispose(): void {
		this.disposed = true;
		this.events.push(`dispose:${this.mode}`);
		this.listeners.clear();
	}
}
