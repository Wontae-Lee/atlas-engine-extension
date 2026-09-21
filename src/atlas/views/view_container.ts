import type {View} from './view';

export abstract class ViewContainer {
    readonly icon = 'media/atlas-engine-logo.svg';

    protected constructor(
        public readonly id: string,
        public readonly title: string,
        public readonly location: 'activitybar' | 'secondarySidebar' | 'panel',
        public readonly views: readonly View[]
    ) {
    }
}
