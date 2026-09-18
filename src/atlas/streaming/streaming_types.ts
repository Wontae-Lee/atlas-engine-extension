import type { BackendConnection } from '../backend/backend_types';

export type Vector3 = [number, number, number];
export type CollisionModel = 'vhs' | 'vss';

export interface ParticleData {
	positions: Vector3[];
	velocities: Vector3[];
	species: number[];
}

export interface MoleculeConfig {
	mass: number;
	translational_energy: number;
	rotational_energy: number;
	vibrational_energy: number;
	reference_diameter: number;
	reference_temperature: number;
	viscosity_index: number;
	scattering_parameter: number;
}

export interface SimulationConfig {
	collision_model?: CollisionModel;
	dt: number;
	statistical_weight: number;
	materials: MoleculeConfig[];
	domain: {
		lower_corner: Vector3;
		upper_corner: Vector3;
		cell_size: number;
	};
	particles: ParticleData;
}

export interface SimulationSnapshot extends ParticleData {
	step: number;
	dt: number;
	time: number;
	particle_count: number;
	cell_count: number;
}

export interface RunOptions {
	steps_per_update?: number;
	interval_ms?: number;
}

export type StreamingState = 'empty' | 'ready' | 'running' | 'paused' | 'disconnected' | 'error' | 'disposed';

export interface ConnectionSource {
	get_connection(): BackendConnection | undefined;
	on_connection(listener: (connection: BackendConnection | undefined, error?: Error) => void): () => void;
}
