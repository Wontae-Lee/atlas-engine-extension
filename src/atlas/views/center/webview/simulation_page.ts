import type {SimulationStatus} from '../simulation_types';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

export class SimulationPage {
    private readonly api = acquireVsCodeApi();
    private readonly abort = new AbortController();
    private local_error = '';
    private backend_error = '';

    constructor(on_frame: (message: unknown) => void) {
        window.addEventListener('message', event => {
            if (event.data?.type === 'error') {
                this.show_error(String(event.data.message));
            } else {
                on_frame(event.data);
            }
        }, {signal: this.abort.signal});
        for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
            button.addEventListener('click', () => {
                for (const control of document.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
                    control.disabled = true;
                }
                this.send({type: 'action', action: button.dataset.action});
            }, {signal: this.abort.signal});
        }
        this.send({type: 'ready'});
    }

    send(message: unknown): void {
        if (typeof message === 'object' && message !== null && 'type' in message
            && message.type === 'action') {
            this.show_error('');
        }
        this.api.postMessage(message);
    }

    update_status(status: SimulationStatus): void {
        document.getElementById('state')!.textContent = status.state.toUpperCase();
        document.getElementById('applied')!.textContent = status.applied ? 'Current case applied' : 'Case preview · Apply to Engine to run current settings';
        const idle = status.state === 'ready' || status.state === 'paused';
        const enabled: Record<string, boolean> = {
            apply: !['running', 'disconnected', 'disposed'].includes(status.state),
            start: idle && status.applied, step: idle && status.applied,
            reset: (idle || status.state === 'error') && status.applied,
            pause: status.state === 'running'
        };
        for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
            button.disabled = status.busy || !enabled[button.dataset.action!];
        }
        this.backend_error = status.error ?? '';
        this.render_error();
    }

    show_error(message: string): void {
        this.local_error = message;
        this.render_error();
    }

    dispose(): void {
        this.abort.abort();
    }

    private render_error(): void {
        const message = this.backend_error || this.local_error;
        const element = document.getElementById('error')!;
        element.textContent = message;
        element.hidden = !message;
    }
}
