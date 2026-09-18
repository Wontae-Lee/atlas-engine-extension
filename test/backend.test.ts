import * as assert from 'assert';
import { Backend } from '../src/atlas/backend/backend';
import type { BackendConnection, BackendInfo } from '../src/atlas/backend/backend_types';
import { Deferred } from './helpers/deferred';
import { Transport } from './helpers/transport';
import { UI } from './helpers/ui';

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

suite('Backend selection', () => {
	let transport: Transport;
	let ui: UI;
	let backend: Backend;

	setup(() => {
		transport = new Transport();
		ui = new UI(transport.events);
		backend = new Backend(transport);
		backend.initialize(ui.api, ui.storage);
	});

	teardown(() => backend.dispose());

	test('Starts TBB by default, exposes the selector, and connects only once on update', async () => {
		assert.strictEqual(ui.status.name, 'atlas-engine-backend');
		assert.strictEqual(ui.status.command, 'atlas-engine.backend.select');
		assert.strictEqual(ui.status.shown, true);
		assert.match(ui.status.text, /TBB/);
		assert.strictEqual(transport.events.length, 0);
		backend.update();
		await settle();
		backend.update();
		await settle();
		assert.deepStrictEqual(ui.persisted, ['tbb']);
		assert.deepStrictEqual(transport.events.filter(event => event.startsWith('open:')), ['open:tbb']);
		assert.ok(transport.events.includes('pull:tbb'));
		assert.match(ui.status.tooltip, /TBB · connected/);
		assert.match(ui.status.tooltip, /Ready/);
	});

	test('Rejects unsupported CUDA before consent or download and retains TBB', async () => {
		assert.strictEqual(await backend.connect('tbb'), true);
		transport.cuda_error = new Error('No NVIDIA GPU is available');
		ui.choice = 'cuda';
		await backend.select();
		assert.ok(transport.events.includes('check_cuda'));
		assert.ok(!transport.events.includes('approval'));
		assert.ok(!transport.events.includes('pull:cuda'));
		assert.ok(!transport.events.includes('open:cuda'));
		assert.strictEqual(transport.connections.tbb.disposed, false);
		assert.deepStrictEqual(ui.persisted, ['tbb']);
		assert.match(ui.status.tooltip, /TBB · connected/);
		assert.match(ui.errors[0]!, /No NVIDIA GPU/);
	});

	test('Declining CUDA installation retains TBB and does not download or open CUDA', async () => {
		await backend.connect('tbb');
		assert.strictEqual(await backend.connect('cuda'), false);
		assert.ok(transport.events.indexOf('check_cuda') < transport.events.indexOf('approval'));
		assert.ok(transport.events.includes('approval'));
		assert.ok(!transport.events.includes('pull:cuda'));
		assert.ok(!transport.events.includes('open:cuda'));
		assert.strictEqual(transport.connections.tbb.disposed, false);
		assert.deepStrictEqual(ui.persisted, ['tbb']);
		assert.match(ui.status.tooltip, /TBB · connected/);
		assert.deepStrictEqual(ui.errors, []);
	});

	test('Obtains consent before download and persists CUDA only after its probe succeeds', async () => {
		await backend.connect('tbb');
		ui.answer = 'Install CUDA';
		const probe = new Deferred<BackendInfo>();
		transport.connections.cuda.info_result = probe.promise;
		const switching = backend.connect('cuda');
		await settle();
		assert.ok(transport.events.indexOf('check_cuda') < transport.events.indexOf('approval'));
		assert.ok(transport.events.indexOf('approval') < transport.events.indexOf('pull:cuda'));
		assert.ok(transport.events.indexOf('pull:cuda') < transport.events.indexOf('open:cuda'));
		assert.ok(transport.events.includes('info:cuda'));
		assert.strictEqual(transport.connections.tbb.disposed, false);
		assert.deepStrictEqual(ui.persisted, ['tbb']);
		probe.resolve({ engine: 'cuda', version: '0.1.0', protocol: 1 });
		assert.strictEqual(await switching, true);
		assert.strictEqual(transport.connections.tbb.disposed, true);
		assert.deepStrictEqual(ui.persisted, ['tbb', 'cuda']);
		assert.match(ui.status.tooltip, /CUDA · connected/);
		assert.ok(transport.events.indexOf('info:cuda') < transport.events.indexOf('persist:cuda'));
	});

	test('Failed CUDA probe closes the candidate and keeps the existing TBB connection', async () => {
		const connections: (BackendConnection | undefined)[] = [];
		backend.on_connection(connection => connections.push(connection));
		await backend.connect('tbb');
		transport.images.add('cuda');
		transport.connections.cuda.info_error = new Error('CUDA native kernel failed');
		assert.strictEqual(await backend.connect('cuda'), false);
		assert.strictEqual(transport.connections.cuda.disposed, true);
		assert.strictEqual(transport.connections.tbb.disposed, false);
		assert.deepStrictEqual(ui.persisted, ['tbb']);
		assert.match(ui.status.tooltip, /TBB · connected/);
		assert.match(ui.errors[0]!, /CUDA native kernel failed/);
		assert.strictEqual(backend.get_connection(), transport.connections.tbb);
		assert.deepStrictEqual(connections, [transport.connections.tbb]);
	});

	test('Cancellation rejects a late successful probe and preserves the active connection', async () => {
		await backend.connect('tbb');
		transport.images.add('cuda');
		const probe = new Deferred<BackendInfo>();
		transport.connections.cuda.info_result = probe.promise;
		const switching = backend.connect('cuda');
		await settle();
		assert.ok(transport.events.includes('info:cuda'));
		ui.cancel!();
		probe.resolve({ engine: 'cuda', version: '0.1.0', protocol: 1 });
		assert.strictEqual(await switching, false);
		assert.strictEqual(transport.connections.cuda.disposed, true);
		assert.strictEqual(transport.connections.tbb.disposed, false);
		assert.deepStrictEqual(ui.persisted, ['tbb']);
		assert.match(ui.status.tooltip, /TBB · connected/);
		assert.deepStrictEqual(ui.errors, []);
	});

	test('Disposal closes an in-flight connection even if opening completes late', async () => {
		const connections: (BackendConnection | undefined)[] = [];
		backend.on_connection(connection => connections.push(connection));
		await backend.connect('tbb');
		transport.images.add('cuda');
		const opening = new Deferred<BackendConnection>();
		transport.open_result = opening.promise;
		const switching = backend.connect('cuda');
		await settle();
		assert.ok(transport.events.includes('open:cuda'));
		backend.dispose();
		opening.resolve(transport.connections.cuda);
		assert.strictEqual(await switching, false);
		assert.strictEqual(transport.connections.cuda.disposed, true);
		assert.strictEqual(transport.connections.tbb.disposed, true);
		assert.strictEqual(ui.status.disposed, true);
		assert.deepStrictEqual(ui.persisted, ['tbb']);
		assert.deepStrictEqual(ui.errors, []);
		assert.strictEqual(backend.get_connection(), undefined);
		assert.deepStrictEqual(connections, [transport.connections.tbb, undefined]);
	});

	test('External container death changes the status to disconnected and reports the failure', async () => {
		const connections: (BackendConnection | undefined)[] = [];
		backend.on_connection(connection => connections.push(connection));
		await backend.connect('tbb');
		transport.connections.tbb.exit(new Error('Container was stopped externally'));
		assert.match(ui.status.tooltip, /TBB · not connected/);
		assert.match(ui.status.text, /warning/);
		assert.match(ui.errors[0]!, /Container was stopped externally/);
		assert.deepStrictEqual(ui.persisted, ['tbb']);
		assert.strictEqual(backend.get_connection(), undefined);
		assert.deepStrictEqual(connections, [transport.connections.tbb, undefined]);
	});
});
