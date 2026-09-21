import type {CaseProject} from '../../project/case_project';
import type {Streaming} from '../../streaming/streaming';
import type * as vscode from 'vscode';
import type {ViewAction} from '../view_types';
import type {ProjectView} from '../project_view';
import {ViewContainer} from '../view_container';
import {Assets} from './assets';
import {Boundaries} from './boundaries';
import {Domain} from './domain';
import {Geometry} from './geometry';
import {Materials} from './materials';
import {Output} from './output';
import {Sinks} from './sinks';
import {Solvers} from './solvers';
import {Sources} from './sources';

export class Left extends ViewContainer {
    declare readonly views: readonly ProjectView[];

    constructor(project: CaseProject, streaming: Streaming) {
        super('atlas-engine', 'ATLAS', 'activitybar', [
            new Domain(project),
            new Assets(project),
            new Materials(project),
            new Geometry(project),
            new Sources(project),
            new Boundaries(project),
            new Sinks(project),
            new Solvers(project),
            new Output(project, streaming)
        ]);
    }

    execute(api: typeof vscode, action: ViewAction): Promise<void> {
        const view = this.views.find(candidate => candidate.section === action.section);
        if (!view) {
            throw new Error(`Unknown sidebar section: ${action.section}`);
        }
        return view.execute(api, action);
    }
}
