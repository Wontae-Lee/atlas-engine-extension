import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import type {BackendMode, EngineProcess} from './backend_types';
import {IMAGES} from './backend_types';

export class DockerRuntime {
    constructor(private readonly executable = 'docker') {}

    run(args: string[], on_output?: (text: string) => void): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn(this.executable, args, {windowsHide: true});
            let stdout = '';
            let stderr = '';
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', (text: string) => { stdout += text; on_output?.(text); });
            child.stderr.on('data', (text: string) => { stderr += text; on_output?.(text); });
            child.on('error', reject);
            child.on('close', code => code === 0 ? resolve(stdout.trim()) :
                reject(new Error(stderr.trim() || `Docker exited with code ${code}.`)));
        });
    }

    async has_image(mode: BackendMode): Promise<boolean> {
        try {
            await this.run(['image', 'inspect', IMAGES[mode]]);
            return true;
        } catch (error) {
            if (/No such image|No such object/i.test(String(error))) {
                return false;
            }
            throw error;
        }
    }

    async check_cuda(): Promise<string> {
        return this.run(['run', '--rm', '--pull=never', '--gpus', 'all',
            '--entrypoint', 'nvidia-smi', IMAGES.tbb,
            '--query-gpu=name,driver_version,compute_cap', '--format=csv,noheader']);
    }

    open(mode: BackendMode, project_root: string, on_output: (text: string) => void): EngineProcess {
        const name = `atlas-interactive-${randomUUID()}`;
        const args = ['run', '--rm', '-i', '--pull=never', '--name', name, '--network', 'none',
            '--mount', `type=bind,source=${project_root},target=/workspace`, '--workdir', '/workspace'];
        if (mode === 'cuda') {
            args.push('--gpus', 'all', '-e', 'NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics,display');
        }
        if (process.env.DISPLAY && existsSync('/tmp/.X11-unix')) {
            args.push('-e', `DISPLAY=${process.env.DISPLAY}`, '-v', '/tmp/.X11-unix:/tmp/.X11-unix:rw');
            if (process.env.XAUTHORITY && existsSync(process.env.XAUTHORITY)) {
                args.push('-e', 'XAUTHORITY=/tmp/.atlas-Xauthority', '-v',
                    `${process.env.XAUTHORITY}:/tmp/.atlas-Xauthority:ro`);
            }
        }
        args.push('--entrypoint', '/opt/atlas/bin/atlas-interactive', IMAGES[mode]);
        const child: ChildProcessWithoutNullStreams = spawn(this.executable, args, {
            windowsHide: true, stdio: 'pipe', cwd: project_root
        });
        const listeners = new Set<(error: Error) => void>();
        let closed = false;
        let failure: Error | undefined;
        let stderr = '';
        const finish = (error: Error) => {
            if (closed) {
                return;
            }
            closed = true;
            failure = error;
            for (const listener of listeners) {
                listener(error);
            }
            listeners.clear();
        };
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (text: string) => {
            stderr = (stderr + text).slice(-16_384);
            on_output(text);
        });
        child.on('error', error => finish(error));
        child.on('close', code => {
            finish(new Error(`Atlas Interactive exited (${code}): ${stderr.trim()}`));
            void this.run(['rm', '--force', name]).catch(() => {});
        });
        return {
            child,
            on_exit(listener) {
                if (failure) {
                    listener(failure);
                } else if (!closed) {
                    listeners.add(listener);
                }
                return () => listeners.delete(listener);
            },
            dispose: () => {
                if (closed) {
                    return;
                }
                finish(new Error('Atlas Interactive connection closed.'));
                child.stdin.end();
                child.kill();
                void this.run(['rm', '--force', name]).catch(() => {});
            }
        };
    }
}
