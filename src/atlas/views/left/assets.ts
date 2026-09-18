import type * as vscode from 'vscode';
import type { CaseProject } from '../../project/case_project';
import type { AssetRecord, ProjectState } from '../../project/project_types';
import { ProjectView } from '../project_view';
import type { ViewAction, ViewItem } from '../view_types';

export class Assets extends ProjectView {
	constructor(project: CaseProject) {
		super(project, 'assets', 'ASSETS');
	}

	protected async items(state: ProjectState): Promise<ViewItem[]> {
		return [
			this.group('meshes', 'Meshes', await Promise.all(state.assets.map(asset => this.asset_row(asset, state))), 'files'),
			this.action_row('Import Mesh Asset', { action: 'add' }, 'add')
		];
	}

	async execute(api: typeof vscode, action: ViewAction): Promise<void> {
		if (action.action === 'add') {
			const asset = await this.project.assets.import_asset();
			if (asset) {
				await this.project.change(state => { state.assets.push(asset); });
			}
			return;
		}
		const asset = this.project.get_state().assets.find(item => item.id === action.id);
		if (!asset) {
			throw new Error('Asset no longer exists.');
		}
		if (action.action === 'reveal') {
			await this.project.assets.reveal_asset(asset);
		} else if (action.action === 'replace') {
			const replacement = await this.project.assets.replace_asset(asset);
			if (replacement) {
				await this.project.change(state => {
					state.assets = state.assets.map(item => item.id === asset.id ? replacement : item);
				});
			}
		} else if (action.action === 'remove') {
			if (await api.window.showWarningMessage(`Remove ${asset.name} from Assets? The file will remain on disk.`,
				{ modal: true }, 'Remove') === 'Remove') {
				await this.project.change(state => { state.assets = state.assets.filter(item => item.id !== asset.id); });
			}
		}
	}

	private async asset_row(asset: AssetRecord, state: ProjectState): Promise<ViewItem> {
		const status = await this.asset_status(asset);
		const children = [
			this.info_row(`${asset.id}:path`, 'Project path', asset.path),
			this.info_row(`${asset.id}:type`, 'Type', 'Wavefront OBJ'),
			this.info_row(`${asset.id}:status`, 'Status', status),
			...this.used_by(asset.id, state),
			this.action_row('Replace File', { action: 'replace', id: asset.id }, 'replace-all'),
			this.action_row('Reveal in Explorer', { action: 'reveal', id: asset.id }, 'go-to-file'),
			this.action_row('Remove Asset', { action: 'remove', id: asset.id }, 'trash')
		];
		const item = this.group(asset.id, asset.name, children, status === 'Ready' ? 'file-media' : 'warning');
		item.description = status === 'Ready' ? asset.path : status;
		item.tooltip = `${asset.path}\n${status}`;
		return item;
	}
}
