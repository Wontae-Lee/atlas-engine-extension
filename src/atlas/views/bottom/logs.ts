import type * as vscode from 'vscode';
import type {Streaming} from '../../streaming/streaming';
import type {SimulationSnapshot, StreamingState} from '../../streaming/streaming_types';
import {View} from '../view';

export class Logs extends View {
    private readonly entries: vscode.TreeItem[] = [];
    private readonly subscriptions: (() => void)[] = [];
    private progress_time = 0;
    private sequence = 0;

    constructor(private readonly streaming: Streaming) {
        super('atlas-engine.logs', 'SIMULATION LOG');
    }

    initialize(api: typeof vscode): void {
        super.initialize(api);
        this.record_state(this.streaming.state, this.streaming.last_error);
        if (this.streaming.last_snapshot) {
            this.record_snapshot(this.streaming.last_snapshot);
        }
        this.subscriptions.push(
            this.streaming.on_state((state, error) => this.record_state(state, error)),
            this.streaming.on_snapshot(snapshot => this.record_snapshot(snapshot))
        );
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        return element ? [] : [...this.entries].reverse();
    }

    dispose(): void {
        for (const unsubscribe of this.subscriptions.splice(0)) {
            unsubscribe();
        }
        this.entries.length = 0;
        super.dispose();
    }

    private record_state(state: StreamingState, error?: Error): void {
        const labels: Record<StreamingState, string> = {
            empty: 'Backend connected; no simulation initialized',
            ready: 'Simulation ready', running: 'Simulation started', paused: 'Simulation paused',
            disconnected: 'Backend disconnected', error: 'Simulation error', disposed: 'Simulation disposed'
        };
        this.append(labels[state], error?.message, error ? 'error' : 'info');
        if (state === 'empty' || state === 'disconnected') {
            this.progress_time = 0;
        }
    }

    private record_snapshot(snapshot: SimulationSnapshot): void {
        const now = Date.now();
        if (this.streaming.state === 'running' && snapshot.step !== 0 && now - this.progress_time < 1000) {
            return;
        }
        this.progress_time = now;
        this.append(`Step ${snapshot.step} · ${snapshot.particle_count.toLocaleString()} particles`,
            `Simulation time: ${snapshot.time} s · Cells: ${snapshot.cell_count.toLocaleString()}`, 'pulse');
    }

    private append(label: string, detail: string | undefined, icon: string): void {
        const timestamp = new Date().toISOString();
        this.entries.push({
            id: `${this.id}:${this.sequence++}`, label,
            description: `${timestamp.slice(11, 23)} UTC${detail ? ` · ${detail}` : ''}`,
            tooltip: `${timestamp}\n${label}${detail ? `\n${detail}` : ''}`,
            iconPath: new this.api.ThemeIcon(icon)
        });
        if (this.entries.length > 300) {
            this.entries.shift();
        }
        super.update();
    }
}
