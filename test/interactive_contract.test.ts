import * as assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {AtlasClient} from '../src/atlas/engine/atlas_client';
import {JsonlChannel} from '../src/atlas/engine/jsonl_channel';
import {ConfigSerializer} from '../src/atlas/project/config_serializer';
import {ProjectPaths} from '../src/atlas/project/project_paths';
import {default_project} from '../src/atlas/project/project_types';
import {parse_obj} from '../src/atlas/project/assets/obj_parser';

describe('Atlas Interactive contract', () => {
    it('keeps the JSONL connection after a failed validation response', async () => {
        const output = new PassThrough();
        const input = new PassThrough();
        const failures: Error[] = [];
        const channel = new JsonlChannel(output, input, error => failures.push(error));
        const client = new AtlasClient(channel);
        let calls = 0;
        input.on('data', chunk => {
            const request = JSON.parse(String(chunk)) as {request_id: string; command: string};
            calls++;
            output.write(JSON.stringify({request_id: request.request_id, success: calls > 1,
                error: calls === 1 ? 'invalid cell size' : undefined}) + '\n');
        });
        await assert.rejects(client.validate('universe', {cell_size: -1}), /invalid cell size/);
        await client.validate('universe', {cell_size: 1});
        assert.equal(calls, 2);
        assert.equal(failures.length, 0);
        channel.dispose();
    });

    it('uses resolved geometry in the validation target and create config', async () => {
        const project = default_project();
        project.geometries.push({id: 'wall', name: 'Wall',
            geometry: {type: 'sphere', center: [0, 0, 0], radius: 0.5}});
        project.simulation.colliders = [{unit: {geometry_id: 'wall'},
            momentum_accommodation_coefficient: 1, restitution: 1}];
        const serializer = new ConfigSerializer(new ProjectPaths('/tmp/atlas-contract'));
        const full = await serializer.serialize_simulation(project);
        const partial = await serializer.serialize_target(project, ['simulation', 'colliders', 0, 'unit']);
        assert.equal(partial.target, 'collider');
        assert.deepEqual(partial.config, (full.colliders as object[])[0]);
    });

    it('parses OBJ faces into explicit triangles and rejects broken indices', () => {
        assert.deepEqual(parse_obj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3'),
            [[ [0, 0, 0], [1, 0, 0], [0, 1, 0] ]]);
        assert.throws(() => parse_obj('v 0 0 0\nf 1 2 3'), /invalid vertex/);
    });
});
