import type {EditorView} from '../editor_view';
import {Scene} from './scene';
import type {CaseProject} from '../../project/case_project';
import type {Streaming} from '../../streaming/streaming';

export class Center {
    readonly views: readonly EditorView[];

    constructor(project: CaseProject, streaming: Streaming) {
        this.views = [new Scene(project, streaming)];
    }
}
