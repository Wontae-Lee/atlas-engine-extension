import {randomUUID} from 'node:crypto';
import type * as vscode from 'vscode';
import type {CaseProject} from '../project/case_project';
import type {EntrySection, ProjectEntry, ProjectState} from '../project/project_types';
import {ViewInput} from '../detail/view_input';
import {ProjectView} from './project_view';
import type {EntryDefinition, ViewAction, ViewItem} from './view_types';

export abstract class EntryView extends ProjectView {
    declare readonly section: EntrySection;

    constructor(project: CaseProject, section: EntrySection, title: string) {
        super(project, section, title);
    }

    protected async entry_rows(entries: readonly ProjectEntry[], definitions: readonly EntryDefinition[], state: ProjectState): Promise<ViewItem[]> {
        return Promise.all(entries.map(async entry => {
            const definition = definitions.find(candidate => candidate.kind === entry.kind);
            const warnings: string[] = [];
            for (const field of definition?.fields ?? []) {
                if (field.type !== 'asset' && field.type !== 'geometry' && field.type !== 'material') {
                    continue;
                }
                const records = field.type === 'asset' ? state.assets : field.type === 'geometry' ? state.geometry : state.materials;
                const reference = entry.fields[field.key];
                if (!records.some(record => record.id === reference)) {
                    warnings.push(`${field.label}: ${reference ? 'missing reference' : 'not selected'}`);
                }
                if (field.type === 'asset') {
                    const asset = state.assets.find(candidate => candidate.id === reference);
                    if (asset) {
                        const status = await this.asset_status(asset);
                        if (status !== 'Ready') {
                            warnings.push(status);
                        }
                    }
                }
                if (field.type === 'material') {
                    const material = state.materials.find(candidate => candidate.id === reference);
                    if (material && material.collision_model !== state.solver.collision_model) {
                        warnings.push(`Material uses ${material.collision_model.toUpperCase()}; solver uses ${state.solver.collision_model.toUpperCase()}`);
                    }
                }
            }
            const item = this.group(entry.id, entry.name, [
                ...this.field_rows(definition?.fields ?? [], entry.fields, state, entry.id),
                ...this.used_by(entry.id, state),
                this.action_row('Rename', {action: 'rename', id: entry.id}, 'edit'),
                this.action_row('Remove', {action: 'remove', id: entry.id}, 'trash')
            ], warnings.length ? 'warning' : 'symbol-object');
            item.description = warnings.length ? warnings.join('; ') : definition?.label ?? entry.kind;
            item.tooltip = `${entry.name}\n${definition?.label ?? entry.kind}${warnings.length ? `\n${warnings.join('\n')}` : ''}`;
            return item;
        }));
    }

    protected async edit_entries(api: typeof vscode, action: ViewAction, definitions: readonly EntryDefinition[]): Promise<void> {
        const input = new ViewInput(api, this.project);
        if (action.action === 'add') {
            const choice = await api.window.showQuickPick(definitions.map(definition => ({
                    label: definition.label,
                    definition
                })),
                {title: `Atlas: Add ${this.title}`, ignoreFocusOut: true});
            if (!choice) {
                return;
            }
            const name = await input.name(choice.label);
            if (name === undefined) {
                return;
            }
            const entry: ProjectEntry = {id: randomUUID(), name: name.trim(), kind: choice.definition.kind, fields: {}};
            for (const field of choice.definition.fields) {
                const value = field.default_value === undefined ? await input.field(field) : structuredClone(field.default_value);
                if (value === undefined) {
                    return;
                }
                entry.fields[field.key] = value;
            }
            await this.project.change(state => {
                state[this.section].push(entry);
            });
            return;
        }
        const entry = this.project.get_state()[this.section].find(candidate => candidate.id === action.id);
        if (!entry) {
            throw new Error('Item no longer exists.');
        }
        if (action.action === 'remove') {
            if (await api.window.showWarningMessage('Remove this item from the Atlas case?', {modal: true}, 'Remove') === 'Remove') {
                await this.project.change(state => {
                    state[this.section] = state[this.section].filter(item => item.id !== entry.id);
                });
            }
        } else if (action.action === 'rename') {
            const name = await input.name(entry.name);
            if (name !== undefined) {
                await this.project.change(state => {
                    const current = state[this.section].find(item => item.id === entry.id);
                    if (!current) {
                        throw new Error('Item no longer exists.');
                    }
                    current.name = name.trim();
                });
            }
        } else if (action.action === 'edit') {
            const fields = definitions.find(definition => definition.kind === entry.kind)?.fields ?? [];
            await this.edit_field(api, action, fields, entry.fields, (state, key, value) => {
                const current = state[this.section].find(item => item.id === entry.id);
                if (!current) {
                    throw new Error('Item no longer exists.');
                }
                current.fields[key] = value;
            });
        } else {
            throw new Error(`Unsupported ${this.title} action: ${action.action}`);
        }
    }
}
