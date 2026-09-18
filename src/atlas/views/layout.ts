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
	readonly bottom = new Bottom();
	readonly center = new Center();

	constructor(project: CaseProject, streaming: Streaming) {
		this.left = new Left(project, streaming);
		this.right = new Right(project, streaming);
	}

	get containers(): readonly ViewContainer[] {
		return [this.left, this.right, ...this.bottom.containers];
	}

	get views(): readonly (View | EditorView)[] {
		return [...this.containers.flatMap(container => container.views), ...this.center.views];
	}

	initialize(api: typeof vscode): void {
		for (const view of this.views) {
			view.initialize(api);
		}
	}

	update(): void {
		for (const view of this.views) {
			view.update();
		}
	}

	async show(api: typeof vscode): Promise<void> {
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
