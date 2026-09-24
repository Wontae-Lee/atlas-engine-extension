import {readFile} from 'node:fs/promises';
import type {JsonObject, JsonValue, ValidationTarget} from '../engine/protocol';
import {parse_obj} from './assets/obj_parser';
import {ProjectPaths} from './project_paths';
import type {ProjectState} from './project_types';

export class ConfigSerializer {
    constructor(private readonly paths: ProjectPaths) {}

    async serialize_simulation(project: ProjectState): Promise<JsonObject> {
        const convert = async (value: JsonValue): Promise<JsonValue> => {
            if (Array.isArray(value)) {
                return Promise.all(value.map(convert));
            }
            if (value === null || typeof value !== 'object') {
                return value;
            }
            const result: JsonObject = {};
            for (const [key, entry] of Object.entries(value)) {
                if (key === 'geometry_id') {
                    const geometry = project.geometries.find(item => item.id === entry);
                    if (!geometry) {
                        throw new Error(`Unknown geometry ID: ${entry}`);
                    }
                    result.geometry = await convert(geometry.geometry);
                } else if (key === 'asset_id' && value.type === 'triangle_mesh') {
                    const asset = project.assets.find(item => item.id === entry);
                    if (!asset) {
                        throw new Error(`Unknown asset ID: ${entry}`);
                    }
                    result.triangles = parse_obj(await readFile(this.paths.resolve_asset(asset.path), 'utf8'));
                } else {
                    result[key] = await convert(entry);
                }
            }
            return result;
        };
        return await convert(project.simulation) as JsonObject;
    }

    async serialize_target(project: ProjectState, path: (string | number)[]):
        Promise<{target: ValidationTarget; config: JsonObject}> {
        if (path[0] === 'geometries') {
            if (typeof path[1] !== 'number') {
                return {target: 'simulation', config: await this.serialize_simulation(project)};
            }
            const record = project.geometries[path[1] as number];
            if (!record) {
                throw new Error('Geometry no longer exists.');
            }
            const simulation = await this.serialize_simulation({
                ...project, simulation: {unit: {geometry_id: record.id}}
            });
            return {target: 'geometry', config: (simulation.unit as JsonObject).geometry as JsonObject};
        }
        const simulation = await this.serialize_simulation(project);
        const section = path[1];
        if (path[0] !== 'simulation' || section === 'dt') {
            return {target: 'simulation', config: simulation};
        }
        if (section === 'fluid') {
            if (path[2] === 'materials' && typeof path[3] === 'number') {
                const material = ((simulation.fluid as JsonObject).materials as JsonObject[])[path[3]];
                return {target: 'material', config: material};
            }
            return {target: 'fluid', config: simulation.fluid as JsonObject};
        }
        if (section === 'universe') {
            return {target: 'universe', config: simulation.universe as JsonObject};
        }
        if (section === 'solvers' && typeof path[2] === 'number') {
            return {target: 'solver', config: (simulation.solvers as JsonObject[])[path[2]]};
        }
        if (section === 'emitters' && typeof path[2] === 'number') {
            const emitter = (simulation.emitters as JsonObject[])[path[2]];
            return {target: 'emitter', config: {source: emitter.source, generator: emitter.generator,
                materials: ((simulation.fluid as JsonObject).materials ?? []) as JsonValue}};
        }
        if (section === 'colliders' && typeof path[2] === 'number') {
            return {target: 'collider', config: (simulation.colliders as JsonObject[])[path[2]]};
        }
        if (section === 'sinks' && typeof path[2] === 'number') {
            return {target: 'sink', config: (simulation.sinks as JsonObject[])[path[2]]};
        }
        if (section === 'codec') {
            return {target: 'codec', config: simulation.codec as JsonObject};
        }
        return {target: 'simulation', config: simulation};
    }
}
