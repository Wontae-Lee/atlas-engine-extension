import * as assert from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DockerBackend } from '../src/atlas/backend/docker_backend';
import type { BackendConnection } from '../src/atlas/backend/backend_types';

interface Invocation {
	args: string[];
	pid: number;
}

async function fixture(behavior: 'malformed' | 'exit' | 'wait') {
	const directory = await mkdtemp(join(tmpdir(), 'atlas-docker-test-'));
	const executable = join(directory, 'docker');
	const log = join(directory, 'calls.jsonl');
	await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, pid: process.pid }) + '\\n');
if (args[0] === 'run') {
 readline.createInterface({input: process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'info') {
   console.log(JSON.stringify({id: request.id, result: {engine:'tbb',version:'0.1.0',protocol:1}}));
  } else if (${JSON.stringify(behavior)} === 'malformed') {
   console.log('this is not JSON');
  } else if (${JSON.stringify(behavior)} === 'exit') {
   process.stderr.write('intentional container failure\\n');
   process.exit(17);
  }
 });
} else {
 process.exit(0);
}
`, { mode: 0o755 });
	return {
		backend: new DockerBackend(executable, join(__dirname, '../../src/atlas/streaming/runtime')),
		async invocations(): Promise<Invocation[]> {
			return (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Invocation);
		},
		async cleanup(): Promise<void> {
			await rm(directory, { recursive: true, force: true });
		}
	};
}

async function waitForCleanup(test: Awaited<ReturnType<typeof fixture>>): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (Date.now() < deadline) {
		const calls = await test.invocations();
		const started = calls.find(call => call.args[0] === 'run');
		const removed = calls.filter(call => call.args[0] === 'rm');
		if (started && removed.length) {
			const name = started.args[started.args.indexOf('--name') + 1];
			assert.match(name!, /^atlas-engine-backend-/);
			assert.ok(removed.every(call => call.args.join(' ') === `rm --force ${name}`));
			try {
				process.kill(started.pid, 0);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
					return;
				}
				throw error;
			}
		}
		await delay(20);
	}
	assert.fail('Owned Docker process did not stop and schedule its container removal.');
}

suite('Docker backend transport', function () {
	this.timeout(10_000);

	test('Malformed JSON rejects requests, reports an exit, and removes only its container', async function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const test = await fixture('malformed');
		let connection: BackendConnection | undefined;
		try {
			connection = await test.backend.open('tbb', () => {});
			let exit: Error | undefined;
			connection.on_exit(error => { exit = error; });
			await assert.rejects(connection.request('snapshot'), /Invalid backend JSON response/);
			assert.match(exit!.message, /Invalid backend JSON response/);
			await waitForCleanup(test);
		} finally {
			connection?.dispose();
			await test.cleanup();
		}
	});

	test('Unexpected container death rejects pending requests and reports stderr', async function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const test = await fixture('exit');
		let connection: BackendConnection | undefined;
		try {
			connection = await test.backend.open('tbb', () => {});
			let exit: Error | undefined;
			connection.on_exit(error => { exit = error; });
			await assert.rejects(connection.request('snapshot'), /exited \(17\): intentional container failure/);
			assert.match(exit!.message, /intentional container failure/);
			await waitForCleanup(test);
		} finally {
			connection?.dispose();
			await test.cleanup();
		}
	});

	test('Cancelling a request stops the owned process and rejects other pending requests', async function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const test = await fixture('wait');
		let connection: BackendConnection | undefined;
		try {
			connection = await test.backend.open('tbb', () => {});
			const controller = new AbortController();
			const first = assert.rejects(connection.request('snapshot', undefined, controller.signal), { name: 'AbortError' });
			const second = assert.rejects(connection.request('snapshot'), { name: 'AbortError' });
			controller.abort();
			await Promise.all([first, second]);
			await waitForCleanup(test);
		} finally {
			connection?.dispose();
			await test.cleanup();
		}
	});
});
