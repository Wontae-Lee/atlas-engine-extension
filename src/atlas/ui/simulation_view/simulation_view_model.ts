import type {ProjectState} from '../../project/project_types';
import type {JsonObject, JsonValue} from '../../engine/protocol';

export interface ConditionShape {
    role: 'emitter' | 'collider' | 'sink' | 'geometry';
    geometry: JsonObject;
    translation?: JsonValue;
    flow?: JsonValue;
}

export interface SimulationViewModel {
    bounds?: JsonObject;
    shapes: ConditionShape[];
    revision: number;
    session?: {state: string; step: number; stale: boolean};
}

export function make_view_model(project: ProjectState, revision: number,
                                session?: SimulationViewModel['session']): SimulationViewModel {
    const simulation = project.simulation;
    const shapes: ConditionShape[] = [];
    const resolve = (unit: JsonObject, role: ConditionShape['role'], flow?: JsonValue) => {
        const reference = project.geometries.find(item => item.id === unit.geometry_id);
        const geometry = reference?.geometry ?? unit.geometry;
        if (geometry && typeof geometry === 'object' && !Array.isArray(geometry)) {
            shapes.push({role, geometry, translation: unit.translation, flow});
        }
    };
    for (const item of project.geometries) {
        shapes.push({role: 'geometry', geometry: item.geometry});
    }
    for (const emitter of (simulation.emitters as JsonObject[] | undefined) ?? []) {
        const source = emitter.source as JsonObject;
        resolve(source.unit as JsonObject, 'emitter', (emitter.generator as JsonObject).bulk_velocity);
    }
    for (const collider of (simulation.colliders as JsonObject[] | undefined) ?? []) {
        resolve(collider.unit as JsonObject, 'collider');
    }
    for (const sink of (simulation.sinks as JsonObject[] | undefined) ?? []) {
        resolve(sink.unit as JsonObject, 'sink');
    }
    return {bounds: simulation.universe as JsonObject, shapes, revision, session};
}
