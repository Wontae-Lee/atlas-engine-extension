import type * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import type { AssetRecord } from './project_types';

export class AssetStore {
	private api!: typeof vscode;

	initialize(api: typeof vscode): void {
		this.api = api;
	}

	async import_asset(): Promise<AssetRecord | undefined> {
		const workspace = await this.select_workspace();
		if (!workspace) {
			return undefined;
		}
		const source = await this.select_source();
		if (!source) {
			return undefined;
		}
		await this.read_source(source);
		const directory = this.api.Uri.joinPath(workspace, 'assets', 'geometry');
		await this.api.workspace.fs.createDirectory(directory);
		const filename = posix.parse(source.path);
		for (let suffix = 0; ; suffix++) {
			const name = `${filename.name}${suffix === 0 ? '' : `_${suffix}`}${filename.ext}`;
			const target = this.api.Uri.joinPath(directory, name);
			try {
				await this.api.workspace.fs.copy(source, target, { overwrite: false });
				return {
					id: randomUUID(),
					name,
					path: posix.join('assets', 'geometry', name),
					workspace_uri: workspace.toString()
				};
			} catch (error) {
				if (!(error instanceof this.api.FileSystemError) || error.code !== 'FileExists') {
					throw error;
				}
			}
		}
	}

	async read_asset(asset: AssetRecord): Promise<string> {
		const data = await this.read_source(this.asset_uri(asset));
		return Buffer.from(data).toString('utf8');
	}

	async status(asset: AssetRecord): Promise<'ready' | 'missing'> {
		try {
			const stat = await this.api.workspace.fs.stat(this.asset_uri(asset));
			return (stat.type & this.api.FileType.File) !== 0 ? 'ready' : 'missing';
		} catch (error) {
			if (error instanceof this.api.FileSystemError && error.code === 'FileNotFound') {
				return 'missing';
			}
			throw error;
		}
	}

	async reveal_asset(asset: AssetRecord): Promise<void> {
		await this.api.commands.executeCommand('revealInExplorer', this.asset_uri(asset));
	}

	async replace_asset(asset: AssetRecord): Promise<AssetRecord | undefined> {
		const target = this.asset_uri(asset);
		const source = await this.select_source();
		if (!source) {
			return undefined;
		}
		const data = await this.read_source(source);
		const choice = await this.api.window.showWarningMessage(
			`Replace ${asset.path}? Geometry references to this asset will use the replacement file.`,
			{ modal: true },
			'Replace File'
		);
		if (choice !== 'Replace File') {
			return undefined;
		}
		await this.api.workspace.fs.createDirectory(this.api.Uri.joinPath(target, '..'));
		await this.api.workspace.fs.writeFile(target, data);
		return { ...asset };
	}

	private async select_workspace(): Promise<vscode.Uri | undefined> {
		const folders = this.api.workspace.workspaceFolders ?? [];
		if (folders.length === 0) {
			await this.api.window.showWarningMessage('Open a workspace folder before importing an Atlas asset.');
			return undefined;
		}
		if (folders.length === 1) {
			return folders[0].uri;
		}
		return (await this.api.window.showWorkspaceFolderPick({
			placeHolder: 'Choose the Atlas project that will own this mesh asset'
		}))?.uri;
	}

	private async select_source(): Promise<vscode.Uri | undefined> {
		const selection = await this.api.window.showOpenDialog({
			title: 'Select Atlas Mesh Asset',
			openLabel: 'Import Mesh',
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: { 'Wavefront OBJ': ['obj'] }
		});
		return selection?.[0];
	}

	private async read_source(uri: vscode.Uri): Promise<Uint8Array> {
		if (posix.extname(uri.path).toLowerCase() !== '.obj') {
			throw new Error('Atlas mesh assets must be Wavefront OBJ files.');
		}
		const data = await this.api.workspace.fs.readFile(uri);
		if (Buffer.from(data).toString('utf8').trim().length === 0) {
			throw new Error('The selected OBJ file is empty.');
		}
		return data;
	}

	private asset_uri(asset: AssetRecord): vscode.Uri {
		if (posix.isAbsolute(asset.path) || asset.path.includes('\\')
			|| asset.path.split('/').some(part => part === '..' || part === '.' || part.length === 0)) {
			throw new Error('Atlas assets must use paths relative to their workspace folder.');
		}
		if (posix.extname(asset.path).toLowerCase() !== '.obj') {
			throw new Error('Atlas mesh assets must be Wavefront OBJ files.');
		}
		const workspace = this.api.workspace.workspaceFolders?.find(
			folder => folder.uri.toString() === asset.workspace_uri
		);
		if (!workspace) {
			throw new Error('The workspace folder containing this Atlas asset is not open.');
		}
		return this.api.Uri.joinPath(workspace.uri, asset.path);
	}
}
