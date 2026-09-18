import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import { MoleculeCatalog } from '../src/atlas/catalog/molecule_catalog';
import { CaseProject } from '../src/atlas/project/case_project';
import { validate_project } from '../src/atlas/detail/project_validation';
import type { ProjectState } from '../src/atlas/project/project_types';
import { empty_project } from './helpers/empty_project';

function restore(state: ProjectState): CaseProject {
	const project = new CaseProject(new MoleculeCatalog());
	const storage = { get: () => structuredClone(state) } as unknown as vscode.Memento;
	project.initialize({} as typeof vscode, storage);
	return project;
}

suite('Nitrogen sphere initial case', () => {
	test('exports the requested domain, sphere and inlet without duplicate removal geometry', async () => {
		const project = new CaseProject(new MoleculeCatalog());
		const state = project.get_state();
		validate_project(state, true);
		assert.deepStrictEqual(state.domain.lower_corner, [-1, -1, -1]);
		assert.deepStrictEqual(state.domain.upper_corner, [1, 1, 1]);
		assert.strictEqual(state.materials[0].preset_id, 'n2-piclas-reference-vhs');
		const sphere = state.geometry.find(entry => entry.id === state.boundaries[0].fields.geometry_id)!;
		assert.strictEqual(sphere.kind, 'sphere');
		assert.deepStrictEqual(sphere.fields.center, [0, 0, 0]);
		assert.strictEqual(sphere.fields.radius, 0.5);
		const inlet = state.geometry.find(entry => entry.id === state.sources[0].fields.geometry_id)!;
		assert.deepStrictEqual(inlet.fields.center, [-1, 0, 0]);
		assert.deepStrictEqual(state.sources[0].fields.bulk_velocity, [500, 0, 0]);
		assert.deepStrictEqual(state.sinks, []);
		assert.strictEqual(state.geometry.length, 2);
		const config = await project.to_simulation_config();
		assert.strictEqual(config.scene!.sources[0].fields.material_id, 0);
		assert.deepStrictEqual(config.scene!.sinks, []);
	});

	test('upgrades a legacy empty case but preserves an existing customized case', () => {
		assert.strictEqual(restore(empty_project()).get_state().materials[0].name, 'Nitrogen (N2)');
		const saved = new CaseProject(new MoleculeCatalog()).get_state();
		saved.geometry[0].fields.radius = 0.25;
		assert.deepStrictEqual(restore(saved).get_state(), saved);
	});

	test('does not repopulate an intentionally cleared initialized case', () => {
		const saved = { ...empty_project(), initial_preset: 'nitrogen_sphere' as const };
		assert.deepStrictEqual(restore(saved).get_state(), saved);
	});

	test('removes the redundant legacy escape box and sink when restoring the preset', () => {
		const saved = new CaseProject(new MoleculeCatalog()).get_state();
		saved.geometry.push({ id: 'escape-box', name: 'Escape Box', kind: 'box', fields: {
			lower: [-1, -1, -1], upper: [1, 1, 1], translation: [0, 0, 0],
			rotation: [0, 0, 0], velocity: [0, 0, 0], angular_velocity: [0, 0, 0]
		} });
		saved.sinks.push({ id: 'outside-box', name: 'Remove Outside Box', kind: 'outside_box', fields: { geometry_id: 'escape-box' } });
		const restored = restore(saved).get_state();
		assert.deepStrictEqual(restored.sinks, []);
		assert.strictEqual(restored.geometry.length, 2);
	});

	test('rejects an outside-box sink attached to a sphere', () => {
		const state = new CaseProject(new MoleculeCatalog()).get_state();
		state.sinks.push({ id: 'invalid-sink', name: 'Invalid sink', kind: 'outside_box', fields: { geometry_id: 'sphere' } });
		assert.throws(() => validate_project(state), /requires box geometry/);
	});
});
