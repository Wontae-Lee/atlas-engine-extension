import * as assert from 'node:assert';
import { Deferred } from './helpers/deferred';
import { TestEditorView } from './helpers/test_editor_view';
import { WebviewHost } from './helpers/webview_host';

async function settle(): Promise<void> {
	await new Promise<void>(resolve => setImmediate(resolve));
}

suite('Editor webview lifecycle', () => {
	let host: WebviewHost;
	let view: TestEditorView;

	setup(() => {
		host = new WebviewHost();
		view = new TestEditorView();
		view.initialize(host.api, host.extension_uri);
	});

	teardown(() => { view.dispose(); });

	test('initialization and refresh do not create a tab or request its data', async () => {
		view.update();
		view.update();
		await settle();
		assert.strictEqual(host.panels.length, 0);
		assert.strictEqual(view.read_count, 0);
		assert.strictEqual(view.render_count, 0);
	});

	test('waits for the client and posts updates without replacing HTML', async () => {
		await view.show(host.api);
		const panel = host.panels[0];
		assert.strictEqual(panel.panel.viewType, 'atlas-engine.test');
		assert.strictEqual(panel.options.enableScripts, true);
		assert.deepStrictEqual(panel.options.localResourceRoots?.map(uri => uri.path), ['/atlas-extension/dist/webview']);
		assert.strictEqual(panel.html_writes.length, 1);
		view.update();
		await settle();
		assert.strictEqual(view.read_count, 0);
		assert.deepStrictEqual(panel.messages, []);
		panel.receive({ type: 'ready' });
		await settle();
		assert.deepStrictEqual(panel.messages, [{ step: 0 }]);
		view.value = { step: 2 };
		view.update();
		await settle();
		assert.deepStrictEqual(panel.messages.at(-1), { step: 2 });
		assert.strictEqual(view.render_count, 1);
		assert.strictEqual(panel.html_writes.length, 1);
		await view.show(host.api);
		await settle();
		assert.strictEqual(host.panels.length, 1);
		assert.strictEqual(view.render_count, 1);
	});

	test('coalesces changes during a pending read and never posts the stale frame', async () => {
		const first = new Deferred<unknown>();
		view.read = () => view.read_count === 1 ? first.promise : view.value;
		await view.show(host.api);
		const panel = host.panels[0];
		panel.receive({ type: 'ready' });
		assert.strictEqual(view.read_count, 1);
		view.value = { step: 1 };
		view.update();
		view.value = { step: 2 };
		view.update();
		assert.strictEqual(view.read_count, 1);
		first.resolve({ step: 0 });
		await settle();
		assert.strictEqual(view.read_count, 2);
		assert.deepStrictEqual(panel.messages, [{ step: 2 }]);
	});

	test('defers hidden updates and sends the latest state when revealed', async () => {
		await view.show(host.api);
		const panel = host.panels[0];
		panel.receive({ type: 'ready' });
		await settle();
		panel.set_visible(false);
		view.value = { step: 12 };
		view.update();
		await settle();
		assert.strictEqual(view.read_count, 1);
		assert.deepStrictEqual(panel.messages, [{ step: 0 }]);
		panel.set_visible(true);
		await settle();
		assert.deepStrictEqual(panel.messages.at(-1), { step: 12 });
		assert.strictEqual(panel.html_writes.length, 1);
	});

	test('closing releases listeners and reopening starts with current data', async () => {
		await view.show(host.api);
		const previous = host.panels[0];
		previous.receive({ type: 'ready' });
		await settle();
		previous.panel.dispose();
		assert.strictEqual(previous.listener_count, 0);
		view.value = { step: 9 };
		view.update();
		await settle();
		assert.strictEqual(host.panels.length, 1);
		await view.show(host.api);
		const current = host.panels[1];
		assert.deepStrictEqual(current.messages, []);
		current.receive({ type: 'ready' });
		await settle();
		assert.deepStrictEqual(current.messages, [{ step: 9 }]);
		assert.deepStrictEqual(previous.messages, [{ step: 0 }]);
	});

	test('a late read from a closed tab cannot overwrite the reopened tab', async () => {
		const first = new Deferred<unknown>();
		view.read = () => view.read_count === 1 ? first.promise : view.value;
		await view.show(host.api);
		const previous = host.panels[0];
		previous.receive({ type: 'ready' });
		previous.panel.dispose();
		view.value = { step: 20 };
		await view.show(host.api);
		const current = host.panels[1];
		current.receive({ type: 'ready' });
		first.resolve({ step: 0 });
		await settle();
		assert.deepStrictEqual(previous.messages, []);
		assert.deepStrictEqual(current.messages, [{ step: 20 }]);
		assert.strictEqual(previous.listener_count, 0);
	});

	test('disposal suppresses late data and removes message handlers', async () => {
		const read = new Deferred<unknown>();
		view.read = () => read.promise;
		await view.show(host.api);
		const panel = host.panels[0];
		panel.receive({ type: 'ready' });
		view.dispose();
		assert.strictEqual(panel.disposed, true);
		assert.strictEqual(panel.listener_count, 0);
		read.resolve({ step: 3 });
		panel.receive({ type: 'action', action: 'start' });
		view.update();
		await settle();
		assert.deepStrictEqual(panel.messages, []);
		assert.deepStrictEqual(view.received, []);
		assert.strictEqual(host.panels.length, 1);
	});

	test('reports a failed client action and accepts subsequent updates', async () => {
		await view.show(host.api);
		const panel = host.panels[0];
		view.action = async () => { throw new Error('Apply the case first.'); };
		panel.receive({ type: 'action', action: 'start' });
		await settle();
		assert.deepStrictEqual(panel.messages, [{ type: 'error', message: 'Apply the case first.' }]);
		assert.deepStrictEqual(view.received, [{ type: 'action', action: 'start' }]);
		panel.receive({ type: 'ready' });
		await settle();
		assert.deepStrictEqual(panel.messages.at(-1), { step: 0 });
	});
});
