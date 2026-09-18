import { ViewContainer } from '../view_container';
import type { CaseProject } from '../../project/case_project';
import type { Streaming } from '../../streaming/streaming';
import { SimulationStatus } from './simulation_status';

export class Right extends ViewContainer {
	constructor(project: CaseProject, streaming: Streaming) {
		super('atlas-engine-inspector', 'SIMULATION STATUS', 'secondarySidebar', [
			new SimulationStatus(project, streaming)
		]);
	}
}
