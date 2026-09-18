import type * as vscode from 'vscode';
import type { CaseProject } from '../project/case_project';
import type { AssetRecord, FieldValue, ProjectState } from '../project/project_types';
import { ViewInput } from '../detail/view_input';
import type { FieldDefinition, ProjectSection, ViewAction, ViewItem } from './view_types';
import { View } from './view';

export abstract class ProjectView extends View {
	constructor(
		protected readonly project: CaseProject,
		public readonly section: ProjectSection,
		title: string,
		visibility?: 'visible' | 'collapsed' | 'hidden'
	) {
		super(`atlas-engine.${section}`, title, visibility);
	}

	getChildren(element?: vscode.TreeItem): vscode.ProviderResult<ViewItem[]> {
		return element ? (element as ViewItem).children ?? [] : this.items(this.project.get_state());
	}

	protected abstract items(state: ProjectState): ViewItem[] | Promise<ViewItem[]>;
	abstract execute(api: typeof vscode, action: ViewAction): Promise<void>;

	protected async edit_field(
		api: typeof vscode, action: ViewAction, fields: readonly FieldDefinition[],
		values: Record<string, FieldValue>,
		write: (state: ProjectState, key: string, value: FieldValue) => void
	): Promise<void> {
		const field = fields.find(candidate => candidate.key === action.field);
		if (!field) {
			throw new Error('This property cannot be edited.');
		}
		const value = await new ViewInput(api, this.project).field(field, values[field.key]);
		if (value !== undefined) {
			await this.project.change(state => write(state, field.key, value));
		}
	}

	protected field_rows(
		fields: readonly FieldDefinition[],
		values: Record<string, FieldValue>,
		state: ProjectState,
		id?: string
	): ViewItem[] {
		return fields.map(field => {
			const item = this.action_row(field.label, { action: 'edit', id, field: field.key }, 'edit');
			item.description = this.field_value(field, values[field.key], state);
			item.tooltip = `${field.label}: ${item.description}\nClick to edit.`;
			return item;
		});
	}

	protected field_value(field: FieldDefinition, value: FieldValue | undefined, state: ProjectState): string {
		if (field.type === 'asset' || field.type === 'geometry' || field.type === 'material') {
			const records = field.type === 'asset' ? state.assets : field.type === 'geometry' ? state.geometry : state.materials;
			return records.find(record => record.id === value)?.name ?? (value ? `Missing ${field.type}` : 'Not selected');
		}
		if (field.type === 'choice') {
			return field.choices?.find(choice => choice.value === value)?.label ?? String(value ?? 'Not selected');
		}
		if (value === undefined) {
			return 'Not set';
		}
		const text = typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled')
			: Array.isArray(value) ? value.map(component => Array.isArray(component) ? `[${component.join(', ')}]` : component).join(', ')
				: String(value);
		return field.unit ? `${text} ${field.unit}` : text;
	}

	protected async asset_status(asset: AssetRecord): Promise<string> {
		try {
			return await this.project.assets.status(asset) === 'ready' ? 'Ready' : 'File missing';
		} catch (error) {
			return `Unavailable: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	protected used_by(id: string, state: ProjectState): ViewItem[] {
		const geometry_ids = new Set(state.geometry.filter(entry => entry.fields.asset_id === id).map(entry => entry.id));
		const children: ViewItem[] = [];
		for (const section of ['geometry', 'sources', 'boundaries', 'sinks'] as const) {
			for (const entry of state[section]) {
				if (entry.fields.asset_id === id || entry.fields.geometry_id === id || entry.fields.material_id === id
					|| geometry_ids.has(String(entry.fields.geometry_id))) {
					children.push(this.info_row(`${id}:used:${entry.id}`, entry.name, section.toUpperCase()));
				}
			}
		}
		return children.length ? [this.group(`${id}:used`, 'Used by', children, 'references')]
			: [this.info_row(`${id}:used`, 'Used by', 'No references')];
	}

	protected action_row(
		label: string,
		action: Omit<ViewAction, 'section'>,
		icon: string,
		enabled = true
	): ViewItem {
		return {
			id: `${this.id}:${action.id ?? 'root'}:${action.action}:${action.field ?? ''}`,
			label,
			collapsibleState: this.api.TreeItemCollapsibleState.None,
			iconPath: new this.api.ThemeIcon(icon),
			command: enabled ? {
				command: 'atlas-engine.project.action', title: label,
				arguments: [{ section: this.section, ...action } satisfies ViewAction]
			} : undefined,
			description: enabled ? undefined : 'Unavailable in current state'
		};
	}

	protected info_row(id: string, label: string, description?: string, tooltip?: string): ViewItem {
		return { id: `${this.id}:${id}`, label, description, tooltip, collapsibleState: this.api.TreeItemCollapsibleState.None };
	}

	protected group(id: string, label: string, children: ViewItem[], icon: string): ViewItem {
		return {
			id: `${this.id}:${id}`, label, children,
			collapsibleState: children.length ? this.api.TreeItemCollapsibleState.Collapsed : this.api.TreeItemCollapsibleState.None,
			iconPath: new this.api.ThemeIcon(icon)
		};
	}
}
