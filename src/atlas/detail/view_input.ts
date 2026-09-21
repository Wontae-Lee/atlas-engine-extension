import type * as vscode from 'vscode';
import type {CaseProject} from '../project/case_project';
import type {FieldValue} from '../project/project_types';
import type {FieldDefinition} from '../views/view_types';

export class ViewInput {
    constructor(private readonly api: typeof vscode, private readonly project: CaseProject) {
    }

    async name(value: string): Promise<string | undefined> {
        return this.api.window.showInputBox({
            title: 'Atlas: Name', value, ignoreFocusOut: true,
            validateInput: text => text.trim() ? undefined : 'Enter a name.'
        });
    }

    async field(field: FieldDefinition, current?: FieldValue): Promise<FieldValue | undefined> {
        const title = `Atlas: ${field.label}${field.unit ? ` (${field.unit})` : ''}`;
        if (field.type === 'boolean') {
            return (await this.api.window.showQuickPick([
                {label: 'Enabled', value: true}, {label: 'Disabled', value: false}
            ], {title, ignoreFocusOut: true}))?.value;
        }
        if (field.type === 'choice') {
            return (await this.api.window.showQuickPick([...(field.choices ?? [])], {
                title,
                ignoreFocusOut: true
            }))?.value;
        }
        if (field.type === 'geometry' || field.type === 'material' || field.type === 'asset') {
            const state = this.project.get_state();
            const items = field.type === 'geometry' ? state.geometry : field.type === 'material' ? state.materials : state.assets;
            if (items.length === 0) {
                throw new Error(`Add an item to ${field.type === 'geometry' ? 'GEOMETRY' : field.type === 'material' ? 'MATERIALS' : 'ASSETS'} first.`);
            }
            return (await this.api.window.showQuickPick(items.map(item => ({label: item.name, value: item.id})),
                {title, ignoreFocusOut: true}))?.value;
        }
        const value = await this.api.window.showInputBox({
            title,
            value: current === undefined ? '' : Array.isArray(current) ? current.join(', ') : String(current),
            prompt: field.type === 'vector' ? 'Enter X, Y, Z separated by commas.' : undefined,
            ignoreFocusOut: true,
            validateInput: text => {
                try {
                    this.parse(field, text);
                    return undefined;
                } catch (error) {
                    return error instanceof Error ? error.message : String(error);
                }
            }
        });
        return value === undefined ? undefined : this.parse(field, value);
    }

    private parse(field: FieldDefinition, text: string): FieldValue {
        if (!text.trim()) {
            throw new Error('Enter a value.');
        }
        if (field.type === 'text') {
            return text.trim();
        }
        if (field.type === 'vector') {
            const parts = text.split(',').map(part => part.trim());
            if (parts.length !== 3 || parts.some(part => !part || !Number.isFinite(Number(part)))) {
                throw new Error('Enter three finite numbers separated by commas.');
            }
            return parts.map(Number);
        }
        const value = Number(text);
        if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isSafeInteger(value))) {
            throw new Error(field.type === 'integer' ? 'Enter a finite integer.' : 'Enter a finite number.');
        }
        if (field.min !== undefined && value < field.min) {
            throw new Error(`Minimum: ${field.min}`);
        }
        if (field.max !== undefined && value > field.max) {
            throw new Error(`Maximum: ${field.max}`);
        }
        if (field.exclusive_min !== undefined && value <= field.exclusive_min) {
            throw new Error(`Must be greater than ${field.exclusive_min}.`);
        }
        return value;
    }
}
