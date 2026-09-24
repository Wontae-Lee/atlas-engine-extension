import type {ProjectState} from './project_types';

export class Project {
    private state: ProjectState;
    private current_revision = 0;
    private readonly listeners = new Set<() => void>();

    constructor(initial: ProjectState) { this.state = structuredClone(initial); }

    get revision(): number { return this.current_revision; }
    get_state(): ProjectState { return structuredClone(this.state); }

    commit(candidate: ProjectState): void {
        this.state = structuredClone(candidate);
        this.current_revision++;
        for (const listener of this.listeners) {
            listener();
        }
    }

    on_change(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}
