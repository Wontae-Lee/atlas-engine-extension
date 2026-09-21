import type * as vscode from 'vscode';
import type {Backend} from '../backend/backend';
import {Command} from './command';

export class SelectBackend extends Command {
    constructor(private readonly backend: Backend) {
        super('atlas-engine.backend.select', 'Atlas Engine: Select Backend');
    }

    async execute(_api: typeof vscode): Promise<void> {
        await this.backend.select();
    }
}
