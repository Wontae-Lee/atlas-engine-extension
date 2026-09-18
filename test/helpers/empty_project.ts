import type { ProjectState } from '../../src/atlas/project/project_types';

export function empty_project(): ProjectState {
	return {
		version: 1,
		domain: { lower_corner: [0, 0, 0], upper_corner: [1, 1, 1], cell_size: 0.1 },
		solver: {
			collision_model: 'vhs', dt: 1e-6, statistical_weight: 1,
			buffer_size: 100000, majorant_sample_pairs: 8, majorant_exhaustive_limit: 5
		},
		output: { enabled: false, interval: 100, output_directory: 'results' },
		assets: [], materials: [], geometry: [], sources: [], boundaries: [], sinks: []
	};
}
