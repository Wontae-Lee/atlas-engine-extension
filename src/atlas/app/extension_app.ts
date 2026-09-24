import * as vscode from 'vscode';
import {readFile, unlink} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';
import {BackendManager} from '../backend/backend_manager';
import {DockerRuntime} from '../backend/docker_runtime';
import type {BackendMode, EngineProcess} from '../backend/backend_types';
import {AtlasClient} from '../engine/atlas_client';
import {JsonlChannel} from '../engine/jsonl_channel';
import {Project} from '../project/project';
import {ConfigSerializer} from '../project/config_serializer';
import {ProjectPaths} from '../project/project_paths';
import {ProjectStore} from '../project/project_store';
import type {ProjectState} from '../project/project_types';
import {parse_obj} from '../project/assets/obj_parser';
import type {ActiveSession} from './active_session';
import {EngineLog} from '../ui/log/engine_log';
import {StatusBar} from '../ui/status/status_bar';
import {SimulationTree} from '../ui/simulation_tree/simulation_tree';
import {ParameterEditor} from '../ui/simulation_tree/parameter_editor';
import type {TreeNode} from '../ui/simulation_tree/tree_nodes';
import {SimulationView} from '../ui/simulation_view/simulation_view';
import {make_view_model} from '../ui/simulation_view/simulation_view_model';
import type {SimulationAction} from '../ui/simulation_view/messages';

export class ExtensionApp implements vscode.Disposable {
    private readonly log = new EngineLog(vscode);
    private readonly status_bar = new StatusBar(vscode);
    private readonly backend = new BackendManager(new DockerRuntime(), message => this.log.append(message));
    private readonly tree = new SimulationTree(vscode, () => this.project?.get_state());
    private readonly editor = new ParameterEditor(vscode, (path, edit) => this.edit_project(path, edit));
    private readonly view: SimulationView;
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly stop_backend: () => void;
    private project?: Project;
    private store?: ProjectStore;
    private serializer?: ConfigSerializer;
    private client?: AtlasClient;
    private channel?: JsonlChannel;
    private process?: EngineProcess;
    private prepared?: {process: EngineProcess; channel: JsonlChannel; client: AtlasClient};
    private active?: ActiveSession;
    private editing: Promise<void> = Promise.resolve();
    private polling?: NodeJS.Timeout;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.view = new SimulationView(vscode, context.extensionUri,
            action => this.execute(action).catch(error => this.report(error)));
        this.stop_backend = this.backend.on_change((process, error) => this.backend_changed(process, error));
        this.register_commands();
        this.refresh();
    }

    async initialize(): Promise<void> {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
            return;
        }
        try {
            await readFile(join(root, 'atlas.project.json'));
            await this.open_project(root);
            await this.connect_backend(this.saved_mode());
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.report(error);
            }
        }
    }

    async create_project(root?: string): Promise<void> {
        const target = root ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!target) {
            throw new Error('Open a workspace folder first.');
        }
        const paths = new ProjectPaths(target);
        try {
            await readFile(paths.project_file);
            throw new Error('An Atlas project already exists in this folder. Open it instead.');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
        const store = new ProjectStore(paths);
        const state = await store.create();
        this.install_project(store, state);
        this.view.open();
        await this.connect_backend(this.saved_mode());
    }

    async open_project(root: string): Promise<void> {
        const store = new ProjectStore(new ProjectPaths(root));
        const state = await store.load();
        this.install_project(store, state);
        this.view.open();
    }

    async connect_backend(mode: BackendMode): Promise<void> {
        const paths = this.require_store().paths;
        const previous = this.active;
        const old_client = this.client;
        const connected = await this.backend.connect(mode, paths.root, async report => {
            const result = await vscode.window.showWarningMessage(
                `Download the Atlas CUDA image?\n${report}`, {modal: true}, 'Download CUDA');
            return result === 'Download CUDA';
        }, async process => {
            const channel = new JsonlChannel(process.child.stdout, process.child.stdin,
                failure => {
                    this.log.append(`${failure.message}\n`);
                    process.dispose();
                });
            const client = new AtlasClient(channel);
            try {
                const config = await this.require_serializer().serialize_simulation(this.require_project().get_state());
                await client.validate('simulation', config);
                this.prepared = {process, channel, client};
            } catch (error) {
                channel.dispose();
                throw error;
            }
        }, async () => {
            if (previous && old_client) {
                await old_client.close(previous.id).catch(error => this.log.append(`${error}\n`));
            }
        });
        if (!connected) {
            if (this.backend.error) {
                throw this.backend.error;
            }
            return;
        }
        await this.context.globalState.update('atlas.backend.mode', mode);
        this.log.append('Simulation configuration validated by Atlas Interactive.\n');
    }

    async edit_project(path: (string | number)[], edit: (candidate: ProjectState) => void): Promise<void> {
        const operation = this.editing.then(async () => {
            const project = this.require_project();
            const serializer = this.require_serializer();
            const candidate = project.get_state();
            edit(candidate);
            const config = await serializer.serialize_simulation(candidate);
            if (path[0] === 'output') {
                if (!candidate.output.csv_filename || candidate.output.csv_filename !==
                    basename(candidate.output.csv_filename)) {
                    throw new Error('CSV filename must be a file name inside output/.');
                }
            } else if (path[0] === 'geometries') {
                for (let index = 0; index < candidate.geometries.length; index++) {
                    const geometry = await serializer.serialize_target(candidate, ['geometries', index]);
                    await this.require_client().validate('geometry', geometry.config);
                }
                await this.require_client().validate('simulation', config);
            } else {
                const target = await serializer.serialize_target(candidate, path);
                await this.require_client().validate(target.target, target.config);
            }
            await this.require_store().save(candidate, config);
            project.commit(candidate);
            this.refresh();
        });
        this.editing = operation.catch(() => {});
        return operation;
    }

    async validate_simulation(): Promise<void> {
        const config = await this.require_serializer().serialize_simulation(this.require_project().get_state());
        await this.require_client().validate('simulation', config);
        this.log.append('Simulation configuration validated by Atlas Interactive.\n');
    }

    async apply(): Promise<void> {
        const project = this.require_project();
        const state = project.get_state();
        const config = await this.require_serializer().serialize_simulation(state);
        await this.require_client().validate('simulation', config);
        await this.require_store().save(state, config);
        const id = await this.require_client().create(config, {
            csv_enabled: state.output.csv_enabled,
            output_directory: 'output',
            csv_filename: state.output.csv_filename
        });
        const previous = this.active;
        this.active = {id, applied_revision: project.revision};
        if (previous) {
            await this.require_client().close(previous.id).catch(error => this.log.append(`${error}\n`));
        }
        await this.update_session();
    }

    async start(): Promise<void> {
        const active = this.require_active(true);
        await this.require_client().start(active.id);
        await this.update_session();
        this.start_polling();
    }

    async pause(): Promise<void> {
        this.stop_polling();
        await this.require_client().pause(this.require_active().id);
        await this.update_session();
    }

    async step(): Promise<void> {
        const active = this.require_active(true);
        active.status = await this.require_client().step(active.id);
        this.refresh();
    }

    async restart(): Promise<void> {
        this.stop_polling();
        await this.require_client().restart(this.require_active().id);
        await this.update_session();
    }

    async save_state(): Promise<void> {
        await this.require_client().save(this.require_active().id, 'state');
        this.log.append('Atlas saved state under state/.\n');
    }

    async open_renderer(): Promise<void> { await this.require_client().open_renderer(this.require_active().id); }
    async close_renderer(): Promise<void> { await this.require_client().close_renderer(this.require_active().id); }

    async update_session(): Promise<void> {
        const active = this.require_active();
        active.status = await this.require_client().status(active.id);
        if (active.status.state !== 'running') {
            this.stop_polling();
        }
        this.refresh();
    }

    async import_obj(uri: vscode.Uri): Promise<void> {
        const source = uri.fsPath;
        parse_obj(await readFile(source, 'utf8'));
        const asset = await this.require_store().import_obj(source);
        try {
            await this.edit_project(['geometries'], candidate => {
                candidate.assets.push(asset);
                candidate.geometries.push({id: asset.id, name: asset.name,
                    geometry: {type: 'triangle_mesh', asset_id: asset.id}});
            });
        } catch (error) {
            await unlink(this.require_store().paths.resolve_asset(asset.path)).catch(() => {});
            throw error;
        }
    }

    dispose(): void {
        this.stop_polling();
        this.stop_backend();
        this.channel?.dispose();
        this.backend.dispose();
        this.view.dispose();
        this.tree.dispose();
        this.status_bar.dispose();
        this.log.dispose();
        for (const item of this.subscriptions) {
            item.dispose();
        }
    }

    private install_project(store: ProjectStore, state: ProjectState): void {
        if (this.store?.paths.root !== store.paths.root) {
            this.backend.disconnect();
        }
        this.stop_polling();
        this.active = undefined;
        this.store = store;
        this.serializer = new ConfigSerializer(store.paths);
        this.project = new Project(state);
        this.refresh();
    }

    private backend_changed(process?: EngineProcess, error?: Error): void {
        if (this.process === process) {
            this.refresh();
            return;
        }
        this.channel?.dispose();
        this.process = process;
        this.client = undefined;
        this.active = undefined;
        this.stop_polling();
        if (process) {
            if (this.prepared?.process === process) {
                this.channel = this.prepared.channel;
                this.client = this.prepared.client;
                this.prepared = undefined;
            } else {
                const channel = new JsonlChannel(process.child.stdout, process.child.stdin, failure => {
                    this.log.append(`${failure.message}\n`);
                    process.dispose();
                });
                this.channel = channel;
                this.client = new AtlasClient(channel);
            }
        }
        if (error) {
            this.log.append(`${error.message}\n`);
        }
        this.refresh();
    }

    private start_polling(): void {
        this.stop_polling();
        this.polling = setInterval(() => void this.update_session().catch(error => {
            this.stop_polling(); this.report(error);
        }), 1000);
    }

    private stop_polling(): void {
        if (this.polling) {
            clearInterval(this.polling);
        }
        this.polling = undefined;
    }

    private refresh(): void {
        this.tree.refresh();
        this.status_bar.update(this.backend.mode, this.backend.state, this.active);
        const project = this.project;
        this.view.update(project ? make_view_model(project.get_state(), project.revision, this.active && {
            state: this.active.status?.state ?? 'ready', step: this.active.status?.step ?? 0,
            stale: this.active.applied_revision !== project.revision
        }) : undefined);
    }

    private saved_mode(): BackendMode {
        return this.context.globalState.get('atlas.backend.mode') === 'cuda' ? 'cuda' : 'tbb';
    }

    private require_project(): Project {
        if (!this.project) {
            throw new Error('Open or create an Atlas project first.');
        }
        return this.project;
    }
    private require_store(): ProjectStore {
        if (!this.store) {
            throw new Error('Open or create an Atlas project first.');
        }
        return this.store;
    }
    private require_serializer(): ConfigSerializer {
        if (!this.serializer) {
            throw new Error('Open or create an Atlas project first.');
        }
        return this.serializer;
    }
    private require_client(): AtlasClient {
        if (!this.client) {
            throw new Error('Connect an Atlas backend first.');
        }
        return this.client;
    }
    private require_active(current = false): ActiveSession {
        if (!this.active) {
            throw new Error('Apply the simulation first.');
        }
        if (current && this.active.applied_revision !== this.require_project().revision) {
            throw new Error('Project settings changed. Apply the simulation first.');
        }
        return this.active;
    }

    private async execute(action: SimulationAction): Promise<void> {
        switch (action) {
            case 'apply': return this.apply();
            case 'start': return this.start();
            case 'pause': return this.pause();
            case 'step': return this.step();
            case 'restart': return this.restart();
            case 'save': return this.save_state();
            case 'render_open': return this.open_renderer();
            case 'render_close': return this.close_renderer();
            case 'status': return this.update_session();
        }
    }

    private register_commands(): void {
        const register = (id: string, action: (...args: any[]) => Promise<void> | void) => {
            this.subscriptions.push(vscode.commands.registerCommand(id, (...args) => {
                void Promise.resolve().then(() => action(...args)).catch(error => this.report(error));
            }));
        };
        register('atlas-engine.project.create', () => this.create_project());
        register('atlas-engine.project.open', async (uri?: vscode.Uri) => {
            const selected = uri ?? (await vscode.window.showOpenDialog({canSelectMany: false,
                filters: {'Atlas project': ['json']}}))?.[0];
            if (selected) {
                await this.open_project(dirname(selected.fsPath));
                await this.connect_backend(this.saved_mode());
            }
        });
        register('atlas-engine.backend.select', async () => {
            const selection = await vscode.window.showQuickPick(['TBB', 'CUDA']);
            if (selection) {
                await this.connect_backend(selection.toLowerCase() as BackendMode);
            }
        });
        register('atlas-engine.backend.check', () => this.validate_simulation());
        register('atlas-engine.scene.open', () => this.view.open());
        register('atlas-engine.layout.show', () => this.view.open());
        register('atlas-engine.simulation.validate', () => this.validate_simulation());
        register('atlas-engine.simulation.apply', () => this.apply());
        register('atlas-engine.parameter.edit', (node: TreeNode) => this.editor.edit(node));
        register('atlas-engine.parameter.add', (node: TreeNode) => this.editor.add(node));
        register('atlas-engine.parameter.remove', (node: TreeNode) => this.editor.remove(node));
        register('atlas-engine.asset.import', async (uri?: vscode.Uri) => {
            const selected = uri ?? (await vscode.window.showOpenDialog({canSelectMany: false,
                filters: {'Wavefront OBJ': ['obj']}}))?.[0];
            if (selected) {
                await this.import_obj(selected);
            }
        });
        register('atlas-engine.log.show', () => this.log.show());
    }

    private report(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        this.log.append(`${message}\n`);
        void vscode.window.showErrorMessage(`Atlas Engine: ${message}`);
    }
}
