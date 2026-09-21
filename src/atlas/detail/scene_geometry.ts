import type {ProjectEntry} from '../project/project_types';
import type {Vector3} from '../streaming/streaming_types';
import type {SceneAsset} from '../views/center/simulation_types';

export interface SceneWireframe {
    vertices: Vector3[];
    edges: [number, number][];
    dashed?: boolean;
}

export function box_wireframe(lower: readonly number[], upper: readonly number[]): SceneWireframe {
    const vertices: Vector3[] = [];
    for (let corner = 0; corner < 8; corner++) {
        vertices.push([0, 1, 2].map(axis => corner & (1 << axis) ? upper[axis] : lower[axis]) as Vector3);
    }
    const edges: [number, number][] = [];
    for (let corner = 0; corner < 8; corner++) {
        for (let axis = 0; axis < 3; axis++) {
            if (!(corner & (1 << axis))) {
                edges.push([corner, corner | (1 << axis)]);
            }
        }
    }
    return {vertices, edges};
}

export function geometry_wireframe(entry: ProjectEntry, assets: readonly SceneAsset[], plane_extent: number): SceneWireframe {
    const fields = entry.fields;
    const vector = (key: string): Vector3 => {
        const value = fields[key];
        if (!Array.isArray(value) || value.length !== 3 || !value.every(component => typeof component === 'number' && Number.isFinite(component))) {
            throw new Error(`${key} must contain three finite coordinates.`);
        }
        return value as Vector3;
    };
    const scalar = (key: string, positive = true): number => {
        const value = fields[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0)) {
            throw new Error(`${key} must be a ${positive ? 'positive ' : ''}finite number.`);
        }
        return value;
    };
    let mesh: SceneWireframe = {vertices: [], edges: []};
    const loop = (points: Vector3[]): void => {
        const offset = mesh.vertices.length;
        mesh.vertices.push(...points);
        for (let index = 0; index < points.length; index++) {
            mesh.edges.push([offset + index, offset + (index + 1) % points.length]);
        }
    };
    const ring = (center: Vector3, tangent: Vector3, bitangent: Vector3, radius: number, count = 48): Vector3[] => {
        return Array.from({length: count}, (_, index) => {
            const angle = index * 2 * Math.PI / count;
            return center.map((value, axis) => value + radius * (Math.cos(angle) * tangent[axis] + Math.sin(angle) * bitangent[axis])) as Vector3;
        });
    };
    switch (entry.kind) {
        case 'sphere': {
            const center = vector('center');
            const radius = scalar('radius');
            for (let index = 0; index < 6; index++) {
                const angle = index * Math.PI / 6;
                loop(ring(center, [Math.cos(angle), Math.sin(angle), 0], [0, 0, 1], radius));
            }
            for (const latitude of [-Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3]) {
                loop(ring([center[0], center[1], center[2] + radius * Math.sin(latitude)], [1, 0, 0], [0, 1, 0], radius * Math.cos(latitude)));
            }
            break;
        }
        case 'box':
            mesh = box_wireframe(vector('lower'), vector('upper'));
            break;
        case 'cylinder':
        case 'polygonal_prism': {
            const center = vector('center');
            const radius = scalar('radius');
            const half_height = scalar('height') / 2;
            const count = entry.kind === 'cylinder' ? 48 : scalar('side_count');
            if (!Number.isInteger(count) || count < 3 || count > 4096) {
                throw new Error('Preview side count must be an integer between 3 and 4096.');
            }
            loop(ring([center[0], center[1], center[2] - half_height], [1, 0, 0], [0, 1, 0], radius, count));
            loop(ring([center[0], center[1], center[2] + half_height], [1, 0, 0], [0, 1, 0], radius, count));
            for (let index = 0; index < count; index += entry.kind === 'cylinder' ? 6 : 1) {
                mesh.edges.push([index, index + count]);
            }
            break;
        }
        case 'plane':
        case 'circle':
        case 'square': {
            const normal = vector('normal');
            const length = Math.hypot(...normal);
            if (length === 0) {
                throw new Error('Normal must be nonzero.');
            }
            const unit = normal.map(value => value / length) as Vector3;
            const tangent: Vector3 = Math.abs(unit[2]) < 0.9 ? [-unit[1], unit[0], 0] : [unit[2], 0, -unit[0]];
            const tangent_length = Math.hypot(...tangent);
            for (let axis = 0; axis < 3; axis++) {
                tangent[axis] /= tangent_length;
            }
            const bitangent: Vector3 = [
                unit[1] * tangent[2] - unit[2] * tangent[1],
                unit[2] * tangent[0] - unit[0] * tangent[2],
                unit[0] * tangent[1] - unit[1] * tangent[0]
            ];
            const center = entry.kind === 'plane'
                ? normal.map(value => -scalar('offset', false) * value / (length * length)) as Vector3
                : vector('center');
            if (entry.kind === 'circle') {
                loop(ring(center, tangent, bitangent, scalar('radius')));
            } else {
                const half_side = entry.kind === 'plane' ? plane_extent / 2 : scalar('side_length') / 2;
                loop([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => center.map((value, axis) => value + half_side * (u * tangent[axis] + v * bitangent[axis])) as Vector3));
                mesh.dashed = entry.kind === 'plane';
            }
            break;
        }
        case 'triangle':
            loop([vector('a'), vector('b'), vector('c')]);
            break;
        case 'triangle_mesh': {
            const asset = assets.find(candidate => candidate.id === fields.asset_id);
            if (!asset || asset.error || asset.content === undefined) {
                throw new Error(asset?.error ?? 'Mesh asset has not been loaded.');
            }
            mesh = obj_wireframe(asset.content);
            break;
        }
        default:
            throw new Error(`Unsupported geometry: ${entry.kind}.`);
    }
    const rotation = fields.rotation === undefined ? [0, 0, 0] as Vector3 : vector('rotation');
    const translation = fields.translation === undefined ? [0, 0, 0] as Vector3 : vector('translation');
    mesh.vertices = mesh.vertices.map(point => transform_point(point, rotation, translation));
    return mesh;
}

export function transform_point(point: Vector3, rotation: Vector3, translation: Vector3): Vector3 {
    const [rx, ry, rz] = rotation;
    const x = point[0];
    const y = point[1] * Math.cos(rx) - point[2] * Math.sin(rx);
    const z = point[1] * Math.sin(rx) + point[2] * Math.cos(rx);
    const rotated_x = x * Math.cos(ry) + z * Math.sin(ry);
    const rotated_z = -x * Math.sin(ry) + z * Math.cos(ry);
    return [
        rotated_x * Math.cos(rz) - y * Math.sin(rz) + translation[0],
        rotated_x * Math.sin(rz) + y * Math.cos(rz) + translation[1],
        rotated_z + translation[2]
    ];
}

export function obj_wireframe(content: string): SceneWireframe {
    const vertices: Vector3[] = [];
    const edges: [number, number][] = [];
    const edge_keys = new Set<string>();
    let triangle_count = 0;
    const lines = content.split(/\r?\n/);
    for (let line_index = 0; line_index < lines.length; line_index++) {
        const tokens = lines[line_index].split('#', 1)[0].trim().split(/\s+/);
        if (tokens[0] === 'v') {
            const point = tokens.slice(1, 4).map(Number);
            if (point.length !== 3 || !point.every(Number.isFinite)) {
                throw new Error(`Invalid OBJ vertex at line ${line_index + 1}.`);
            }
            vertices.push(point as Vector3);
            if (vertices.length > 500_000) {
                throw new Error('OBJ preview supports at most 500,000 vertices.');
            }
        } else if (tokens[0] === 'f') {
            if (tokens.length < 4) {
                throw new Error(`OBJ face needs at least three vertices at line ${line_index + 1}.`);
            }
            const face = tokens.slice(1).map(token => {
                const index_token = token.split('/', 1)[0];
                const index = Number(index_token);
                if (!/^-?\d+$/.test(index_token) || !Number.isSafeInteger(index) || index === 0) {
                    throw new Error(`Invalid OBJ face index at line ${line_index + 1}.`);
                }
                const resolved = index > 0 ? index - 1 : vertices.length + index;
                if (resolved < 0 || resolved >= vertices.length) {
                    throw new Error(`OBJ face references a missing vertex at line ${line_index + 1}.`);
                }
                return resolved;
            });
            triangle_count += face.length - 2;
            if (triangle_count > 250_000) {
                throw new Error('OBJ preview supports at most 250,000 triangles.');
            }
            for (let index = 1; index < face.length - 1; index++) {
                for (const [first, second] of [[face[0], face[index]], [face[index], face[index + 1]], [face[index + 1], face[0]]]) {
                    const key = first < second ? `${first}:${second}` : `${second}:${first}`;
                    if (!edge_keys.has(key)) {
                        edge_keys.add(key);
                        edges.push([first, second]);
                    }
                }
            }
        }
    }
    if (triangle_count === 0) {
        throw new Error('OBJ contains no polygon faces.');
    }
    return {vertices, edges};
}
