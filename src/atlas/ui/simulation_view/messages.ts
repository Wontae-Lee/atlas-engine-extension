export type SimulationAction = 'apply' | 'start' | 'pause' | 'step' | 'restart' |
    'save' | 'render_open' | 'render_close' | 'status';

export function is_action(value: unknown): value is SimulationAction {
    return typeof value === 'string' && ['apply', 'start', 'pause', 'step', 'restart',
        'save', 'render_open', 'render_close', 'status'].includes(value);
}
