import type * as vscode from 'vscode';
import type {CaseProject} from '../../project/case_project';
import type {ProjectState} from '../../project/project_types';
import type {Streaming} from '../../streaming/streaming';
import {snapshot_statistics} from '../../detail/private_helpers';
import type {FieldDefinition, ViewAction, ViewItem} from '../view_types';
import {ProjectView} from '../project_view';

export const OUTPUT_FIELDS: readonly FieldDefinition[] = [
    {key: 'enabled', label: 'CSV observer enabled', type: 'boolean'},
    {key: 'interval', label: 'Sampling interval', type: 'integer', min: 1, max: 2147483647, unit: 'steps'},
    {key: 'output_directory', label: 'Directory in container', type: 'text'}
];

export class Output extends ProjectView {
    constructor(project: CaseProject, private readonly streaming: Streaming) {
        super(project, 'output', 'OUTPUT');
    }

    async execute(api: typeof vscode, action: ViewAction): Promise<void> {
        if (action.action === 'export') {
            await this.export_snapshot(api, action.field);
            return;
        }
        if (action.action !== 'edit') {
            throw new Error('Unsupported OUTPUT action.');
        }
        await this.edit_field(api, action, OUTPUT_FIELDS, this.project.get_state().output, (state, key, value) => {
            Object.assign(state.output, {[key]: value});
        });
    }

    protected items(state: ProjectState): ViewItem[] {
        const available = this.streaming.last_snapshot !== undefined;
        return [
            ...this.field_rows(OUTPUT_FIELDS, state.output, state),
            this.info_row('storage', 'Observer CSV files stay in the backend container', undefined, 'Files are removed when the backend container is closed.'),
            this.action_row('Export Particle Snapshot CSV', {
                action: 'export',
                field: 'particles'
            }, 'export', available),
            this.action_row('Export Snapshot Statistics CSV', {
                action: 'export',
                field: 'statistics'
            }, 'export', available)
        ];
    }

    private async export_snapshot(api: typeof vscode, kind: string | undefined): Promise<void> {
        if (kind !== 'particles' && kind !== 'statistics') {
            throw new Error('Unsupported export type.');
        }
        const snapshot = this.streaming.last_snapshot;
        if (!snapshot) {
            throw new Error('No simulation snapshot is available to export.');
        }
        const destination = await api.window.showSaveDialog({
            title: `Export ${kind} at step ${snapshot.step}`, saveLabel: 'Export CSV', filters: {CSV: ['csv']}
        });
        if (!destination) {
            return;
        }
        let lines: string[];
        if (kind === 'particles') {
            lines = ['step,time_s,particle,species,x_m,y_m,z_m,vx_m_s,vy_m_s,vz_m_s'];
            for (let index = 0; index < snapshot.particle_count; index++) {
                lines.push([snapshot.step, snapshot.time, index, snapshot.species[index],
                    ...snapshot.positions[index], ...snapshot.velocities[index]].join(','));
            }
        } else {
            const statistics = snapshot_statistics(snapshot);
            lines = ['step,time_s,dt_s,particles,cells,mean_speed_m_s,rms_speed_m_s,species,species_particles'];
            const totals = [snapshot.step, snapshot.time, snapshot.dt, snapshot.particle_count,
                snapshot.cell_count, statistics.mean_speed ?? '', statistics.rms_speed ?? ''];
            if (statistics.species.length) {
                for (const species of statistics.species) {
                    lines.push([...totals, species.index, species.count].join(','));
                }
            } else {
                lines.push([...totals, '', ''].join(','));
            }
        }
        await api.workspace.fs.writeFile(destination, Buffer.from(`${lines.join('\n')}\n`, 'utf8'));
    }
}
