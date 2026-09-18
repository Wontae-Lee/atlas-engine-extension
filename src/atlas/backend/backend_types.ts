export type BackendMode = 'tbb' | 'cuda';

export const IMAGES: Readonly<Record<BackendMode, string>> = {
	tbb: 'ghcr.io/wontae-lee/atlas-engine-dev:tbb-ubuntu22.04',
	cuda: 'ghcr.io/wontae-lee/atlas-engine-dev:cuda-ubuntu22.04'
};

export interface BackendInfo {
	engine: string;
	version: string;
	protocol: number;
	availableEngines?: string[];
}

/** A connection owns exactly one container, which dispose() removes asynchronously. */
export interface BackendConnection {
	readonly mode: BackendMode;
	info(signal?: AbortSignal): Promise<BackendInfo>;
	smoke(signal?: AbortSignal): Promise<{ output: string }>;
	on_exit(callback: (error: Error) => void): () => void;
	dispose(): void;
}

export interface BackendTransport {
	check_docker(signal?: AbortSignal): Promise<void>;
	has_image(mode: BackendMode, signal?: AbortSignal): Promise<boolean>;
	pull(mode: BackendMode, on_output: (text: string) => void, signal?: AbortSignal): Promise<void>;
	check_cuda(signal?: AbortSignal): Promise<string>;
	open(mode: BackendMode, on_output: (text: string) => void, signal?: AbortSignal): Promise<BackendConnection>;
}
