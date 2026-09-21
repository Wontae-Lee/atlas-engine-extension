import {error_message} from '../detail/private_helpers';
import type * as vscode from 'vscode';
import {DockerBackend} from './docker_backend';
import {BackendSetup} from '../detail/backend_setup';
import {BackendUi} from '../detail/backend_ui';
import type {BackendConnection, BackendMode, BackendTransport} from './backend_types';


export class Backend implements vscode.Disposable {
    private readonly ui = new BackendUi();
    private readonly setup: BackendSetup;
    private storage?: vscode.Memento;
    private connection?: BackendConnection;
    private readonly connection_listeners = new Set<(connection: BackendConnection | undefined, error?: Error) => void>();
    private stop_listening?: () => void;
    private operation?: AbortController;
    private mode: BackendMode = 'tbb';
    private stage = 'Not connected';
    private failure?: string;
    private started = false;
    private disposed = false;

    constructor(private readonly transport: BackendTransport = new DockerBackend()) {
        this.setup = new BackendSetup(transport, this.ui);
    }

    initialize(api: typeof vscode, storage?: vscode.Memento): void {
        this.storage = storage;
        this.ui.initialize(api);
        this.refresh();
    }


    update(): void {
        if (!this.started && !this.disposed) {
            this.started = true;
            const saved = this.storage?.get<string>('backend.mode');
            void this.connect(saved === 'cuda' ? 'cuda' : 'tbb');
        }
    }

    async select(): Promise<void> {
        if (this.operation || this.disposed) {
            return;
        }
        const mode = await this.ui.select(this.mode);
        if (mode && !this.disposed) {
            await this.connect(mode);
        }
    }


    async connect(mode: BackendMode): Promise<boolean> {
        if (this.operation || this.disposed) {
            return false;
        }
        this.started = true;
        this.failure = undefined;
        const operation = new AbortController();
        this.operation = operation;
        const previousStage = this.stage;
        let connected = false;
        this.refresh();
        try {
            return await this.ui.with_progress(`atlas-engine-backend: ${mode.toUpperCase()}`, operation, async progress => {
                const signal = operation.signal;
                const report = (message: string) => {
                    this.stage = message;
                    progress.report({message});
                    this.refresh();
                };
                if (!await this.setup.prepare(mode, signal, report)) {
                    return false;
                }
                report('Starting and checking the backend');
                await this.replace_connection(mode, signal);
                await this.storage?.update('backend.mode', mode);
                connected = true;
                return true;
            });
        } catch (error) {
            if (!operation.signal.aborted && !this.disposed) {
                this.report_failure(error);
            }
            return false;
        } finally {
            if (!connected) {
                this.stage = previousStage;
            }
            this.operation = undefined;
            this.refresh();
        }
    }


    async verify(): Promise<void> {
        if (this.operation || this.disposed) {
            return;
        }
        if (!this.connection && !await this.connect(this.mode)) {
            return;
        }
        const connection = this.connection;
        if (!connection || this.disposed) {
            return;
        }
        const operation = new AbortController();
        this.operation = operation;
        this.stage = 'Running backend check';
        this.refresh();
        try {
            await this.ui.with_progress('Checking atlas-engine-backend', operation, async () => {
                const result = await connection.info(operation.signal);
                operation.signal.throwIfAborted();
                this.ui.log(`${JSON.stringify(result)}\n`);
                if (!this.disposed) {
                    this.failure = undefined;
                    this.stage = 'Ready · backend check passed';
                    this.ui.show_verified(this.mode);
                }
            });
        } catch (error) {
            if (!operation.signal.aborted && !this.disposed) {
                this.report_failure(error);
            }
        } finally {
            this.operation = undefined;
            this.refresh();
        }
    }

    get_connection(): BackendConnection | undefined {
        return this.connection;
    }

    on_connection(listener: (connection: BackendConnection | undefined, error?: Error) => void): () => void {
        this.connection_listeners.add(listener);
        return () => {
            this.connection_listeners.delete(listener);
        };
    }

    dispose(): void {
        this.disposed = true;
        this.operation?.abort();
        this.stop_listening?.();
        this.connection?.dispose();
        this.connection = undefined;
        this.notify_connection();
        this.connection_listeners.clear();
        this.ui.dispose();
    }

    private async replace_connection(mode: BackendMode, signal: AbortSignal): Promise<void> {
        const next = await this.transport.open(mode, text => this.ui.log(text), signal);
        try {
            const info = await next.info(signal);
            signal.throwIfAborted();
            this.stop_listening?.();
            this.connection?.dispose();
            this.connection = next;
            this.mode = mode;
            this.stage = `Ready · Atlas ${info.version}`;
            this.stop_listening = next.on_exit(error => this.connection_exited(next, error));
            this.notify_connection();
            this.ui.log(`Connected to ${info.engine}, Atlas ${info.version}, protocol ${info.protocol}\n`);
        } catch (error) {
            next.dispose();
            throw error;
        }
    }

    private connection_exited(connection: BackendConnection, error: Error): void {
        if (this.connection !== connection || this.disposed) {
            return;
        }
        this.connection = undefined;
        this.notify_connection(error);
        if (error.name === 'AbortError' && this.operation?.signal.aborted) {
            this.stage = 'Cancelled · select a backend to reconnect';
            this.refresh();
        } else {
            this.report_failure(error);
        }
    }

    private notify_connection(error?: Error): void {
        for (const listener of this.connection_listeners) {
            listener(this.connection, error);
        }
    }

    private report_failure(error: unknown): void {
        this.failure = error_message(error);
        this.ui.log(`${this.failure}\n`);
        this.refresh();
        this.ui.show_failure(this.failure);
    }

    private refresh(): void {
        this.ui.render({
            mode: this.mode,
            stage: this.stage,
            failure: this.failure,
            connected: !!this.connection,
            busy: !!this.operation
        });
    }
}
