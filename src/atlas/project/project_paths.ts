import {join, relative, resolve, sep} from 'node:path';

export class ProjectPaths {
    readonly project_file: string;
    readonly simulation_file: string;
    readonly assets_directory: string;
    readonly output_directory: string;
    readonly state_directory: string;

    constructor(readonly root: string) {
        this.project_file = join(root, 'atlas.project.json');
        this.simulation_file = join(root, 'atlas.simulation.json');
        this.assets_directory = join(root, 'assets', 'geometry');
        this.output_directory = join(root, 'output');
        this.state_directory = join(root, 'state');
    }

    resolve_asset(path: string): string {
        const file = resolve(this.root, path);
        const inside = relative(this.assets_directory, file);
        if (inside === '..' || inside.startsWith(`..${sep}`) || inside === '' && path === '') {
            throw new Error('Asset must be inside assets/geometry.');
        }
        return file;
    }
}
