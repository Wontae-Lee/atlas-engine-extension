import { randomUUID } from 'node:crypto';
import type * as vscode from 'vscode';
import type { MoleculePreset } from '../../catalog/catalog_types';
import { ViewInput } from '../../detail/view_input';
import type { CaseProject } from '../../project/case_project';
import type { MaterialRecord, ProjectState } from '../../project/project_types';
import type { MoleculeConfig } from '../../streaming/streaming_types';
import { ProjectView } from '../project_view';
import type { FieldDefinition, ViewAction, ViewItem } from '../view_types';

export const MATERIAL_FIELDS: readonly FieldDefinition[] = [
	{ key: 'mass', label: 'Mass', type: 'number', exclusive_min: 0, unit: 'kg / particle' },
	{ key: 'reference_diameter', label: 'Reference diameter', type: 'number', exclusive_min: 0, unit: 'm' },
	{ key: 'reference_temperature', label: 'Reference temperature', type: 'number', exclusive_min: 0, unit: 'K' },
	{ key: 'viscosity_index', label: 'Viscosity index (Bird omega)', type: 'number', min: 0.5, max: 1.5 },
	{ key: 'scattering_parameter', label: 'Scattering parameter (alpha)', type: 'number', min: 1 },
	{ key: 'translational_energy', label: 'Translational energy', type: 'number', min: 0, unit: 'J / particle' },
	{ key: 'rotational_energy', label: 'Rotational energy', type: 'number', min: 0, unit: 'J / particle' },
	{ key: 'vibrational_energy', label: 'Vibrational energy', type: 'number', min: 0, unit: 'J / particle' }
];

export class Materials extends ProjectView {
	constructor(project: CaseProject) {
		super(project, 'materials', 'MATERIALS');
	}

	protected items(state: ProjectState): ViewItem[] {
		return [
			...state.materials.map(material => this.material_row(material, state)),
			this.action_row('Add Material from Catalog', { action: 'add' }, 'add')
		];
	}

	async execute(api: typeof vscode, action: ViewAction): Promise<void> {
		const input = new ViewInput(api, this.project);
		if (action.action === 'add') {
			const preset = await this.select_preset(api);
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
		if (action.action === 'remove') {
			if (await api.window.showWarningMessage('Remove this item from the Atlas case?', { modal: true }, 'Remove') === 'Remove') {
				await this.project.change(state => {
					state.materials = state.materials.filter(item => item.id !== action.id);
				});
			}
			return;
		}
		if (action.action === 'preset') {
			const preset = await this.select_preset(api);
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
		const material = this.project.get_state().materials.find(item => item.id === action.id);
		if (!material) {
			throw new Error('Material no longer exists.');
		}
		if (action.action === 'rename') {
			const name = await input.name(material.name);
			if (name !== undefined) {
				await this.project.change(state => {
					const item = state.materials.find(candidate => candidate.id === action.id);
					if (item) {
						item.name = name.trim();
					}
				});
			}
		} else if (action.action === 'edit') {
			await this.edit_field(api, action, MATERIAL_FIELDS, { ...material.properties }, (state, key, value) => {
				const item = state.materials.find(candidate => candidate.id === action.id);
				if (item) {
					item.properties[key as keyof MoleculeConfig] = value as number;
				}
			});
		}
	}

	private async select_preset(api: typeof vscode): Promise<MoleculePreset | undefined> {
		const model = this.project.get_state().solver.collision_model;
		const sources = this.project.catalog.get_sources();
		const selected = await api.window.showQuickPick(this.project.catalog.list({ collision_model: model }).map(preset => ({
			label: preset.species,
			description: `${preset.name} · ${model.toUpperCase()}`,
			detail: `${sources.find(source => source.id === preset.source_id)?.title}; d = ${preset.reference_diameter} m; omega = ${preset.viscosity_index}; alpha = ${preset.scattering_parameter}; Tref = ${preset.reference_temperature} K`,
			preset
		})), { title: 'Atlas: Select Molecule Preset', matchOnDescription: true, matchOnDetail: true, ignoreFocusOut: true });
		return selected?.preset;
	}

	private material_row(material: MaterialRecord, state: ProjectState): ViewItem {
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
}
