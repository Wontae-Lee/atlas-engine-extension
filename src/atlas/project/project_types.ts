import type {JsonObject} from '../engine/protocol';

export interface GeometryRecord {
    id: string;
    name: string;
    geometry: JsonObject;
}

export interface AssetRecord {
    id: string;
    name: string;
    path: string;
}

export interface ProjectState {
    version: 1;
    simulation: JsonObject;
    geometries: GeometryRecord[];
    assets: AssetRecord[];
    output: {
        csv_enabled: boolean;
        csv_filename: string;
    };
}

export function default_project(): ProjectState {
    return {
        version: 1,
        simulation: {
            dt: 0.00005,
            fluid: {
                buffer_size: 20000,
                particle_count: 0,
                statistical_weight: 3.236e16,
                materials: [{
                    type: 'molecule', mass: 4.65e-26,
                    translational_energy: 0, rotational_energy: 0, vibrational_energy: 0,
                    reference_diameter: 4.17e-10, reference_temperature: 273,
                    viscosity_index: 0.74, scattering_parameter: 1
                }]
            },
            universe: {lower_corner: [-1, -1, -1], upper_corner: [1, 1, 1], cell_size: 0.1},
            solvers: [{kernel: 'variable_hard_sphere', majorant_sample_pairs: 8,
                majorant_exhaustive_limit: 5}],
            emitters: [], colliders: [], sinks: []
        },
        geometries: [],
        assets: [],
        output: {csv_enabled: false, csv_filename: 'statistics.csv'}
    };
}
