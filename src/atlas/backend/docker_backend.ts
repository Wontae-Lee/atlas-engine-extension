import { cancelled, error_message, is_container_removed, run } from '../detail/private_helpers';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { IMAGES, type BackendMode, type BackendConnection, type BackendTransport } from './backend_types';
import { ContainerConnection } from '../detail/container_connection';
import { DockerError } from '../detail/docker_error';
import { get_runtime_source } from '../streaming/runtime_source';

/** Docker operations never install drivers or pull CUDA without an explicit pull call. */
export class DockerBackend implements BackendTransport {
	/** @param executable Docker CLI path; tests can supply a local protocol fixture. */
	constructor(private readonly executable = 'docker', private readonly runtime_directory?: string) {}

	async check_docker(signal?: AbortSignal): Promise<void> {
		const server = await run(this.executable, ['info', '--format', '{{.OSType}} {{.Architecture}}'], signal);
		if (!/^linux (x86_64|amd64)$/.test(server)) {
			throw new Error(`Atlas images require a Linux x86-64 Docker server; this server reports ${server}.`);
		}
	}

	async has_image(mode: BackendMode, signal?: AbortSignal): Promise<boolean> {
		try {
			await run(this.executable, ['image', 'inspect', IMAGES[mode]], signal);
			return true;
		} catch (error) {
			if (error instanceof DockerError && /No such image|No such object/i.test(error.stderr)) {
				return false;
			}
			throw error;
		}
	}

	pull(mode: BackendMode, onOutput: (text: string) => void, signal?: AbortSignal): Promise<void> {
		return run(this.executable, ['pull', IMAGES[mode]], signal, onOutput, 30 * 60_000).then(() => {});
	}

	/**
	 * Test GPU access on the Docker server using the installed CPU image before CUDA download.
	 * The actual CUDA image subsequently validates its driver requirement and device kernel.
	 */
	async check_cuda(signal?: AbortSignal): Promise<string> {
		if (!await this.has_image('tbb', signal)) {
			throw new Error('Start the TBB backend first so its image can check Docker GPU access.');
		}
		const name = `atlas-engine-gpu-check-${randomUUID()}`;
		let report: string;
		try {
			report = await run(this.executable, [
				'run', '--rm', '--pull=never', '--name', name, '--gpus', 'all',
				'-e', 'NVIDIA_DRIVER_CAPABILITIES=compute,utility',
				'--entrypoint', 'nvidia-smi', IMAGES.tbb,
				'--query-gpu=name,driver_version,compute_cap', '--format=csv,noheader'
			], signal);
		} catch (error) {
			if (signal?.aborted) {
				throw error;
			}
			throw new Error(`CUDA is unavailable. Check the NVIDIA GPU, driver, and NVIDIA Container Toolkit on the Docker host. ${error_message(error)}`);
		} finally {
			await run(this.executable, ['rm', '--force', name]).catch(error => {
				if (!is_container_removed(error)) {
					throw error;
				}
			});
		}
		const devices = report.split('\n').filter(line => line.trim());
		const capability = Number(devices[0]?.split(',').at(-1)?.trim());
		if (!devices.length || !Number.isFinite(capability) || capability < 7.5) {
			throw new Error(`The first visible GPU requires compute capability 7.5 or newer for this Atlas image. Detected: ${report || 'no GPU'}`);
		}
		return report;
	}

	async open(mode: BackendMode, onOutput: (text: string) => void, signal?: AbortSignal): Promise<BackendConnection> {
		if (signal?.aborted) {
			throw cancelled();
		}
		const source = get_runtime_source(this.runtime_directory ?? join(__dirname, 'runtime'));
		const connection = new ContainerConnection(mode, this.executable, onOutput, source, signal);
		try {
			await connection.info(signal);
			return connection;
		} catch (error) {
			connection.dispose();
			throw error;
		}
	}
}
