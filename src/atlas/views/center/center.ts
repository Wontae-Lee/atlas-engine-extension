import type { EditorView } from '../editor_view';
import { Scene } from './scene';
import { Results } from './results';

export class Center {
	readonly views: readonly EditorView[] = [new Scene(), new Results()];
}
