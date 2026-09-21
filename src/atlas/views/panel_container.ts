import type {View} from './view';
import {ViewContainer} from './view_container';

export class PanelContainer extends ViewContainer {
    constructor(view: View) {
        super(view.id.replaceAll('.', '-'), view.title, 'panel', [view]);
    }
}
