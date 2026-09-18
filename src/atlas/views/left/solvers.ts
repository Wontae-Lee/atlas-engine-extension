import type { CaseProject } from '../../project/case_project';
import type { Streaming } from '../../streaming/streaming';
import { ProjectView } from '../project_view';

export class Solvers extends ProjectView {
	constructor(project: CaseProject, streaming: Streaming) {
		super(project, streaming, 'solvers', 'SOLVERS');
	}
}
