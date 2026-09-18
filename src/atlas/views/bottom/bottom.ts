import { PanelContainer } from '../panel_container';
import { Logs } from './logs';

export class Bottom {
	readonly containers: readonly PanelContainer[] = [
		new Logs()
	].map(view => new PanelContainer(view));
}
