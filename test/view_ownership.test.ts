import * as assert from 'node:assert';
import type * as vscode from 'vscode';
import { MoleculeCatalog } from '../src/atlas/catalog/molecule_catalog';
import { CaseProject } from '../src/atlas/project/case_project';
import { Streaming } from '../src/atlas/streaming/streaming';
import { Left } from '../src/atlas/views/left/left';
import { ConnectionSource } from './helpers/connection_source';
import { empty_project } from './helpers/empty_project';
import { StreamingConnection } from './helpers/streaming_connection';

suite('Left sidebar editing ownership', () => {
	let project: CaseProject;
	let streaming: Streaming;
	let connection: StreamingConnection;
	let left: Left;
	let answers: (string | undefined)[];
	let prompts: vscode.InputBoxOptions[];
	let api: typeof vscode;

	setup(async () => {
		project = new CaseProject(new MoleculeCatalog(), empty_project());
		await project.change(state => {
			state.geometry.push({
				id: 'body', name: 'Sphere', kind: 'sphere',
				fields: {
					center: [0, 0, 0], radius: 0.5,
					translation: [0, 0, 0], rotation: [0, 0, 0],
					velocity: [0, 0, 0], angular_velocity: [0, 0, 0]
				}
			});
		});
		connection = new StreamingConnection();
		streaming = new Streaming(new ConnectionSource(connection));
		left = new Left(project, streaming);
		answers = [];
		prompts = [];
		api = {
			window: {
				showInputBox: async (options: vscode.InputBoxOptions) => {
					prompts.push(options);
					return answers.shift();
				}
			}
		} as unknown as typeof vscode;
	});

	teardown(() => {
		for (const view of left.views) {
			view.dispose();
		}
		streaming.dispose();
		project.dispose();
	});

	test('routes edits to their section without changing unrelated state or contacting the engine', async () => {
		const expected = project.get_state();
		answers.push('-2, -2, -2', '0.25', 'Obstacle', '25');
		await left.execute(api, { section: 'domain', action: 'edit', field: 'lower_corner' });
		await left.execute(api, { section: 'geometry', action: 'edit', id: 'body', field: 'radius' });
		await left.execute(api, { section: 'geometry', action: 'rename', id: 'body' });
		await left.execute(api, { section: 'output', action: 'edit', field: 'interval' });
		expected.domain.lower_corner = [-2, -2, -2];
		expected.geometry[0].fields.radius = 0.25;
		expected.geometry[0].name = 'Obstacle';
		expected.output.interval = 25;
		assert.deepStrictEqual(project.get_state(), expected);
		assert.deepStrictEqual(prompts.map(prompt => prompt.value), ['0, 0, 0', '0.5', 'Sphere', '100']);
		assert.strictEqual(connection.requests.length, 0);
	});

	test('cancelling an edit in any section leaves the saved state and revision unchanged', async () => {
		const before = project.get_state();
		const revision = project.revision;
		await left.execute(api, { section: 'domain', action: 'edit', field: 'cell_size' });
		await left.execute(api, { section: 'geometry', action: 'edit', id: 'body', field: 'radius' });
		await left.execute(api, { section: 'output', action: 'edit', field: 'interval' });
		assert.strictEqual(prompts.length, 3);
		assert.deepStrictEqual(project.get_state(), before);
		assert.strictEqual(project.revision, revision);
		assert.strictEqual(connection.requests.length, 0);
	});
});
