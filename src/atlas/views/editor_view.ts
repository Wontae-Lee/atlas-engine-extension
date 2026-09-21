import type * as vscode from 'vscode';

export abstract class EditorView implements vscode.Disposable {
    protected api!: typeof vscode;
    protected resource_root!: vscode.Uri;
    private panel?: vscode.WebviewPanel;
    private readonly registrations: vscode.Disposable[] = [];
    private ready = false;
    private sending = false;
    private revision = 0;
    private pending = false;

    protected constructor(public readonly id: string, public readonly title: string) {
    }

    get command_id(): string {
        return `${this.id}.open`;
    }

    initialize(api: typeof vscode, extension_uri?: vscode.Uri): void {
        this.api = api;
        if (extension_uri) {
            this.resource_root = api.Uri.joinPath(extension_uri, 'dist', 'webview');
        }
    }

    async show(api: typeof vscode): Promise<void> {
        if (this.panel) {
            this.panel.reveal(api.ViewColumn.One);
            this.update();
            return;
        }
        if (!this.resource_root) {
            throw new Error('The extension resource location is required to open this view.');
        }
        const panel = api.window.createWebviewPanel(this.id, this.title, api.ViewColumn.One, {
            enableScripts: true, localResourceRoots: [this.resource_root]
        });
        this.panel = panel;
        this.ready = false;
        this.registrations.push(
            panel.onDidDispose(() => this.release()),
            panel.onDidChangeViewState(() => {
                if (panel.visible) {
                    this.update();
                }
            }),
            panel.webview.onDidReceiveMessage((message: unknown) => {
                if (typeof message !== 'object' || message === null) {
                    return;
                }
                if ('type' in message && message.type === 'ready') {
                    this.ready = true;
                    this.client_ready();
                    this.update();
                } else {
                    void this.handle_message(message).catch(error => {
                        if (this.panel === panel) {
                            void panel.webview.postMessage({
                                type: 'error',
                                message: error instanceof Error ? error.message : String(error)
                            });
                        }
                    });
                }
            })
        );
        panel.webview.html = this.render(panel.webview);
    }

    update(): void {
        this.revision++;
        this.pending = true;
        if (!this.sending && this.ready && this.panel?.visible) {
            void this.publish(this.panel);
        }
    }

    dispose(): void {
        const panel = this.panel;
        this.release();
        panel?.dispose();
    }

    protected abstract render(webview: vscode.Webview): string;

    protected abstract data(): unknown | Promise<unknown>;

    protected client_ready(): void {
    }

    protected async handle_message(_message: unknown): Promise<void> {
    }

    private async publish(panel: vscode.WebviewPanel): Promise<void> {
        this.sending = true;
        try {
            while (this.panel === panel && this.ready && panel.visible && this.pending) {
                this.pending = false;
                const revision = this.revision;
                const data = await this.data();
                if (this.panel === panel && panel.visible && revision === this.revision) {
                    await panel.webview.postMessage(data);
                }
            }
        } catch (error) {
            if (this.panel === panel) {
                await panel.webview.postMessage({
                    type: 'error',
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        } finally {
            this.sending = false;
            if (this.pending && this.panel?.visible && this.ready) {
                this.update();
            }
        }
    }

    private release(): void {
        this.panel = undefined;
        this.ready = false;
        this.pending = false;
        for (const registration of this.registrations.splice(0)) {
            registration.dispose();
        }
    }
}
