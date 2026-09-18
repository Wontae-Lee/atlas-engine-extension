import type { SceneFrame } from '../simulation_types';
import { SceneRenderer } from './scene_renderer';
import { SimulationPage } from './simulation_page';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new SceneRenderer(canvas);
const page = new SimulationPage(message => {
	if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'scene') { return; }
	const frame = message as SceneFrame;
	page.update_status(frame.status);
	renderer.set_frame(frame);
	if (frame.assets) { page.send({ type: 'scene_loaded', revision: frame.status.revision }); }
	const snapshot = frame.snapshot;
	document.getElementById('snapshot')!.textContent = snapshot
		? `Step ${snapshot.step.toLocaleString()} · ${snapshot.time.toPrecision(5)} s · ${snapshot.particle_count.toLocaleString()} particles`
			+ (snapshot.positions.length < snapshot.particle_count ? ` · showing ${snapshot.positions.length.toLocaleString()} sampled particles` : '')
		: 'Case preview · No particle snapshot for the current settings';
	const errors = document.getElementById('scene-errors')!;
	errors.textContent = renderer.errors.join('\n');
	errors.hidden = renderer.errors.length === 0;
	const legend = document.getElementById('legend')!;
	legend.replaceChildren(...frame.project.materials.map((material, index) => {
		const item = document.createElement('span');
		item.className = `species-color-${index % 8}`;
		item.textContent = `● ${material.name}`;
		return item;
	}));
});

document.getElementById('fit')!.addEventListener('click', () => renderer.fit());
document.getElementById('camera')!.addEventListener('change', event => {
	renderer.set_camera((event.target as HTMLSelectElement).value as 'iso' | 'xy' | 'xz' | 'yz');
});
for (const layer of ['domain', 'geometry', 'particles'] as const) {
	document.getElementById(layer)!.addEventListener('change', event => {
		renderer.set_visibility(layer, (event.target as HTMLInputElement).checked);
	});
}
window.addEventListener('unload', () => { renderer.dispose(); page.dispose(); });
