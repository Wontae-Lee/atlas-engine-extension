import { ViewContainer } from '../view_container';
import { Inspector } from './inspector';
import { Properties } from './properties';
import { Selection } from './selection';

export class Right extends ViewContainer {
	constructor() {
		super('atlas-engine-inspector', 'ATLAS INSPECTOR', 'secondarySidebar', [
			new Inspector(),
			new Selection(),
			new Properties()
		]);
	}
}
