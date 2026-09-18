import type { ProjectState } from '../../project/project_types';
import type { StreamingState, Vector3 } from '../../streaming/streaming_types';

export type SimulationAction = 'apply' | 'start' | 'pause' | 'step' | 'reset';

export interface SimulationStatus {
	state: StreamingState;
	applied: boolean;
	busy: boolean;
	revision: number;
	error?: string;
}

export interface SceneAsset {
	id: string;
	content?: string;
	error?: string;
}

export interface SceneFrame {
	type: 'scene';
	status: SimulationStatus;
	project: ProjectState;
	assets?: SceneAsset[];
	snapshot?: {
		step: number;
		time: number;
		particle_count: number;
		sample_count: number;
		positions: Vector3[];
		species: number[];
	};
}
