import type * as vscode from 'vscode';
import {DockerRuntime} from './docker_runtime';
import type {BackendMode, BackendState, EngineProcess} from './backend_types';
import {IMAGES} from './backend_types';

export class BackendManager implements vscode.Disposable {
    private process?: EngineProcess;
    private readonly listeners = new Set<(process?: EngineProcess, error?: Error) => void>();
    private stop_listening?: () => void;
    private root?: string;
    mode: BackendMode = 'tbb';
    state: BackendState = 'disconnected';
    error?: Error;

    constructor(private readonly runtime: DockerRuntime, private readonly log: (message: string) => void) {}

    get_process(): EngineProcess | undefined { return this.process; }

    on_change(listener: (process?: EngineProcess, error?: Error) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async connect(mode: BackendMode, project_root: string,
                  confirm_cuda: (report: string) => Promise<boolean>,
                  verify: (process: EngineProcess) => Promise<void>,
                  close_previous: () => Promise<void>): Promise<boolean> {
        if (this.process && this.mode === mode && this.root === project_root && this.state === 'ready') {
            return true;
        }
        if (this.state === 'starting') {
            return false;
        }
        this.state = 'starting';
        this.error = undefined;
        this.notify();
        try {
            const server = await this.runtime.run(['info', '--format', '{{.OSType}} {{.Architecture}}']);
            if (!/^linux (x86_64|amd64)$/.test(server)) {
                throw new Error(`Atlas requires a Linux x86-64 Docker server; found ${server}.`);
            }
            if (!await this.runtime.has_image('tbb')) {
                this.log(`Pulling ${IMAGES.tbb}\n`);
                await this.runtime.run(['pull', IMAGES.tbb], this.log);
            }
            if (mode === 'cuda') {
                const report = await this.runtime.check_cuda();
                const capability = Number(report.split('\n')[0]?.split(',').at(-1)?.trim());
                if (!Number.isFinite(capability) || capability < 7.5) {
                    throw new Error(`Atlas CUDA requires compute capability 7.5 or newer. Detected: ${report || 'no GPU'}`);
                }
                if (!await this.runtime.has_image('cuda')) {
                    if (!await confirm_cuda(report)) {
                        this.state = this.process ? 'ready' : 'disconnected';
                        this.notify();
                        return false;
                    }
                    this.log(`Pulling ${IMAGES.cuda}\n`);
                    await this.runtime.run(['pull', IMAGES.cuda], this.log);
                }
            }
            const next = this.runtime.open(mode, project_root, this.log);
            try {
                await verify(next);
                await close_previous();
            } catch (error) {
                next.dispose();
                throw error;
            }
            this.stop_listening?.();
            this.process?.dispose();
            this.process = next;
            this.mode = mode;
            this.root = project_root;
            this.state = 'ready';
            this.stop_listening = next.on_exit(error => {
                if (this.process !== next) {
                    return;
                }
                this.process = undefined;
                this.state = 'failed';
                this.error = error;
                this.log(`${error.message}\n`);
                this.notify(error);
            });
            this.notify();
            return true;
        } catch (error) {
            this.error = error instanceof Error ? error : new Error(String(error));
            this.state = this.process ? 'ready' : 'failed';
            this.log(`${this.error.message}\n`);
            this.notify(this.error);
            return false;
        }
    }

    dispose(): void {
        this.disconnect();
        this.listeners.clear();
    }

    disconnect(): void {
        this.stop_listening?.();
        this.process?.dispose();
        this.process = undefined;
        this.root = undefined;
        this.state = 'disconnected';
        this.notify();
    }

    private notify(error?: Error): void {
        for (const listener of this.listeners) {
            listener(this.process, error);
        }
    }
}
