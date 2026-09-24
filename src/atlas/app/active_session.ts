import type {SessionStatus} from '../engine/protocol';

export interface ActiveSession {
    id: number;
    applied_revision: number;
    status?: SessionStatus;
}
