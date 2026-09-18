import type * as vscode from 'vscode';
import type { CaseProject } from '../project/case_project';
import {
	DOMAIN_FIELDS, ENTRY_DEFINITIONS, MATERIAL_FIELDS, OUTPUT_FIELDS, SOLVER_FIELDS
} from '../project/project_fields';
import type {
	AssetRecord, EntrySection, FieldDefinition, FieldValue, MaterialRecord,
	ProjectAction, ProjectEntry, ProjectSection, ProjectState
} from '../project/project_types';
import type { Streaming } from '../streaming/streaming';
import { View } from './view';

interface ProjectTreeItem extends vscode.TreeItem {
	children?: ProjectTreeItem[];
}

export class ProjectView extends View {
	constructor(
		private readonly project: CaseProject,
		private readonly streaming: Streaming,
		private readonly section: ProjectSection,
		title: string
	) {
		super(`atlas-engine.${section}`, title, section === 'domain' ? 'collapsed' : undefined);
	}

	async getChildren(element?: vscode.TreeItem): Promise<ProjectTreeItem[]> {
		if (element) {
			return (element as ProjectTreeItem).children ?? [];
		}
		const state = this.project.get_state();
		switch (this.section) {
			case 'domain':
				return this.field_rows(DOMAIN_FIELDS, state.domain, state);
			case 'assets':
				return [
					this.group('meshes', 'Meshes', await Promise.all(state.assets.map(asset => this.asset_row(asset, state))), 'files'),
					this.action_row('Import Mesh Asset', { action: 'add' }, 'add')
				];
			case 'materials':
				return [
					...state.materials.map(material => this.material_row(material, state)),
					this.action_row('Add Material from Catalog', { action: 'add' }, 'add')
				];
			case 'solvers':
				return this.solver_rows(state);
			case 'output':
				return [
					...this.field_rows(OUTPUT_FIELDS, state.output, state),
					this.info_row('storage', 'CSV files stay in the backend container', undefined,
						'Files are removed when the backend container is closed.')
				];
			default:
				return [
					...await Promise.all(state[this.section].map(entry => this.entry_row(entry, state))),
					this.action_row(`Add ${this.section_label()}`, { action: 'add' }, 'add')
				];
		}
	}

	private field_rows(
		fields: readonly FieldDefinition[],
		values: Record<string, FieldValue>,
		state: ProjectState,
		id?: string
	): ProjectTreeItem[] {
		return fields.map(field => {
			const item = this.action_row(field.label, { action: 'edit', id, field: field.key }, 'edit');
			item.description = this.field_value(field, values[field.key], state);
			item.tooltip = `${field.label}: ${item.description}\nClick to edit.`;
			return item;
		});
	}

	private field_value(field: FieldDefinition, value: FieldValue | undefined, state: ProjectState): string {
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

	private async entry_row(entry: ProjectEntry, state: ProjectState): Promise<ProjectTreeItem> {
		const definition = ENTRY_DEFINITIONS[this.section]?.find(candidate => candidate.kind === entry.kind);
		const warnings: string[] = [];
		for (const field of definition?.fields ?? []) {
			if (field.type === 'asset' || field.type === 'geometry' || field.type === 'material') {
				const records = field.type === 'asset' ? state.assets : field.type === 'geometry' ? state.geometry : state.materials;
				const reference = entry.fields[field.key];
				if (!records.some(record => record.id === reference)) {
					warnings.push(`${field.label}: ${reference ? 'missing reference' : 'not selected'}`);
				}
			}
		}
		if (entry.kind === 'triangle_mesh') {
			const asset = state.assets.find(candidate => candidate.id === entry.fields.asset_id);
			if (asset) {
				const status = await this.asset_status(asset);
				if (status !== 'Ready') {
					warnings.push(status);
				}
			}
		}
		const material = state.materials.find(candidate => candidate.id === entry.fields.material_id);
		if (material && material.collision_model !== state.solver.collision_model) {
			warnings.push(`Material uses ${material.collision_model.toUpperCase()}; solver uses ${state.solver.collision_model.toUpperCase()}`);
		}
		const children = [
			...this.field_rows(definition?.fields ?? [], entry.fields, state, entry.id),
			...this.used_by(entry.id, state),
			this.action_row('Rename', { action: 'rename', id: entry.id }, 'edit'),
			this.action_row('Remove', { action: 'remove', id: entry.id }, 'trash')
		];
		const item = this.group(entry.id, entry.name, children, warnings.length ? 'warning' : 'symbol-object');
		item.description = warnings.length ? warnings.join('; ') : definition?.label ?? entry.kind;
		item.tooltip = `${entry.name}\n${definition?.label ?? entry.kind}${warnings.length ? `\n${warnings.join('\n')}` : ''}`;
		return item;
	}

	private material_row(material: MaterialRecord, state: ProjectState): ProjectTreeItem {
		const preset = this.project.catalog.list().find(candidate => candidate.id === material.preset_id);
		const source = this.project.catalog.get_sources().find(candidate => candidate.id === preset?.source_id);
		const mismatch = material.collision_model !== state.solver.collision_model;
		const customized = preset && (['mass', 'reference_diameter', 'reference_temperature', 'viscosity_index', 'scattering_parameter'] as const)
			.some(key => material.properties[key] !== preset[key]);
		const children = [
			this.info_row(`${material.id}:model`, 'Collision model', material.collision_model.toUpperCase()),
			this.info_row(`${material.id}:preset`, 'Reference preset', preset
				? `${preset.species} · ${preset.id}${customized ? ' (customized)' : ''}` : 'Preset no longer available'),
			this.info_row(`${material.id}:source`, 'Reference', source?.title ?? 'Unknown', source?.urls.join('\n')),
			this.info_row(`${material.id}:range`, 'Reference preset temperature range',
				preset?.temperature_range_k ? `${preset.temperature_range_k.join(' – ')} K` : 'Not specified by the source',
				'Applies to the original catalog parameters. Customized coefficients require their own validation.'),
			...this.field_rows(MATERIAL_FIELDS, { ...material.properties }, state, material.id),
			...this.used_by(material.id, state),
			this.action_row('Choose Catalog Preset', { action: 'preset', id: material.id }, 'library'),
			this.action_row('Rename', { action: 'rename', id: material.id }, 'edit'),
			this.action_row('Remove', { action: 'remove', id: material.id }, 'trash')
		];
		const item = this.group(material.id, material.name, children, mismatch ? 'warning' : 'symbol-variable');
		item.description = mismatch
			? `${material.collision_model.toUpperCase()} — solver requires ${state.solver.collision_model.toUpperCase()}`
			: `${material.collision_model.toUpperCase()}${customized ? ' · Customized' : ''}`;
		item.tooltip = mismatch ? 'Choose a preset matching the solver collision model before applying.'
			: customized ? 'Material coefficients differ from the reference preset.'
				: 'Catalog properties are copied into this material and can be edited independently.';
		return item;
	}

	private async asset_row(asset: AssetRecord, state: ProjectState): Promise<ProjectTreeItem> {
		const status = await this.asset_status(asset);
		const children = [
			this.info_row(`${asset.id}:path`, 'Project path', asset.path),
			this.info_row(`${asset.id}:type`, 'Type', 'Wavefront OBJ'),
			this.info_row(`${asset.id}:status`, 'Status', status),
			...this.used_by(asset.id, state),
			this.action_row('Replace File', { action: 'replace', id: asset.id }, 'replace-all'),
			this.action_row('Reveal in Explorer', { action: 'reveal', id: asset.id }, 'go-to-file'),
			this.action_row('Remove Asset', { action: 'remove', id: asset.id }, 'trash')
		];
		const item = this.group(asset.id, asset.name, children, status === 'Ready' ? 'file-media' : 'warning');
		item.description = status === 'Ready' ? asset.path : status;
		item.tooltip = `${asset.path}\n${status}`;
		return item;
	}

	private async asset_status(asset: AssetRecord): Promise<string> {
		try {
			return await this.project.assets.status(asset) === 'ready' ? 'Ready' : 'File missing';
		} catch (error) {
			return `Unavailable: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	private used_by(id: string, state: ProjectState): ProjectTreeItem[] {
		const geometry_ids = new Set(state.geometry.filter(entry => entry.fields.asset_id === id).map(entry => entry.id));
		const children: ProjectTreeItem[] = [];
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

	private solver_rows(state: ProjectState): ProjectTreeItem[] {
		const stream_state = this.streaming.state;
		const applied = this.project.applied_revision === this.project.revision && this.streaming.last_snapshot !== undefined;
		const idle = stream_state === 'ready' || stream_state === 'paused';
		const rows = [
			this.info_row('solver', 'Solver', 'DSMC'),
			...this.field_rows(SOLVER_FIELDS, state.solver, state),
			this.info_row('state', 'Engine state', stream_state),
			this.info_row('revision', 'Project settings', applied ? 'Applied to engine' : 'Not applied to engine'),
			this.action_row('Apply to Engine', { action: 'apply' }, 'cloud-upload', stream_state !== 'running'),
			this.action_row('Start', { action: 'start' }, 'play', idle && applied),
			this.action_row('Pause', { action: 'pause' }, 'debug-pause', stream_state === 'running'),
			this.action_row('Step', { action: 'step' }, 'debug-step-over', idle && applied),
			this.action_row('Reset', { action: 'reset' }, 'debug-restart', idle && applied)
		];
		const snapshot = this.streaming.last_snapshot;
		if (snapshot) {
			rows.push(this.info_row('step', 'Current step', String(snapshot.step)),
				this.info_row('time', 'Simulation time', `${snapshot.time} s`),
				this.info_row('particles', 'Particles', String(snapshot.particle_count)));
		}
		if (this.streaming.last_error) {
			rows.push(this.info_row('error', 'Engine error', this.streaming.last_error.message));
		}
		return rows;
	}

	private section_label(): string {
		const labels: Record<EntrySection, string> = {
			geometry: 'Geometry', sources: 'Source', boundaries: 'Boundary', sinks: 'Sink'
		};
		return labels[this.section as EntrySection];
	}

	private action_row(
		label: string,
		action: Omit<ProjectAction, 'section'>,
		icon: string,
		enabled = true
	): ProjectTreeItem {
		return {
			id: `${this.id}:${action.id ?? 'root'}:${action.action}:${action.field ?? ''}`,
			label,
			collapsibleState: this.api.TreeItemCollapsibleState.None,
			iconPath: new this.api.ThemeIcon(icon),
			command: enabled ? {
				command: 'atlas-engine.project.action', title: label,
				arguments: [{ section: this.section, ...action } satisfies ProjectAction]
			} : undefined,
			description: enabled ? undefined : 'Unavailable in current state'
		};
	}

	private info_row(id: string, label: string, description?: string, tooltip?: string): ProjectTreeItem {
		return { id: `${this.id}:${id}`, label, description, tooltip, collapsibleState: this.api.TreeItemCollapsibleState.None };
	}

	private group(id: string, label: string, children: ProjectTreeItem[], icon: string): ProjectTreeItem {
		return {
			id: `${this.id}:${id}`, label, children,
			collapsibleState: children.length ? this.api.TreeItemCollapsibleState.Collapsed : this.api.TreeItemCollapsibleState.None,
			iconPath: new this.api.ThemeIcon(icon)
		};
	}
}
