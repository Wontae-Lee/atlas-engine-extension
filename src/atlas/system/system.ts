import type * as vscode from 'vscode';
import {type Contributions, createContributions} from '../contributions';
import {error_message} from '../detail/private_helpers';


export class System implements vscode.Disposable {


    private readonly registrations: vscode.Disposable[] = [];

    private disposed = false;
    private layout_started = false;


    constructor(
        private readonly api: typeof vscode,
        private readonly contributions: Contributions = createContributions(),
        private readonly storage?: vscode.Memento,
        private readonly workspace_storage?: vscode.Memento,
        private readonly extension_uri?: vscode.Uri
    ) {
        try {

            this.initialize();
        } catch (error) {

            this.dispose();
            throw error;
        }
    }

    update(): void {

        if (this.disposed) {
            return;
        }
        this.contributions.backend.update();
        this.contributions.layout.update();
        if (!this.layout_started) {
            this.layout_started = true;
            void this.contributions.layout.show(this.api).catch(error => {
                if (!this.disposed) {
                    void this.api.window.showErrorMessage(`Atlas layout: ${error_message(error)}`);
                }
            });
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.contributions.backend.dispose();
        this.contributions.streaming.dispose();
        this.contributions.project.dispose();


        for (const registration of this.registrations.splice(0).reverse()) {
            registration.dispose();
        }
        for (const command of this.contributions.commands) {
            command.dispose();
        }
        this.contributions.layout.dispose();
    }

    private initialize(): void {
        this.contributions.project.initialize(this.api, this.workspace_storage);
        this.contributions.backend.initialize(this.api, this.storage);
        this.contributions.layout.initialize(this.api, this.extension_uri);
        const refresh = () => this.contributions.layout.update();
        const refresh_simulation = () => {
            this.contributions.layout.left.views.find(view => view.id === 'atlas-engine.output')?.update();
            for (const view of this.contributions.layout.right.views) {
                view.update();
            }
            for (const view of this.contributions.layout.center.views) {
                view.update();
            }
        };
        this.registrations.push(
            {dispose: this.contributions.project.on_change(refresh)},
            {dispose: this.contributions.streaming.on_state(refresh_simulation)},
            {dispose: this.contributions.streaming.on_snapshot(refresh_simulation)}
        );
        const watcher = this.api.workspace.createFileSystemWatcher('**/assets/geometry/**');
        const assets_changed = () => this.contributions.project.assets_changed();
        this.registrations.push(watcher, watcher.onDidCreate(assets_changed), watcher.onDidChange(assets_changed), watcher.onDidDelete(assets_changed),
            this.api.workspace.onDidChangeWorkspaceFolders(assets_changed));
        for (const command of this.contributions.commands) {


            this.registrations.push(this.api.commands.registerCommand(command.id, async (...args: unknown[]) => {


                const result = await command.execute(this.api, ...args);
                this.update();

                return result;
            }));
        }
        for (const view of this.contributions.layout.center.views) {

            this.registrations.push(this.api.commands.registerCommand(view.command_id, async () => {
                await view.show(this.api);
                this.update();
            }));
        }
    }
}
