import type { CollisionModel, MoleculeConfig } from '../streaming/streaming_types';

export interface CatalogSource {
	id: string;
	title: string;
	urls: string[];
	retrieved_on: string;
	notes: string[];
}

export interface MoleculePreset {
	id: string;
	species: string;
	name: string;
	collision_model: CollisionModel;
	source_id: string;
	mass: number;
	reference_diameter: number;
	reference_temperature: number;
	viscosity_index: number;
	scattering_parameter: number;
	temperature_range_k: number[] | null;
}

export interface CatalogQuery {
	text?: string;
	species?: string;
	collision_model?: CollisionModel;
}

export type MolecularEnergy = Pick<MoleculeConfig,
	'translational_energy' | 'rotational_energy' | 'vibrational_energy'>;

export interface MaterialSelection {
	preset_id: string;
	energy: MolecularEnergy;
}

export interface CatalogMaterials {
	collision_model: CollisionModel;
	materials: MoleculeConfig[];
}
