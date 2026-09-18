import type { EntryDefinition, FieldDefinition, ProjectSection } from './project_types';
import { GEOMETRY_KINDS } from './geometry_fields';

export const DOMAIN_FIELDS: readonly FieldDefinition[] = [
	{ key: 'lower_corner', label: 'Lower corner', type: 'vector', unit: 'm' },
	{ key: 'upper_corner', label: 'Upper corner', type: 'vector', unit: 'm' },
	{ key: 'cell_size', label: 'Cell size', type: 'number', exclusive_min: 0, unit: 'm' }
];

export const SOLVER_FIELDS: readonly FieldDefinition[] = [
	{ key: 'collision_model', label: 'Collision model', type: 'choice', choices: [{ label: 'VHS', value: 'vhs' }, { label: 'VSS', value: 'vss' }] },
	{ key: 'dt', label: 'Time step', type: 'number', exclusive_min: 0, unit: 's' },
	{ key: 'statistical_weight', label: 'Statistical weight', type: 'number', exclusive_min: 0 },
	{ key: 'buffer_size', label: 'Particle capacity', type: 'integer', min: 1, max: 2147483647 },
	{ key: 'majorant_sample_pairs', label: 'Majorant sample pairs', type: 'integer', min: 1, max: 2147483647 },
	{ key: 'majorant_exhaustive_limit', label: 'Majorant exhaustive limit', type: 'integer', min: 2, max: 2147483647 }
];

export const OUTPUT_FIELDS: readonly FieldDefinition[] = [
	{ key: 'enabled', label: 'CSV observer enabled', type: 'boolean' },
	{ key: 'interval', label: 'Sampling interval', type: 'integer', min: 1, max: 2147483647, unit: 'steps' },
	{ key: 'output_directory', label: 'Directory in container', type: 'text' }
];

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

const source_fields: readonly FieldDefinition[] = [
	{ key: 'geometry_id', label: 'Geometry', type: 'geometry' },
	{ key: 'material_id', label: 'Material', type: 'material' },
	{ key: 'spacing', label: 'Particle spacing', type: 'number', default_value: 0.1, exclusive_min: 0, unit: 'm' },
	{ key: 'tolerance', label: 'Tolerance', type: 'number', default_value: 0, min: 0, unit: 'm' },
	{ key: 'temperature', label: 'Temperature', type: 'number', default_value: 273.15, min: 0, unit: 'K' },
	{ key: 'bulk_velocity', label: 'Bulk velocity', type: 'vector', default_value: [0, 0, 0], unit: 'm/s' }
];

const sink_fields: readonly FieldDefinition[] = [
	{ key: 'geometry_id', label: 'Geometry', type: 'geometry' },
	{ key: 'tolerance', label: 'Tolerance', type: 'number', default_value: 0, min: 0, unit: 'm' }
];

export const ENTRY_DEFINITIONS: Partial<Record<ProjectSection, readonly EntryDefinition[]>> = {
	geometry: GEOMETRY_KINDS,
	sources: [
		{ kind: 'volume', label: 'Volume Source', fields: source_fields },
		{ kind: 'surface', label: 'Surface Source', fields: source_fields }
	],
	boundaries: [{
		kind: 'isothermal', label: 'Isothermal Collider', fields: [
			{ key: 'geometry_id', label: 'Geometry', type: 'geometry' },
			{ key: 'momentum_accommodation_coefficient', label: 'Momentum accommodation', type: 'number', default_value: 1, min: 0, max: 1 },
			{ key: 'restitution', label: 'Restitution', type: 'number', default_value: 1, min: 0 },
			{ key: 'diffuse_sampling', label: 'Diffuse sampling', type: 'choice', default_value: 'uniform', choices: [
				{ label: 'Uniform', value: 'uniform' }, { label: 'Cosine weighted', value: 'cosine_weighted' }
			] }
		]
	}],
	sinks: [
		{ kind: 'volume', label: 'Volume Sink', fields: sink_fields },
		{ kind: 'surface', label: 'Surface Sink', fields: sink_fields },
		{ kind: 'tracing', label: 'Tracing Sink', fields: sink_fields.slice(0, 1) }
	]
};
