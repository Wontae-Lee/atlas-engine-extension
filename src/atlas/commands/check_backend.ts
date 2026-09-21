import type * as vscode from 'vscode';
import type {Backend} from '../backend/backend';
import {Command} from './command';

export class CheckBackend extends Command {
    constructor(private readonly backend: Backend) {
        super('atlas-engine.backend.check', 'Atlas Engine: Check Backend');
    }

    async execute(_api: typeof vscode): Promise<void> {
        await this.backend.verify();
    }
}
