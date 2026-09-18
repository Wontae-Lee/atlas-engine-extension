import * as assert from 'node:assert';
import { geometry_wireframe, obj_wireframe, transform_point } from '../src/atlas/detail/scene_geometry';
import type { FieldValue, ProjectEntry } from '../src/atlas/project/project_types';
import type { Vector3 } from '../src/atlas/streaming/streaming_types';

function entry(kind: string, fields: Record<string, FieldValue>): ProjectEntry {
	return { id: kind, name: kind, kind, fields };
}

function assert_point(actual: readonly number[], expected: readonly number[]): void {
	assert.strictEqual(actual.length, 3);
	actual.forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-10, `Axis ${axis}: expected ${expected[axis]}, got ${value}`));
}

suite('Simulation scene geometry', () => {
	test('matches engine Euler XYZ composition and applies translation after rotation', () => {
		const rotation: Vector3 = [Math.PI / 2, Math.PI / 2, Math.PI / 2];
		const translation: Vector3 = [10, 20, 30];
		assert_point(transform_point([1, 2, 3], rotation, translation), [13, 22, 29]);
		const mesh = geometry_wireframe(entry('triangle', {
			a: [1, 2, 3], b: [2, 2, 3], c: [1, 3, 3], rotation, translation
		}), [], 4);
		assert_point(mesh.vertices[0], [13, 22, 29]);
		assert_point(mesh.vertices[1], [13, 22, 28]);
		assert_point(mesh.vertices[2], [13, 23, 29]);
	});

	test('loads OBJ polygons with negative slash indices and shared triangle edges', () => {
		const vertices = ['v 0 0 0', 'v 2 0 0', 'v 2 1 0', 'v 0 1 0'];
		const mesh = obj_wireframe([
			...vertices,
			'vt 0 0', 'vt 1 0', 'vt 1 1', 'vt 0 1', 'vn 0 0 1',
			'f -4/1/1 -3/2/1 -2/3/1 -1/4/1 # rectangle'
		].join('\n'));
		assert.deepStrictEqual(mesh.vertices, [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]]);
		const edges = mesh.edges.map(([first, second]) => [Math.min(first, second), Math.max(first, second)].join(':')).sort();
		assert.deepStrictEqual(edges, ['0:1', '0:2', '0:3', '1:2', '2:3']);
		const normal_only = obj_wireframe([...vertices, 'vn 0 0 1', 'f 1//1 2//1 3//1'].join('\n'));
		assert.strictEqual(normal_only.edges.length, 3);
	});

	test('reports invalid or missing OBJ geometry instead of returning a successful preview', () => {
		const vertices = 'v 0 0 0\nv 1 0 0\nv 0 1 0\n';
		assert.throws(() => obj_wireframe(`${vertices}f 1 2 4`), /missing vertex at line 4/);
		assert.throws(() => obj_wireframe(`${vertices}f -4 -2 -1`), /missing vertex at line 4/);
		assert.throws(() => obj_wireframe(`${vertices}f 0 2 3`), /Invalid OBJ face index/);
		assert.throws(() => obj_wireframe(vertices), /no polygon faces/);
		assert.throws(() => geometry_wireframe(entry('triangle_mesh', { asset_id: 'missing' }), [], 4), /has not been loaded/);
		assert.throws(() => geometry_wireframe(entry('triangle_mesh', { asset_id: 'mesh' }), [
			{ id: 'mesh', error: 'Asset file was deleted.' }
		], 4), /Asset file was deleted/);
	});

	test('supports all nine engine primitives with finite coordinates and valid wireframe edges', () => {
		const fixtures: Record<string, Record<string, FieldValue>> = {
			sphere: { center: [0, 0, 0], radius: 0.5 },
			box: { lower: [-0.5, -0.5, -0.5], upper: [0.5, 0.5, 0.5] },
			cylinder: { center: [0, 0, 0], radius: 0.5, height: 1, open: false },
			plane: { normal: [0, 0, 1], offset: 0 },
			circle: { center: [0, 0, 0], normal: [0, 0, 1], radius: 0.5 },
			square: { center: [0, 0, 0], normal: [0, 0, 1], side_length: 1 },
			triangle: { a: [0, 0, 0], b: [1, 0, 0], c: [0, 1, 0] },
			polygonal_prism: { center: [0, 0, 0], radius: 0.5, height: 1, side_count: 6 },
			triangle_mesh: { asset_id: 'mesh' }
		};
		for (const [kind, fields] of Object.entries(fixtures)) {
			const mesh = geometry_wireframe(entry(kind, fields), [{
				id: 'mesh', content: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3'
			}], 4);
			assert.ok(mesh.vertices.length >= 3, kind);
			assert.ok(mesh.edges.length >= 3, kind);
			for (const vertex of mesh.vertices) {
				assert.strictEqual(vertex.length, 3, kind);
				assert.ok(vertex.every(Number.isFinite), kind);
			}
			for (const edge of mesh.edges) {
				assert.ok(edge.every(index => Number.isInteger(index) && index >= 0 && index < mesh.vertices.length), kind);
			}
		}
	});

	test('preserves a plane equation when its normal and offset are scaled together', () => {
		const mesh = geometry_wireframe(entry('plane', { normal: [2, 4, 4], offset: -18 }), [], 4);
		const equivalent = geometry_wireframe(entry('plane', { normal: [1, 2, 2], offset: -9 }), [], 4);
		mesh.vertices.forEach((point, index) => {
			assert.ok(Math.abs(2 * point[0] + 4 * point[1] + 4 * point[2] - 18) < 1e-10);
			assert_point(point, equivalent.vertices[index]);
		});
		const center = [0, 1, 2].map(axis => mesh.vertices.reduce((sum, point) => sum + point[axis], 0) / mesh.vertices.length);
		assert_point(center, [1, 2, 2]);
	});
});
