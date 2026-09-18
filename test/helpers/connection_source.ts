import type { BackendConnection } from '../../src/atlas/backend/backend_types';
import type { ConnectionSource as ConnectionSourceContract } from '../../src/atlas/streaming/streaming_types';

export class ConnectionSource implements ConnectionSourceContract {
	private readonly listeners = new Set<(connection: BackendConnection | undefined, error?: Error) => void>();

	constructor(private connection?: BackendConnection) {}

	get_connection(): BackendConnection | undefined {
		return this.connection;
	}

	on_connection(listener: (connection: BackendConnection | undefined, error?: Error) => void): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	set_connection(connection?: BackendConnection, error?: Error): void {
		this.connection = connection;
		for (const listener of this.listeners) {
			listener(connection, error);
		}
	}
}
