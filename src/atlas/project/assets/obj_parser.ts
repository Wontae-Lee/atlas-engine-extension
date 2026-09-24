import type {JsonValue} from '../../engine/protocol';

export function parse_obj(source: string): JsonValue[] {
    const vertices: number[][] = [];
    const triangles: JsonValue[] = [];
    for (const line of source.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'v') {
            if (parts.length < 4) {
                throw new Error('OBJ vertex requires three coordinates.');
            }
            const vertex = parts.slice(1, 4).map(Number);
            if (vertex.some(value => !Number.isFinite(value))) {
                throw new Error('OBJ vertex has an invalid coordinate.');
            }
            vertices.push(vertex);
        } else if (parts[0] === 'f') {
            if (parts.length < 4) {
                throw new Error('OBJ face requires three vertices.');
            }
            const indices = parts.slice(1).map(part => {
                const index = Number(part.split('/')[0]);
                const resolved = index < 0 ? vertices.length + index : index - 1;
                if (!Number.isInteger(index) || index === 0 || resolved < 0 || resolved >= vertices.length) {
                    throw new Error('OBJ face references an invalid vertex.');
                }
                return resolved;
            });
            for (let i = 1; i < indices.length - 1; i++) {
                triangles.push([vertices[indices[0]], vertices[indices[i]], vertices[indices[i + 1]]]);
            }
        }
    }
    if (triangles.length === 0) {
        throw new Error('OBJ has no faces.');
    }
    return triangles;
}
