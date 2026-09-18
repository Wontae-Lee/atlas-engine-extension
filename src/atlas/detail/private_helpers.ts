import { spawn } from 'node:child_process';
import { DockerError } from './docker_error';

export function error_message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function cancelled(): Error {
	const error = new Error('Backend operation cancelled.');
	error.name = 'AbortError';
	return error;
}

/** Spawn Docker directly; no shell interprets image names, arguments, or Python code. */
export function run(
	executable: string,
	args: string[],
	signal?: AbortSignal,
	onOutput: (text: string) => void = () => {},
	timeout = 30_000
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(cancelled());
			return;
		}
		const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		let finished = false;
		let stopped: Error | undefined;
		const finish = (error?: Error) => {
			if (finished) {
				return;
			}
			finished = true;
			clearTimeout(timer);
			signal?.removeEventListener('abort', abort);
			if (error) {
				reject(error);
			} else {
				resolve(stdout.trim());
			}
		};
		const abort = () => {
			stopped = cancelled();
			child.kill('SIGKILL');
		};
		const timer = setTimeout(() => {
			stopped = new Error(`Docker ${args[0]} timed out. Check that Docker is running and reachable.`);
			child.kill('SIGKILL');
		}, timeout);
		signal?.addEventListener('abort', abort, { once: true });
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (text: string) => {
			stdout = (stdout + text).slice(-65_536);
			onOutput(text);
		});
		child.stderr.on('data', (text: string) => {
			stderr = (stderr + text).slice(-65_536);
			onOutput(text);
		});
		child.on('error', (error: NodeJS.ErrnoException) => {
			finish(new Error(error.code === 'ENOENT'
				? 'Docker CLI was not found. Install Docker and make docker available on PATH.'
				: `Could not start Docker: ${error.message}`));
		});
		child.on('close', code => finish(stopped ?? (code === 0 ? undefined
			: new DockerError(`Docker ${args[0]} failed: ${stderr.trim() || `exit code ${code}`}`, stderr))));
	});
}

export function is_container_removed(error: unknown): boolean {
	return error instanceof DockerError
		&& /No such container|removal of container .* is already in progress/i.test(error.stderr);
}
