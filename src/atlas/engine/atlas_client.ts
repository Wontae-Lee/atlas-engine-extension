import {JsonlChannel} from './jsonl_channel';
import type {JsonObject, SessionStatus, ValidationTarget} from './protocol';

export class AtlasClient {
    constructor(private readonly channel: JsonlChannel) {}

    async validate(target: ValidationTarget, config: JsonObject): Promise<void> {
        await this.request('validate', {target, config});
    }

    async create(config: JsonObject, output: JsonObject): Promise<number> {
        const response = await this.request('create', {config, output});
        if (!Number.isSafeInteger(response.session_id)) {
            throw new Error('Atlas did not return a session ID.');
        }
        return response.session_id!;
    }

    start(id: number): Promise<void> { return this.request('start', undefined, id).then(() => {}); }
    pause(id: number): Promise<void> { return this.request('pause', undefined, id).then(() => {}); }
    step(id: number, count = 1): Promise<SessionStatus> {
        return this.request('step', {step_count: count}, id).then(response => this.require_status(response.status));
    }
    status(id: number): Promise<SessionStatus> {
        return this.request('status', undefined, id).then(response => this.require_status(response.status));
    }
    restart(id: number): Promise<void> { return this.request('restart', undefined, id).then(() => {}); }
    save(id: number, path: string): Promise<void> { return this.request('save', {path}, id).then(() => {}); }
    close(id: number): Promise<void> { return this.request('close', undefined, id).then(() => {}); }
    open_renderer(id: number): Promise<void> { return this.request('render_open', undefined, id).then(() => {}); }
    close_renderer(id: number): Promise<void> { return this.request('render_close', undefined, id).then(() => {}); }
    shutdown(): Promise<void> { return this.request('shutdown').then(() => {}); }

    private async request(command: Parameters<JsonlChannel['request']>[0], payload?: JsonObject, session_id?: number) {
        const response = await this.channel.request(command, payload, session_id);
        if (!response.success) {
            throw new Error(response.error ?? `Atlas ${command} failed.`);
        }
        return response;
    }

    private require_status(status?: SessionStatus): SessionStatus {
        if (!status) {
            throw new Error('Atlas response did not contain session status.');
        }
        return status;
    }
}
