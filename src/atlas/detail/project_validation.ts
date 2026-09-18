import { DOMAIN_FIELDS, ENTRY_DEFINITIONS, MATERIAL_FIELDS, OUTPUT_FIELDS, SOLVER_FIELDS } from '../project/project_fields';
import type { FieldDefinition, ProjectEntry, ProjectState } from '../project/project_types';

type References = Record<'asset' | 'geometry' | 'material', Set<string>>;

function object(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\0')) {
		throw new Error(`${label} must be nonempty text.`);
	}
	return value;
}

function vector(value: unknown, label: string): number[] {
	if (!Array.isArray(value) || value.length !== 3
		|| ![...value].every(component => typeof component === 'number' && Number.isFinite(component))) {
		throw new Error(`${label} must contain three finite numbers.`);
	}
	return value as number[];
}

function relative_path(value: unknown, label: string): void {
	const path = text(value, label);
	if (path.startsWith('/') || path.includes('\\') || path.includes(':')
		|| path.split('/').some(part => part === '..' || part === '.' || part.length === 0)) {
		throw new Error(`${label} must be a relative path without parent-directory traversal.`);
	}
}

function fields(value: unknown, definitions: readonly FieldDefinition[], label: string, references: References): void {
	const values = object(value, label);
	for (const definition of definitions) {
		const item = values[definition.key];
		const name = `${label}: ${definition.label}`;
		switch (definition.type) {
			case 'number':
			case 'integer':
				if (typeof item !== 'number' || !Number.isFinite(item)) {
					throw new Error(`${name} must be a finite number.`);
				}
				if (definition.type === 'integer' && !Number.isSafeInteger(item)) {
					throw new Error(`${name} must be a safe integer.`);
				}
				if (definition.min !== undefined && item < definition.min) {
					throw new Error(`${name} must be at least ${definition.min}.`);
				}
				if (definition.max !== undefined && item > definition.max) {
					throw new Error(`${name} must be at most ${definition.max}.`);
				}
				if (definition.exclusive_min !== undefined && item <= definition.exclusive_min) {
					throw new Error(`${name} must be greater than ${definition.exclusive_min}.`);
				}
				break;
			case 'boolean':
				if (typeof item !== 'boolean') {
					throw new Error(`${name} must be true or false.`);
				}
				break;
			case 'vector':
				vector(item, name);
				break;
			case 'vertices':
				if (!Array.isArray(item) || item.length < 3) {
					throw new Error(`${name} must contain at least three vertices.`);
				}
				item.forEach((vertex, index) => vector(vertex, `${name} ${index + 1}`));
				break;
			case 'choice':
				if (!definition.choices?.some(choice => choice.value === item)) {
					throw new Error(`${name} is not a supported choice.`);
				}
				break;
			case 'text':
				text(item, name);
				break;
			case 'asset':
			case 'geometry':
			case 'material':
				if (typeof item !== 'string' || !references[definition.type].has(item)) {
					throw new Error(`${name} refers to a missing ${definition.type}. Remove its references before deleting that item.`);
				}
				break;
		}
	}
}

function ordered_bounds(lower: number[], upper: number[], label: string): void {
	if (lower.some((coordinate, index) => coordinate >= upper[index]
		|| !Number.isFinite(upper[index] - coordinate))) {
		throw new Error(`${label} must have a lower corner strictly below its upper corner on every axis.`);
	}
}

function geometry(entry: ProjectEntry): void {
	const values = entry.fields;
	if (entry.kind === 'plane' || entry.kind === 'circle' || entry.kind === 'square') {
		const length = Math.hypot(...values.normal as number[]);
		if (!(length > 0) || !Number.isFinite(length)) {
			throw new Error(`${entry.name}: Normal must be nonzero.`);
		}
	}
	if (entry.kind === 'box') {
		ordered_bounds(values.lower as number[], values.upper as number[], entry.name);
	}
	if (entry.kind === 'triangle') {
		const a = values.a as number[];
		const b = values.b as number[];
		const c = values.c as number[];
		const ab = b.map((coordinate, index) => coordinate - a[index]);
		const ac = c.map((coordinate, index) => coordinate - a[index]);
		const ab_length = Math.hypot(...ab);
		const ac_length = Math.hypot(...ac);
		const first = ab.map(coordinate => coordinate / ab_length);
		const second = ac.map(coordinate => coordinate / ac_length);
		const cross = [
			first[1] * second[2] - first[2] * second[1],
			first[2] * second[0] - first[0] * second[2],
			first[0] * second[1] - first[1] * second[0]
		];
		if (!Number.isFinite(ab_length) || !Number.isFinite(ac_length) || !(Math.hypot(...cross) > 0)) {
			throw new Error(`${entry.name}: Triangle vertices must be distinct and noncollinear.`);
		}
	}
}

function source_geometry(source: ProjectEntry, shape: ProjectEntry): void {
	if (shape.kind === 'plane') {
		throw new Error(`${source.name}: Sources require finite geometry bounds; an infinite plane cannot be sampled.`);
	}
	if (source.kind === 'volume' && ['circle', 'square', 'triangle'].includes(shape.kind)) {
		throw new Error(`${source.name}: A volume source requires solid geometry, not ${shape.kind}.`);
	}
	if (['sphere', 'cylinder', 'circle', 'square', 'polygonal_prism'].includes(shape.kind)) {
		const center = shape.fields.center as number[];
		const radius = shape.kind === 'square'
			? (shape.fields.side_length as number) / Math.SQRT2 : shape.fields.radius as number;
		const extent = [radius, radius, ['cylinder', 'polygonal_prism'].includes(shape.kind)
			? (shape.fields.height as number) / 2 : radius];
		if (center.some((coordinate, axis) => !Number.isFinite(coordinate - extent[axis])
			|| !Number.isFinite(coordinate + extent[axis]) || !Number.isFinite(2 * extent[axis]))) {
			throw new Error(`${source.name}: Geometry must have finite sampling bounds.`);
		}
	}
	if (source.kind === 'volume' && shape.kind !== 'triangle_mesh') {
		let volume: number;
		const radius = shape.fields.radius as number;
		const height = shape.fields.height as number;
		switch (shape.kind) {
			case 'sphere':
				volume = 4 * Math.PI * radius ** 3 / 3;
				break;
			case 'box': {
				const lower = shape.fields.lower as number[];
				const upper = shape.fields.upper as number[];
				volume = upper.reduce((product, value, index) => product * (value - lower[index]), 1);
				break;
			}
			case 'cylinder':
				volume = Math.PI * radius ** 2 * height;
				break;
			case 'polygonal_prism': {
				const count = shape.fields.side_count as number;
				volume = count * radius ** 2 * Math.sin(2 * Math.PI / count) * height / 2;
				break;
			}
			default:
				throw new Error(`${source.name}: Geometry does not support a volume source.`);
		}
		if (!(volume > 0) || !Number.isFinite(volume)) {
			throw new Error(`${source.name}: Geometry must have finite, positive volume.`);
		}
	}
}

export function validate_project(state: ProjectState, for_engine = false): void {
	const project = object(state, 'Atlas project');
	if (project.version !== 1) {
		throw new Error('Unsupported Atlas project version.');
	}
	const all_ids = new Set<string>();
	const references: References = { asset: new Set(), geometry: new Set(), material: new Set() };
	for (const section of ['assets', 'materials', 'geometry', 'sources', 'boundaries', 'sinks'] as const) {
		const entries = project[section];
		if (!Array.isArray(entries)) {
			throw new Error(`${section} must be an array.`);
		}
		for (const value of entries) {
			const entry = object(value, section);
			const id = text(entry.id, `${section} ID`);
			text(entry.name, `${section} name`);
			if (all_ids.has(id)) {
				throw new Error(`Duplicate Atlas project ID: ${id}.`);
			}
			all_ids.add(id);
			if (section === 'assets') { references.asset.add(id); }
			if (section === 'geometry') { references.geometry.add(id); }
			if (section === 'materials') { references.material.add(id); }
		}
	}
	fields(project.domain, DOMAIN_FIELDS, 'Domain', references);
	fields(project.solver, SOLVER_FIELDS, 'DSMC solver', references);
	fields(project.output, OUTPUT_FIELDS, 'Output', references);
	ordered_bounds(state.domain.lower_corner, state.domain.upper_corner, 'Domain');
	relative_path(state.output.output_directory, 'Output directory');
	for (const asset of state.assets) {
		relative_path(asset.path, `${asset.name}: Asset path`);
		if (!asset.path.toLowerCase().endsWith('.obj')) {
			throw new Error(`${asset.name}: Mesh assets must be OBJ files.`);
		}
		if (!/^[a-z][a-z\d+.-]*:/i.test(text(asset.workspace_uri, `${asset.name}: Workspace URI`))) {
			throw new Error(`${asset.name}: Workspace URI is invalid.`);
		}
	}
	for (const material of state.materials) {
		text(material.preset_id, `${material.name}: Preset ID`);
		if (material.collision_model !== 'vhs' && material.collision_model !== 'vss') {
			throw new Error(`${material.name}: Collision model must be VHS or VSS.`);
		}
		fields(material.properties, MATERIAL_FIELDS, material.name, references);
		if (for_engine && material.collision_model !== state.solver.collision_model) {
			throw new Error(`${material.name}: Choose a ${state.solver.collision_model.toUpperCase()} material preset to match the solver.`);
		}
		if (for_engine && material.collision_model === 'vhs' && material.properties.scattering_parameter !== 1) {
			throw new Error(`${material.name}: VHS requires a scattering parameter of 1.`);
		}
	}
	for (const section of ['geometry', 'sources', 'boundaries', 'sinks'] as const) {
		for (const entry of state[section]) {
			const definition = ENTRY_DEFINITIONS[section]?.find(candidate => candidate.kind === entry.kind);
			if (!definition) {
				throw new Error(`${entry.name}: Unsupported ${section} kind '${String(entry.kind)}'.`);
			}
			fields(entry.fields, definition.fields, entry.name, references);
			if (section === 'geometry') { geometry(entry); }
		}
	}
	for (const source of state.sources) {
		const shape = state.geometry.find(entry => entry.id === source.fields.geometry_id)!;
		source_geometry(source, shape);
	}
	if (for_engine && state.materials.length === 0) {
		throw new Error('Add at least one material before applying the project to Atlas.');
	}
	if (for_engine && state.sources.length > 0
		&& (!Number.isSafeInteger(state.solver.buffer_size) || state.solver.buffer_size <= 0)) {
		throw new Error('Sources require an explicit, positive integer particle capacity.');
	}
}
