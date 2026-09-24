import type {ChildProcessWithoutNullStreams} from 'node:child_process';

export type BackendMode = 'tbb' | 'cuda';

export const IMAGES: Readonly<Record<BackendMode, string>> = {
    tbb: 'ghcr.io/wontae-lee/atlas-engine-dev:tbb-ubuntu22.04',
    cuda: 'ghcr.io/wontae-lee/atlas-engine-dev:cuda-ubuntu22.04'
};

export interface EngineProcess {
    readonly child: ChildProcessWithoutNullStreams;
    on_exit(listener: (error: Error) => void): () => void;
    dispose(): void;
}

export type BackendState = 'disconnected' | 'starting' | 'ready' | 'failed';
