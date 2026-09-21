import type * as vscode from 'vscode';
import type {EntrySection, FieldValue} from '../project/project_types';

export type ProjectSection = EntrySection | 'domain' | 'assets' | 'materials' | 'solvers' | 'output';

export interface FieldDefinition {
    key: string;
    label: string;
    type: 'number' | 'integer' | 'vector' | 'boolean' | 'text' | 'choice' | 'asset' | 'geometry' | 'material';
    default_value?: FieldValue;
    min?: number;
    max?: number;
    exclusive_min?: number;
    choices?: readonly { label: string; value: string }[];
    unit?: string;
}

export interface EntryDefinition {
    kind: string;
    label: string;
    fields: readonly FieldDefinition[];
}

export interface ViewAction {
    section: ProjectSection;
    action: 'add' | 'edit' | 'remove' | 'rename' | 'replace' | 'reveal' | 'preset' | 'export';
    id?: string;
    field?: string;
}

export interface ViewItem extends vscode.TreeItem {
    children?: ViewItem[];
}
