import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, extname, join, relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {JsonObject} from '../engine/protocol';
import {ProjectPaths} from './project_paths';
import {default_project, type ProjectState} from './project_types';

export class ProjectStore {
    private last_contents?: string;

    constructor(readonly paths: ProjectPaths) {}

    async create(): Promise<ProjectState> {
        const state = default_project();
        await this.prepare();
        await this.save(state, state.simulation);
        return state;
    }

    async load(): Promise<ProjectState> {
        const contents = await readFile(this.paths.project_file, 'utf8');
        const value: unknown = JSON.parse(contents);
        this.check_state(value);
        await this.prepare();
        this.last_contents = contents;
        return value as ProjectState;
    }

    async save(state: ProjectState, simulation: JsonObject): Promise<void> {
        this.check_state(state);
        if (this.last_contents !== undefined &&
            await readFile(this.paths.project_file, 'utf8') !== this.last_contents) {
            throw new Error('Atlas project file changed outside the extension. Reopen it before editing.');
        }
        await this.prepare();
        await writeFile(this.paths.simulation_file, `${JSON.stringify(simulation, null, 2)}\n`);
        const contents = `${JSON.stringify(state, null, 2)}\n`;
        await writeFile(this.paths.project_file, contents);
        this.last_contents = contents;
    }

    async import_obj(source: string): Promise<{id: string; name: string; path: string}> {
        if (extname(source).toLowerCase() !== '.obj') {
            throw new Error('Select an OBJ file.');
        }
        await this.prepare();
        const id = randomUUID();
        const name = basename(source);
        const destination = join(this.paths.assets_directory, `${id}-${name}`);
        await copyFile(source, destination);
        return {id, name, path: relative(this.paths.root, destination)};
    }

    private async prepare(): Promise<void> {
        await Promise.all([
            mkdir(this.paths.assets_directory, {recursive: true}),
            mkdir(this.paths.output_directory, {recursive: true}),
            mkdir(this.paths.state_directory, {recursive: true})
        ]);
    }

    private check_state(value: unknown): asserts value is ProjectState {
        if (!value || typeof value !== 'object') {
            throw new Error('Invalid Atlas project file.');
        }
        const state = value as ProjectState;
        if (state.version !== 1 || !state.simulation || typeof state.simulation !== 'object' ||
            !state.simulation.fluid || !state.simulation.universe ||
            !Array.isArray(state.geometries) || !Array.isArray(state.assets) ||
            !state.output || typeof state.output.csv_enabled !== 'boolean' ||
            typeof state.output.csv_filename !== 'string' ||
            !state.output.csv_filename || state.output.csv_filename === '.' ||
            state.output.csv_filename === '..' ||
            basename(state.output.csv_filename) !== state.output.csv_filename) {
            throw new Error('Unsupported Atlas project structure.');
        }
        const geometry_ids = new Set<string>();
        for (const item of state.geometries) {
            if (!item || typeof item.id !== 'string' || !item.id || geometry_ids.has(item.id) ||
                typeof item.name !== 'string' || !item.geometry || typeof item.geometry !== 'object' ||
                Array.isArray(item.geometry)) {
                throw new Error('Invalid or duplicate geometry record.');
            }
            geometry_ids.add(item.id);
        }
        const asset_ids = new Set<string>();
        for (const item of state.assets) {
            if (!item || typeof item.id !== 'string' || !item.id || asset_ids.has(item.id) ||
                typeof item.name !== 'string' || typeof item.path !== 'string') {
                throw new Error('Invalid or duplicate asset record.');
            }
            this.paths.resolve_asset(item.path);
            asset_ids.add(item.id);
        }
    }
}
