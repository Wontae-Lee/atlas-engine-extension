import { randomUUID } from 'node:crypto';
import type * as vscode from 'vscode';
import type { Streaming } from '../streaming/streaming';
import type { MoleculeConfig } from '../streaming/streaming_types';
import type { CaseProject } from './case_project';
import { DOMAIN_FIELDS, ENTRY_DEFINITIONS, MATERIAL_FIELDS, OUTPUT_FIELDS, SOLVER_FIELDS } from './project_fields';
import { ProjectInput } from './project_input';
import type { EntrySection, FieldValue, ProjectAction, ProjectEntry, ProjectSection } from './project_types';

export class ProjectEditor {
	constructor(private readonly project: CaseProject, private readonly streaming: Streaming) {}

	async execute(api: typeof vscode, action: ProjectAction): Promise<void> {
		const input = new ProjectInput(api, this.project);
		if (['apply', 'start', 'pause', 'step', 'reset'].includes(action.action)) {
			await this.control(api, action.action);
			return;
		}
		if (action.action === 'add') {
			await this.add(api, input, action.section);
			return;
		}
		if (action.section === 'assets') {
			await this.asset_action(api, action);
			return;
		}
		if (action.action === 'remove') {
			if (await api.window.showWarningMessage('Remove this item from the Atlas case?', { modal: true }, 'Remove') !== 'Remove') {
				return;
			}
			await this.project.change(state => {
				if (action.section === 'materials') {
					state.materials = state.materials.filter(item => item.id !== action.id);
				} else if (action.section in ENTRY_DEFINITIONS) {
					const section = action.section as EntrySection;
					state[section] = state[section].filter(item => item.id !== action.id);
				}
			});
			return;
		}
		if (action.section === 'materials' && action.action === 'preset') {
			const preset = await input.preset();
			if (preset) {
				await this.project.change(state => {
					const material = state.materials.find(item => item.id === action.id);
					if (!material) {
						throw new Error('Material no longer exists.');
					}
					const selection = this.project.catalog.create_materials([{ preset_id: preset.id, energy: material.properties }]);
					material.preset_id = preset.id;
					material.collision_model = preset.collision_model;
					material.properties = selection.materials[0];
				});
			}
			return;
		}
		if (action.action === 'rename') {
			const state = this.project.get_state();
			const entries = action.section === 'materials' ? state.materials : state[action.section as EntrySection];
			const entry = entries?.find(item => item.id === action.id);
			if (!entry) {
				throw new Error('Item no longer exists.');
			}
			const name = await input.name(entry.name);
			if (name !== undefined) {
				await this.project.change(candidate => {
					const items = action.section === 'materials' ? candidate.materials : candidate[action.section as EntrySection];
					const item = items.find(value => value.id === action.id);
					if (item) {
						item.name = name.trim();
					}
				});
			}
			return;
		}
		if (action.action === 'edit') {
			await this.edit(input, action);
		}
	}

	private async add(api: typeof vscode, input: ProjectInput, section: ProjectSection): Promise<void> {
		if (section === 'assets') {
			const asset = await this.project.assets.import_asset();
			if (asset) {
				await this.project.change(state => { state.assets.push(asset); });
			}
			return;
		}
		if (section === 'materials') {
			const preset = await input.preset();
			if (!preset) {
				return;
			}
			const name = await input.name(preset.species);
			if (name === undefined) {
				return;
			}
			const material = this.project.catalog.create_materials([{
				preset_id: preset.id, energy: { translational_energy: 0, rotational_energy: 0, vibrational_energy: 0 }
			}]);
			await this.project.change(state => {
				state.materials.push({
					id: randomUUID(), name: name.trim(), preset_id: preset.id,
					collision_model: preset.collision_model, properties: material.materials[0]
				});
			});
			return;
		}
		const definitions = ENTRY_DEFINITIONS[section];
		if (!definitions) {
			return;
		}
		const choice = await api.window.showQuickPick(definitions.map(definition => ({ label: definition.label, definition })),
			{ title: `Atlas: Add ${section}`, ignoreFocusOut: true });
		if (!choice) {
			return;
		}
		const name = await input.name(choice.label);
		if (name === undefined) {
			return;
		}
		const entry: ProjectEntry = { id: randomUUID(), name: name.trim(), kind: choice.definition.kind, fields: {} };
		for (const field of choice.definition.fields) {
			const value = field.default_value === undefined ? await input.field(field) : structuredClone(field.default_value);
			if (value === undefined) {
				return;
			}
			entry.fields[field.key] = value;
		}
		await this.project.change(state => { state[section as EntrySection].push(entry); });
	}

	private async edit(input: ProjectInput, action: ProjectAction): Promise<void> {
		const state = this.project.get_state();
		let fields = action.section === 'domain' ? DOMAIN_FIELDS : action.section === 'solvers' ? SOLVER_FIELDS
			: action.section === 'output' ? OUTPUT_FIELDS : action.section === 'materials' ? MATERIAL_FIELDS : undefined;
		let values: Record<string, FieldValue>;
		if (action.section === 'domain' || action.section === 'solvers' || action.section === 'output') {
			values = state[action.section === 'solvers' ? 'solver' : action.section];
		} else if (action.section === 'materials') {
			const material = state.materials.find(item => item.id === action.id);
			if (!material) {
				throw new Error('Material no longer exists.');
			}
			values = { ...material.properties };
		} else {
			const entry = state[action.section as EntrySection]?.find(item => item.id === action.id);
			if (!entry) {
				throw new Error('Item no longer exists.');
			}
			fields = ENTRY_DEFINITIONS[action.section]?.find(definition => definition.kind === entry.kind)?.fields;
			values = entry.fields;
		}
		const field = fields?.find(candidate => candidate.key === action.field);
		if (!field) {
			throw new Error('This property cannot be edited.');
		}
		const value = await input.field(field, values[field.key]);
		if (value === undefined) {
			return;
		}
		await this.project.change(candidate => {
			if (action.section === 'domain' || action.section === 'solvers' || action.section === 'output') {
				Object.assign(candidate[action.section === 'solvers' ? 'solver' : action.section], { [field.key]: value });
			} else if (action.section === 'materials') {
				const material = candidate.materials.find(item => item.id === action.id);
				if (material) {
					material.properties[field.key as keyof MoleculeConfig] = value as number;
				}
			} else {
				const entry = candidate[action.section as EntrySection].find(item => item.id === action.id);
				if (entry) {
					entry.fields[field.key] = value;
				}
			}
		});
	}

	private async asset_action(api: typeof vscode, action: ProjectAction): Promise<void> {
		const asset = this.project.get_state().assets.find(item => item.id === action.id);
		if (!asset) {
			throw new Error('Asset no longer exists.');
		}
		if (action.action === 'reveal') {
			await this.project.assets.reveal_asset(asset);
		} else if (action.action === 'replace') {
			const replacement = await this.project.assets.replace_asset(asset);
			if (replacement) {
				await this.project.change(state => {
					state.assets = state.assets.map(item => item.id === asset.id ? replacement : item);
				});
			}
		} else if (action.action === 'remove') {
			if (await api.window.showWarningMessage(`Remove ${asset.name} from Assets? The file will remain on disk.`,
				{ modal: true }, 'Remove') === 'Remove') {
				await this.project.change(state => { state.assets = state.assets.filter(item => item.id !== asset.id); });
			}
		}
	}

	private async control(api: typeof vscode, action: string): Promise<void> {
		if (action === 'apply') {
			if (this.streaming.last_snapshot && await api.window.showWarningMessage(
				'Replace the current simulation with this case at step zero?', { modal: true }, 'Apply') !== 'Apply') {
				return;
			}
			const revision = this.project.revision;
			const config = await this.project.to_simulation_config();
			if (this.streaming.state === 'running') {
				await this.streaming.pause();
			}
			await this.streaming.initialize(config);
			this.project.applied_revision = revision;
			return;
		}
		if (action === 'pause') {
			await this.streaming.pause();
			return;
		}
		if (this.project.applied_revision !== this.project.revision || !this.streaming.last_snapshot) {
			throw new Error('Apply the current case to the engine first.');
		}
		if (action === 'start') {
			this.streaming.start();
		} else if (action === 'step') {
			await this.streaming.step();
		} else if (action === 'reset') {
			await this.streaming.pause();
			await this.streaming.reset();
		}
	}
}
