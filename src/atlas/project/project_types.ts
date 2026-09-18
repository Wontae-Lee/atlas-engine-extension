import type { CollisionModel, MoleculeConfig } from '../streaming/streaming_types';

export type FieldValue = number | string | boolean | number[] | number[][];

export interface FieldDefinition {
	key: string;
	label: string;
	type: 'number' | 'integer' | 'vector' | 'vertices' | 'boolean' | 'text' | 'choice' | 'asset' | 'geometry' | 'material';
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

export interface ProjectEntry {
	id: string;
	name: string;
	kind: string;
	fields: Record<string, FieldValue>;
}

export interface MaterialRecord {
	id: string;
	name: string;
	preset_id: string;
	collision_model: CollisionModel;
	properties: MoleculeConfig;
}

export interface AssetRecord {
	id: string;
	name: string;
	path: string;
	workspace_uri: string;
}

export type EntrySection = 'geometry' | 'sources' | 'boundaries' | 'sinks';
export type ProjectSection = EntrySection | 'domain' | 'assets' | 'materials' | 'solvers' | 'output';

export interface ProjectState {
	version: 1;
	domain: { lower_corner: number[]; upper_corner: number[]; cell_size: number };
	solver: {
		collision_model: CollisionModel;
		dt: number;
		statistical_weight: number;
		buffer_size: number;
		majorant_sample_pairs: number;
		majorant_exhaustive_limit: number;
	};
	output: { enabled: boolean; interval: number; output_directory: string };
	assets: AssetRecord[];
	materials: MaterialRecord[];
	geometry: ProjectEntry[];
	sources: ProjectEntry[];
	boundaries: ProjectEntry[];
	sinks: ProjectEntry[];
}

export interface ProjectAction {
	section: ProjectSection;
	action: 'add' | 'edit' | 'remove' | 'rename' | 'replace' | 'reveal' | 'preset' | 'apply' | 'start' | 'pause' | 'step' | 'reset';
	id?: string;
	field?: string;
}
