import type {Readable, Writable} from 'node:stream';
import type {EngineRequest, EngineResponse} from './protocol';

interface PendingRequest {
    resolve: (value: EngineResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
    signal?: AbortSignal;
    abort?: () => void;
}

export class JsonlChannel {
    private next_id = 0;
    private buffer = '';
    private failure?: Error;
    private readonly pending = new Map<string, PendingRequest>();
    private readonly retired = new Set<string>();

    constructor(private readonly output: Readable, private readonly input: Writable,
                private readonly on_failure: (error: Error) => void) {
        output.setEncoding('utf8');
        output.on('data', (chunk: string) => this.read(chunk));
        output.on('error', error => this.fail(error));
        output.on('end', () => this.fail(new Error('Atlas Interactive closed protocol stdout.')));
        input.on('error', error => this.fail(error));
    }

    request(command: EngineRequest['command'], payload?: EngineRequest['payload'],
            session_id?: number, signal?: AbortSignal): Promise<EngineResponse> {
        if (this.failure) {
            return Promise.reject(this.failure);
        }
        if (signal?.aborted) {
            return Promise.reject(new Error('Request cancelled.'));
        }
        const request_id = String(++this.next_id);
        const request: EngineRequest = {request_id, command};
        if (session_id !== undefined) {
            request.session_id = session_id;
        }
        if (payload !== undefined) {
            request.payload = payload;
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.fail(new Error(`Atlas ${command} timed out.`)), 60_000);
            const pending: PendingRequest = {resolve, reject, timer, signal};
            if (signal) {
                pending.abort = () => this.retire(request_id, new Error('Request cancelled.'));
                signal.addEventListener('abort', pending.abort, {once: true});
            }
            this.pending.set(request_id, pending);
            try {
                this.input.write(`${JSON.stringify(request)}\n`);
            } catch (error) {
                this.fail(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    dispose(error = new Error('Atlas Interactive connection closed.')): void {
        if (this.failure) {
            return;
        }
        this.failure = error;
        for (const [id, request] of this.pending) {
            this.clear(request);
            request.reject(error);
            this.pending.delete(id);
        }
    }

    private read(chunk: string): void {
        this.buffer += chunk;
        let end = this.buffer.indexOf('\n');
        while (end >= 0) {
            const line = this.buffer.slice(0, end).trim();
            this.buffer = this.buffer.slice(end + 1);
            if (line) {
                try {
                    const response: unknown = JSON.parse(line);
                    if (!response || typeof response !== 'object' ||
                        typeof (response as EngineResponse).request_id !== 'string' ||
                        !(response as EngineResponse).request_id ||
                        typeof (response as EngineResponse).success !== 'boolean') {
                        throw new Error('Invalid Atlas Interactive response.');
                    }
                    const decoded = response as EngineResponse;
                    if (decoded.error !== undefined && typeof decoded.error !== 'string' ||
                        decoded.message !== undefined && typeof decoded.message !== 'string' ||
                        decoded.session_id !== undefined &&
                        (!Number.isSafeInteger(decoded.session_id) || decoded.session_id < 1)) {
                        throw new Error('Invalid Atlas Interactive response fields.');
                    }
                    if (decoded.status !== undefined && (!decoded.status ||
                        typeof decoded.status !== 'object' || Array.isArray(decoded.status) ||
                        typeof decoded.status.state !== 'string' ||
                        !Number.isSafeInteger(decoded.status.step) ||
                        !Number.isFinite(decoded.status.simulation_time) ||
                        !Number.isSafeInteger(decoded.status.particle_count) ||
                        !Number.isSafeInteger(decoded.status.source_count) ||
                        !Number.isSafeInteger(decoded.status.sink_count))) {
                        throw new Error('Invalid Atlas Interactive session status.');
                    }
                    const pending = this.pending.get(decoded.request_id);
                    if (pending) {
                        this.pending.delete(decoded.request_id);
                        this.clear(pending);
                        pending.resolve(decoded);
                    } else if (!this.retired.delete(decoded.request_id)) {
                        throw new Error(`Unexpected Atlas request_id: ${decoded.request_id}`);
                    }
                } catch (error) {
                    this.fail(error instanceof Error ? error : new Error(String(error)));
                    return;
                }
            }
            end = this.buffer.indexOf('\n');
        }
    }

    private retire(id: string, error: Error): void {
        const pending = this.pending.get(id);
        if (!pending) {
            return;
        }
        this.pending.delete(id);
        this.retired.add(id);
        this.clear(pending);
        pending.reject(error);
    }

    private clear(request: PendingRequest): void {
        clearTimeout(request.timer);
        if (request.signal && request.abort) {
            request.signal.removeEventListener('abort', request.abort);
        }
    }

    private fail(error: Error): void {
        if (this.failure) {
            return;
        }
        this.dispose(error);
        this.on_failure(error);
    }
}
