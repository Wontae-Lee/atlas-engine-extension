import piclas from './data/piclas_vhs.json';
import sparta from './data/sparta.json';
import weaver from './data/weaver_vss.json';
import sources from './data/sources.json';
import metadata from './data/metadata.json';
import type { CatalogMaterials, CatalogQuery, CatalogSource, MaterialSelection, MoleculePreset } from './catalog_types';

export class MoleculeCatalog {
	private readonly presets: MoleculePreset[];

	constructor() {
		this.presets = [...piclas, ...sparta, ...weaver].map<MoleculePreset>(preset => {
			if (preset.collision_model !== 'vhs' && preset.collision_model !== 'vss') {
				throw new Error(`Unknown collision model in catalog preset: ${preset.id}`);
			}
			return { ...preset, collision_model: preset.collision_model };
		});
	}

	get_metadata(): typeof metadata {
		return structuredClone(metadata);
	}

	get_sources(): CatalogSource[] {
		return structuredClone(sources);
	}

	list(query: CatalogQuery = {}): MoleculePreset[] {
		const text = query.text?.trim().toLowerCase();
		return structuredClone(this.presets.filter(preset =>
			(!query.species || preset.species === query.species) &&
			(!query.collision_model || preset.collision_model === query.collision_model) &&
			(!text || `${preset.species} ${preset.name} ${preset.id}`.toLowerCase().includes(text))
		));
	}

	get_preset(preset_id: string): MoleculePreset {
		const preset = this.presets.find(candidate => candidate.id === preset_id);
		if (!preset) {
			throw new Error(`Unknown molecule preset: ${preset_id}`);
		}
		return structuredClone(preset);
	}

	create_materials(selections: readonly MaterialSelection[]): CatalogMaterials {
		if (selections.length === 0) {
			throw new Error('Select at least one molecule preset.');
		}
		const presets = selections.map(selection => this.get_preset(selection.preset_id));
		const collision_model = presets[0].collision_model;
		if (presets.some(preset => preset.collision_model !== collision_model)) {
			throw new Error('An Atlas solver requires the same collision model for every material.');
		}
		const materials = presets.map((preset, index) => {
			const { translational_energy, rotational_energy, vibrational_energy } = selections[index].energy;
			if (![translational_energy, rotational_energy, vibrational_energy]
				.every(value => Number.isFinite(value) && value >= 0)) {
				throw new Error('Molecular energies must be finite nonnegative joules per particle.');
			}
			return {
				mass: preset.mass,
				reference_diameter: preset.reference_diameter,
				reference_temperature: preset.reference_temperature,
				viscosity_index: preset.viscosity_index,
				scattering_parameter: preset.scattering_parameter,
				translational_energy, rotational_energy, vibrational_energy
			};
		});
		return { collision_model, materials };
	}
}
