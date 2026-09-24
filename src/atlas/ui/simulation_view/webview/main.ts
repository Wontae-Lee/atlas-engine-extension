import {draw_conditions} from './condition_renderer';
import type {SimulationViewModel} from '../simulation_view_model';

declare function acquireVsCodeApi(): {postMessage(message: unknown): void};

const vscode = acquireVsCodeApi();
const canvas = document.getElementById('conditions') as HTMLCanvasElement;
const summary = document.getElementById('summary') as HTMLDivElement;
let model: SimulationViewModel | undefined;

document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(button => {
    button.addEventListener('click', () => vscode.postMessage({type: 'action', action: button.dataset.action}));
});
window.addEventListener('message', event => {
    if (event.data?.type !== 'model') {
        return;
    }
    model = event.data.model;
    summary.textContent = model
        ? `Revision ${model.revision} · ${model.session?.state ?? 'No session'} · Step ${model.session?.step ?? 0}${model.session?.stale ? ' · Apply changes' : ''}`
        : 'Open or create an Atlas project.';
    draw_conditions(canvas, model);
});
window.addEventListener('resize', () => draw_conditions(canvas, model));
vscode.postMessage({type: 'ready'});
