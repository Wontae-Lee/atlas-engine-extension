import type * as vscode from 'vscode';


export abstract class Command implements vscode.Disposable {


    protected constructor(
        public readonly id: string,
        public readonly title: string
    ) {
    }


    abstract execute(api: typeof vscode, ...args: unknown[]): unknown;


    dispose(): void {
    }
}
