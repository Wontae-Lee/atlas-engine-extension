import { EditorView } from '../../src/atlas/views/editor_view';

export class TestEditorView extends EditorView {
	value: unknown = { step: 0 };
	read_count = 0;
	render_count = 0;
	read?: () => unknown | Promise<unknown>;
	readonly received: unknown[] = [];
	action?: (message: unknown) => Promise<void>;

	constructor() {
		super('atlas-engine.test', 'Test');
	}

	protected render(): string {
		this.render_count++;
		return '<!DOCTYPE html><html><body>Test editor</body></html>';
	}

	protected data(): unknown | Promise<unknown> {
		this.read_count++;
		return this.read ? this.read() : this.value;
	}

	protected async handle_message(message: unknown): Promise<void> {
		this.received.push(message);
		await this.action?.(message);
	}
}
