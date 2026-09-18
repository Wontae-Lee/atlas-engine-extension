import type { ProjectEntry, ProjectState } from '../project/project_types';

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

function numeric(value: unknown, label: string,
	limits: { min?: number; max?: number; exclusive_min?: number; integer?: boolean } = {}): void {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number.`);
	}
	if (limits.integer && !Number.isSafeInteger(value)) {
		throw new Error(`${label} must be a safe integer.`);
	}
	if (limits.min !== undefined && value < limits.min) {
		throw new Error(`${label} must be at least ${limits.min}.`);
	}
	if (limits.max !== undefined && value > limits.max) {
		throw new Error(`${label} must be at most ${limits.max}.`);
	}
	if (limits.exclusive_min !== undefined && value <= limits.exclusive_min) {
		throw new Error(`${label} must be greater than ${limits.exclusive_min}.`);
	}
}

function boolean(value: unknown, label: string): void {
	if (typeof value !== 'boolean') {
		throw new Error(`${label} must be true or false.`);
	}
}

function choice(value: unknown, choices: readonly string[], label: string): void {
	if (typeof value !== 'string' || !choices.includes(value)) {
		throw new Error(`${label} is not a supported choice.`);
	}
}

function reference(value: unknown, kind: keyof References, label: string, references: References): void {
	if (typeof value !== 'string' || !references[kind].has(value)) {
		throw new Error(`${label} refers to a missing ${kind}. Remove its references before deleting that item.`);
	}
}

function ordered_bounds(lower: number[], upper: number[], label: string): void {
	if (lower.some((coordinate, index) => coordinate >= upper[index]
		|| !Number.isFinite(upper[index] - coordinate))) {
		throw new Error(`${label} must have a lower corner strictly below its upper corner on every axis.`);
	}
}

function geometry(entry: ProjectEntry, references: References): void {
	const values = object(entry.fields, entry.name);
	switch (entry.kind) {
		case 'sphere':
			vector(values.center, `${entry.name}: Center`);
			numeric(values.radius, `${entry.name}: Radius`, { exclusive_min: 0 });
			break;
		case 'box':
			vector(values.lower, `${entry.name}: Lower corner`);
			vector(values.upper, `${entry.name}: Upper corner`);
			break;
		case 'cylinder':
		case 'polygonal_prism':
			vector(values.center, `${entry.name}: Center`);
			numeric(values.radius, `${entry.name}: Radius`, { exclusive_min: 0 });
			numeric(values.height, `${entry.name}: Height`, { exclusive_min: 0 });
			if (entry.kind === 'cylinder') {
				boolean(values.open, `${entry.name}: Open ends`);
			} else {
				numeric(values.side_count, `${entry.name}: Side count`, { integer: true, min: 3 });
			}
			break;
		case 'plane':
			vector(values.normal, `${entry.name}: Normal`);
			numeric(values.offset, `${entry.name}: Offset (normal · point + offset = 0)`);
			break;
		case 'circle':
		case 'square':
			vector(values.center, `${entry.name}: Center`);
			vector(values.normal, `${entry.name}: Normal`);
			if (entry.kind === 'circle') {
				numeric(values.radius, `${entry.name}: Radius`, { exclusive_min: 0 });
			} else {
				numeric(values.side_length, `${entry.name}: Side length`, { exclusive_min: 0 });
			}
			break;
		case 'triangle':
			vector(values.a, `${entry.name}: Vertex A`);
			vector(values.b, `${entry.name}: Vertex B`);
			vector(values.c, `${entry.name}: Vertex C`);
			break;
		case 'triangle_mesh':
			reference(values.asset_id, 'asset', `${entry.name}: Mesh asset`, references);
			break;
		default:
			throw new Error(`${entry.name}: Unsupported geometry kind '${String(entry.kind)}'.`);
	}
	vector(values.translation, `${entry.name}: Translation`);
	vector(values.rotation, `${entry.name}: Rotation (Euler XYZ)`);
	vector(values.velocity, `${entry.name}: Velocity`);
	vector(values.angular_velocity, `${entry.name}: Angular velocity`);
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

function sources(entry: ProjectEntry, references: References): void {
	if (entry.kind !== 'volume' && entry.kind !== 'surface') {
		throw new Error(`${entry.name}: Unsupported sources kind '${String(entry.kind)}'.`);
	}
	const values = object(entry.fields, entry.name);
	reference(values.geometry_id, 'geometry', `${entry.name}: Geometry`, references);
	reference(values.material_id, 'material', `${entry.name}: Material`, references);
	numeric(values.spacing, `${entry.name}: Particle spacing`, { exclusive_min: 0 });
	numeric(values.tolerance, `${entry.name}: Tolerance`, { min: 0 });
	numeric(values.temperature, `${entry.name}: Temperature`, { min: 0 });
	vector(values.bulk_velocity, `${entry.name}: Bulk velocity`);
}

function boundaries(entry: ProjectEntry, references: References): void {
	if (entry.kind !== 'isothermal') {
		throw new Error(`${entry.name}: Unsupported boundaries kind '${String(entry.kind)}'.`);
	}
	const values = object(entry.fields, entry.name);
	reference(values.geometry_id, 'geometry', `${entry.name}: Geometry`, references);
	numeric(values.momentum_accommodation_coefficient, `${entry.name}: Momentum accommodation`, { min: 0, max: 1 });
	numeric(values.restitution, `${entry.name}: Restitution`, { min: 0 });
	choice(values.diffuse_sampling, ['uniform', 'cosine_weighted'], `${entry.name}: Diffuse sampling`);
}

function sinks(entry: ProjectEntry, references: References): void {
	if (!['outside_box', 'volume', 'surface', 'tracing'].includes(entry.kind)) {
		throw new Error(`${entry.name}: Unsupported sinks kind '${String(entry.kind)}'.`);
	}
	const values = object(entry.fields, entry.name);
	reference(values.geometry_id, 'geometry', `${entry.name}: Geometry`, references);
	if (entry.kind === 'volume' || entry.kind === 'surface') {
		numeric(values.tolerance, `${entry.name}: Tolerance`, { min: 0 });
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
	const domain = object(project.domain, 'Domain');
	vector(domain.lower_corner, 'Domain: Lower corner');
	vector(domain.upper_corner, 'Domain: Upper corner');
	numeric(domain.cell_size, 'Domain: Cell size', { exclusive_min: 0 });
	const solver = object(project.solver, 'DSMC solver');
	choice(solver.collision_model, ['vhs', 'vss'], 'DSMC solver: Collision model');
	numeric(solver.dt, 'DSMC solver: Time step', { exclusive_min: 0 });
	numeric(solver.statistical_weight, 'DSMC solver: Statistical weight', { exclusive_min: 0 });
	numeric(solver.buffer_size, 'DSMC solver: Particle capacity', { integer: true, min: 1, max: 2147483647 });
	numeric(solver.majorant_sample_pairs, 'DSMC solver: Majorant sample pairs', { integer: true, min: 1, max: 2147483647 });
	numeric(solver.majorant_exhaustive_limit, 'DSMC solver: Majorant exhaustive limit', { integer: true, min: 2, max: 2147483647 });
	const output = object(project.output, 'Output');
	boolean(output.enabled, 'Output: CSV observer enabled');
	numeric(output.interval, 'Output: Sampling interval', { integer: true, min: 1, max: 2147483647 });
	text(output.output_directory, 'Output: Directory in container');
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
		const properties = object(material.properties, material.name);
		numeric(properties.mass, `${material.name}: Mass`, { exclusive_min: 0 });
		numeric(properties.reference_diameter, `${material.name}: Reference diameter`, { exclusive_min: 0 });
		numeric(properties.reference_temperature, `${material.name}: Reference temperature`, { exclusive_min: 0 });
		numeric(properties.viscosity_index, `${material.name}: Viscosity index (Bird omega)`, { min: 0.5, max: 1.5 });
		numeric(properties.scattering_parameter, `${material.name}: Scattering parameter (alpha)`, { min: 1 });
		numeric(properties.translational_energy, `${material.name}: Translational energy`, { min: 0 });
		numeric(properties.rotational_energy, `${material.name}: Rotational energy`, { min: 0 });
		numeric(properties.vibrational_energy, `${material.name}: Vibrational energy`, { min: 0 });
		if (for_engine && material.collision_model !== state.solver.collision_model) {
			throw new Error(`${material.name}: Choose a ${state.solver.collision_model.toUpperCase()} material preset to match the solver.`);
		}
		if (for_engine && material.collision_model === 'vhs' && material.properties.scattering_parameter !== 1) {
			throw new Error(`${material.name}: VHS requires a scattering parameter of 1.`);
		}
	}
	for (const entry of state.geometry) { geometry(entry, references); }
	for (const entry of state.sources) { sources(entry, references); }
	for (const entry of state.boundaries) { boundaries(entry, references); }
	for (const entry of state.sinks) { sinks(entry, references); }
	for (const source of state.sources) {
		const shape = state.geometry.find(entry => entry.id === source.fields.geometry_id)!;
		source_geometry(source, shape);
	}
	for (const sink of state.sinks) {
		if (sink.kind === 'outside_box' && state.geometry.find(entry => entry.id === sink.fields.geometry_id)?.kind !== 'box') {
			throw new Error(`${sink.name}: Outside Box Sink requires box geometry.`);
		}
	}
	if (for_engine && state.materials.length === 0) {
		throw new Error('Add at least one material before applying the project to Atlas.');
	}
	if (for_engine && state.sources.length > 0
		&& (!Number.isSafeInteger(state.solver.buffer_size) || state.solver.buffer_size <= 0)) {
		throw new Error('Sources require an explicit, positive integer particle capacity.');
	}
}
