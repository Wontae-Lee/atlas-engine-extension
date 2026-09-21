import type {CollisionModel, MoleculeConfig} from '../streaming/streaming_types';

export type FieldValue = number | string | boolean | number[] | number[][];

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

export interface ProjectState {
    version: 1;
    initial_preset?: 'nitrogen_sphere';
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
