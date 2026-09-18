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
	constructor() {
		super('atlas-engine', 'ATLAS', 'activitybar', [
			new Domain(),
			new Assets(),
			new Materials(),
			new Geometry(),
			new Sources(),
			new Boundaries(),
			new Sinks(),
			new Solvers(),
			new Output()
		]);
	}
}
