export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

export interface JsonObject {
    [key: string]: JsonValue;
}

export type ValidationTarget = 'material' | 'geometry' | 'unit' | 'fluid' | 'universe' |
    'solver' | 'source' | 'generator' | 'emitter' | 'collider' | 'sink' | 'codec' | 'simulation';

export type EngineCommand = 'validate' | 'create' | 'start' | 'pause' | 'step' | 'status' |
    'save' | 'restart' | 'close' | 'render_open' | 'render_close' | 'shutdown';

export interface EngineRequest {
    request_id: string;
    command: EngineCommand;
    session_id?: number;
    payload?: JsonObject;
}

export interface SessionStatus {
    state: string;
    step: number;
    simulation_time: number;
    particle_count: number;
    source_count: number;
    sink_count: number;
}

export interface EngineResponse {
    request_id: string;
    success: boolean;
    message?: string;
    error?: string;
    session_id?: number;
    status?: SessionStatus;
}
