import type * as vscode from 'vscode';
import type { View } from './view';
import type { EditorView } from './editor_view';
import type { ViewContainer } from './view_container';
import { Left } from './left/left';
import { Right } from './right/right';
import { Bottom } from './bottom/bottom';
import { Center } from './center/center';
import type { CaseProject } from '../project/case_project';
import type { Streaming } from '../streaming/streaming';

export class Layout implements vscode.Disposable {
	private disposed = false;
	readonly left: Left;
	readonly right: Right;
	readonly bottom: Bottom;
	readonly center: Center;

	constructor(project: CaseProject, streaming: Streaming) {
		this.left = new Left(project, streaming);
		this.right = new Right(project, streaming);
		this.bottom = new Bottom(streaming);
		this.center = new Center(project, streaming);
	}

	get containers(): readonly ViewContainer[] {
		return [this.left, this.right, ...this.bottom.containers];
	}

	get views(): readonly (View | EditorView)[] {
		return [...this.containers.flatMap(container => container.views), ...this.center.views];
	}

	initialize(api: typeof vscode, extension_uri?: vscode.Uri): void {
		for (const view of this.containers.flatMap(container => container.views)) {
			view.initialize(api);
		}
		for (const view of this.center.views) { view.initialize(api, extension_uri); }
	}

	update(): void {
		for (const view of this.views) {
			view.update();
		}
	}

	async show(api: typeof vscode): Promise<void> {
		const editor_ids = new Set(this.center.views.map(view => view.id));
		editor_ids.add('atlas-engine.results');
		const old_tabs = api.window.tabGroups.all.flatMap(group => group.tabs).filter(tab =>
			(tab.input instanceof api.TabInputText && editor_ids.has(tab.input.uri.scheme))
			|| (tab.input instanceof api.TabInputWebview && tab.input.viewType === 'atlas-engine.results'));
		if (old_tabs.length) { await api.window.tabGroups.close(old_tabs); }
		for (const container of [this.left, this.right, this.bottom.containers[0]]) {
			if (this.disposed) {
				return;
			}
			await api.commands.executeCommand(`workbench.view.extension.${container.id}`);
		}
		for (const view of [...this.center.views].reverse()) {
			if (this.disposed) {
				return;
			}
			await view.show(api);
		}
	}

	dispose(): void {
		this.disposed = true;
		for (const view of [...this.views].reverse()) {
			view.dispose();
		}
	}
}
