import type * as vscode from 'vscode';
import type {CaseProject} from '../../project/case_project';
import type {Streaming} from '../../streaming/streaming';
import type {SceneAsset, SceneFrame} from './simulation_types';
import {SimulationView} from './simulation_view';

export class Scene extends SimulationView {
    private asset_revision = -1;
    private delivered_revision = -1;
    private assets: Promise<SceneAsset[]> = Promise.resolve([]);

    constructor(project: CaseProject, streaming: Streaming) {
        super('atlas-engine.scene', 'Simulation', project, streaming);
    }

    protected render(webview: vscode.Webview): string {
        return this.document(webview, 'scene', `<main class="scene">
<div class="view-tools"><button id="fit">Fit</button>
<label>Camera <select id="camera"><option value="iso">Isometric</option><option value="xy">XY</option><option value="xz">XZ</option><option value="yz">YZ</option></select></label>
<label><input id="domain" type="checkbox" checked>Domain</label>
<label><input id="geometry" type="checkbox" checked>Geometry</label>
<label><input id="particles" type="checkbox" checked>Particles</label></div>
<canvas id="scene" tabindex="0" aria-label="Simulation geometry and particles in 3D"></canvas>
<footer><span id="snapshot">Case preview</span><span>Drag: orbit · Shift/right drag: pan · Scroll: zoom</span></footer>
<p class="note">Geometry shows the configured initial pose; infinite planes use a finite dashed preview. Particle positions come from the engine.</p>
<p id="scene-errors" role="status" hidden></p><div id="legend" class="legend"></div></main>`);
    }

    protected async data(): Promise<SceneFrame> {
        const status = this.status();
        const project = this.project.get_state();
        if (this.asset_revision !== status.revision) {
            this.asset_revision = status.revision;
            const referenced = new Set(project.geometry.filter(entry => entry.kind === 'triangle_mesh').map(entry => entry.fields.asset_id));
            this.assets = Promise.all(project.assets.filter(asset => referenced.has(asset.id)).map(async asset => {
                try {
                    return {id: asset.id, content: await this.project.assets.read_asset(asset)};
                } catch (error) {
                    return {
                        id: asset.id,
                        error: `${asset.name}: ${error instanceof Error ? error.message : String(error)}`
                    };
                }
            }));
        }
        const snapshot = status.applied ? this.streaming.last_snapshot : undefined;
        return {
            type: 'scene', status, project,
            assets: this.delivered_revision === status.revision ? undefined : await this.assets,
            snapshot: snapshot ? {
                step: snapshot.step, time: snapshot.time, particle_count: snapshot.particle_count,
                positions: snapshot.positions, species: snapshot.species
            } : undefined
        };
    }

    protected client_ready(): void {
        this.delivered_revision = -1;
    }

    protected async handle_message(message: unknown): Promise<void> {
        if (typeof message === 'object' && message !== null && 'type' in message
            && message.type === 'scene_loaded' && 'revision' in message && message.revision === this.project.revision) {
            this.delivered_revision = message.revision;
            return;
        }
        await super.handle_message(message);
    }
}
