import {PanelContainer} from '../panel_container';
import {Logs} from './logs';
import type {Streaming} from '../../streaming/streaming';

export class Bottom {
    readonly containers: readonly PanelContainer[];

    constructor(streaming: Streaming) {
        this.containers = [new PanelContainer(new Logs(streaming))];
    }
}
