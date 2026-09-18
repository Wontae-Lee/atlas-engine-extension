import { spawn } from 'node:child_process';
import { DockerError } from './docker_error';
import type { SimulationSnapshot } from '../streaming/streaming_types';

export function is_simulation_snapshot(value: unknown): value is SimulationSnapshot {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const snapshot = value as Partial<SimulationSnapshot>;
	const count = snapshot.particle_count;
	const vector = (item: unknown): boolean => Array.isArray(item) && item.length === 3
		&& item.every(component => typeof component === 'number' && Number.isFinite(component));
	return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
		&& typeof snapshot.step === 'number' && Number.isSafeInteger(snapshot.step) && snapshot.step >= 0
		&& typeof snapshot.dt === 'number' && Number.isFinite(snapshot.dt) && snapshot.dt > 0
		&& typeof snapshot.time === 'number' && Number.isFinite(snapshot.time) && snapshot.time >= 0
		&& typeof snapshot.cell_count === 'number' && Number.isSafeInteger(snapshot.cell_count) && snapshot.cell_count > 0
		&& Array.isArray(snapshot.positions) && snapshot.positions.length === count && snapshot.positions.every(vector)
		&& Array.isArray(snapshot.velocities) && snapshot.velocities.length === count && snapshot.velocities.every(vector)
		&& Array.isArray(snapshot.species) && snapshot.species.length === count
		&& snapshot.species.every(species => Number.isSafeInteger(species) && species >= 0);
}

export function error_message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function snapshot_statistics(snapshot: SimulationSnapshot): {
	mean_speed?: number; rms_speed?: number; species: { index: number; count: number }[];
} {
	let speed = 0;
	let square_speed = 0;
	const counts = new Map<number, number>();
	for (let index = 0; index < snapshot.particle_count; index++) {
		const velocity = snapshot.velocities[index];
		const squared = velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2;
		speed += Math.sqrt(squared);
		square_speed += squared;
		const species = snapshot.species[index];
		counts.set(species, (counts.get(species) ?? 0) + 1);
	}
	return {
		mean_speed: snapshot.particle_count ? speed / snapshot.particle_count : undefined,
		rms_speed: snapshot.particle_count ? Math.sqrt(square_speed / snapshot.particle_count) : undefined,
		species: [...counts].sort(([left], [right]) => left - right).map(([index, count]) => ({ index, count }))
	};
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
