import type { BackendConnection, BackendMode } from '../../src/atlas/backend/backend_types';
import { Connection } from './connection';

export class Transport {
	readonly events: string[] = [];
	readonly images = new Set<BackendMode>();
	readonly connections = {
		tbb: new Connection('tbb', this.events),
		cuda: new Connection('cuda', this.events)
	};
	cuda_error?: Error;
	open_result?: Promise<BackendConnection>;

	async check_docker(): Promise<void> {
		this.events.push('check_docker');
	}

	async has_image(mode: BackendMode): Promise<boolean> {
		this.events.push(`has_image:${mode}`);
		return this.images.has(mode);
	}

	async pull(mode: BackendMode): Promise<void> {
		this.events.push(`pull:${mode}`);
		this.images.add(mode);
	}

	async check_cuda(): Promise<string> {
		this.events.push('check_cuda');
		if (this.cuda_error) {
			throw this.cuda_error;
		}
		return 'NVIDIA GPU, driver 580.0, compute capability 8.6';
	}

	async open(mode: BackendMode): Promise<BackendConnection> {
		this.events.push(`open:${mode}`);
		return this.open_result ?? this.connections[mode];
	}
}
