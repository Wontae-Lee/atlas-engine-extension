import type * as vscode from 'vscode';


export abstract class View implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {


    protected api!: typeof vscode;


    private changes?: vscode.EventEmitter<vscode.TreeItem | undefined | void>;

    private registration?: vscode.Disposable;


    protected constructor(
        public readonly id: string,
        public readonly title: string,
        public readonly visibility?: 'visible' | 'collapsed' | 'hidden'
    ) {
    }


    get onDidChangeTreeData(): vscode.Event<vscode.TreeItem | undefined | void> | undefined {

        return this.changes?.event;
    }


    initialize(api: typeof vscode): void {
        this.api = api;
        this.changes = new api.EventEmitter<vscode.TreeItem | undefined | void>();

        this.registration = api.window.registerTreeDataProvider(this.id, this);
    }


    getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
        return item;
    }


    getChildren(_element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        return [];
    }


    update(): void {
        this.changes?.fire();
    }


    dispose(): void {
        this.registration?.dispose();
        this.registration = undefined;
        this.changes?.dispose();
        this.changes = undefined;
    }
}
