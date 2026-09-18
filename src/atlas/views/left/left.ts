import type { CaseProject } from '../../project/case_project';
import type { Streaming } from '../../streaming/streaming';
import { ViewContainer } from '../view_container';
import { Assets } from './assets';
import { Boundaries } from './boundaries';
import { Domain } from './domain';
import { Geometry } from './geometry';
import { Materials } from './materials';
import { Output } from './output';
import { Sinks } from './sinks';
import { Solvers } from './solvers';
import { Sources } from './sources';

export class Left extends ViewContainer {
	constructor(project: CaseProject, streaming: Streaming) {
		super('atlas-engine', 'ATLAS', 'activitybar', [
			new Domain(project, streaming),
			new Assets(project, streaming),
			new Materials(project, streaming),
			new Geometry(project, streaming),
			new Sources(project, streaming),
			new Boundaries(project, streaming),
			new Sinks(project, streaming),
			new Solvers(project, streaming),
			new Output(project, streaming)
		]);
	}
}
