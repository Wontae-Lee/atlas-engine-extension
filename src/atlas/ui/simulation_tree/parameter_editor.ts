import type * as vscode from 'vscode';
import {randomUUID} from 'node:crypto';
import type {ProjectState} from '../../project/project_types';
import type {TreeNode} from './tree_nodes';

export class ParameterEditor {
    constructor(private readonly api: typeof vscode,
                private readonly edit_project: (path: (string | number)[], edit: (candidate: ProjectState) => void) => Promise<void>) {}

    async edit(node: TreeNode): Promise<void> {
        const input = await this.api.window.showInputBox({
            title: `Edit ${node.label}`,
            value: node.value === undefined ? JSON.stringify(this.new_object(node.path)) : JSON.stringify(node.value),
            prompt: 'Enter a JSON value. Atlas validates simulation parameters before saving.'
        });
        if (input === undefined) {
            return;
        }
        const value: unknown = JSON.parse(input);
        await this.edit_project(node.path, candidate => {
            const parent = this.at(candidate, node.path.slice(0, -1));
            (parent as Record<string | number, unknown>)[node.path.at(-1)!] = value;
        });
    }

    async add(node: TreeNode): Promise<void> {
        const input = await this.api.window.showInputBox({
            title: `Add to ${node.label}`,
            value: JSON.stringify(this.new_object(node.path)),
            prompt: 'Edit one JSON object in the Atlas Interactive format.'
        });
        if (input === undefined) {
            return;
        }
        const value: unknown = JSON.parse(input);
        await this.edit_project(node.path, candidate => {
            const list = this.at(candidate, node.path);
            if (!Array.isArray(list)) {
                throw new Error('The selected value is not a list.');
            }
            list.push(value);
        });
    }

    async remove(node: TreeNode): Promise<void> {
        const index = node.path.at(-1);
        if (typeof index !== 'number') {
            return;
        }
        const answer = await this.api.window.showWarningMessage(`Remove ${node.label}?`, {modal: true}, 'Remove');
        if (answer !== 'Remove') {
            return;
        }
        await this.edit_project(['simulation'], candidate => {
            const list = this.at(candidate, node.path.slice(0, -1));
            if (!Array.isArray(list)) {
                throw new Error('The selected value is not a list.');
            }
            list.splice(index, 1);
        });
    }

    private at(root: ProjectState, path: (string | number)[]): unknown {
        let current: unknown = root;
        for (const key of path) {
            if (!current || typeof current !== 'object') {
                throw new Error('Parameter path is no longer available.');
            }
            current = (current as Record<string | number, unknown>)[key];
        }
        return current;
    }

    private new_object(path: (string | number)[]): unknown {
        switch (path.join('.')) {
            case 'geometries':
                return {id: randomUUID(), name: 'Sphere', geometry: {
                    type: 'sphere', center: [0, 0, 0], radius: 0.5
                }};
            case 'simulation.fluid.materials':
                return {type: 'molecule', mass: 4.65e-26, translational_energy: 0,
                    rotational_energy: 0, vibrational_energy: 0,
                    reference_diameter: 4.17e-10, reference_temperature: 273,
                    viscosity_index: 0.74, scattering_parameter: 1};
            case 'simulation.solvers':
                return {kernel: 'variable_hard_sphere', majorant_sample_pairs: 8,
                    majorant_exhaustive_limit: 5};
            case 'simulation.emitters':
                return {source: {type: 'volume', unit: {geometry: {
                    type: 'box', lower_corner: [-0.9, -0.2, -0.2], upper_corner: [-0.8, 0.2, 0.2]
                }}, spacing: 0.1, tolerance: 0}, generator: {
                    type: 'maxwell_boltzmann', species_ratios: [1], species_numbers: [0],
                    temperature: 300, bulk_velocity: [10, 0, 0], seed: 1
                }};
            case 'simulation.colliders':
                return {unit: {geometry: {type: 'sphere', center: [0, 0, 0], radius: 0.5}},
                    momentum_accommodation_coefficient: 1, restitution: 1,
                    diffuse_sampling: 'uniform'};
            case 'simulation.sinks':
                return {type: 'volume', unit: {geometry: {type: 'sphere', center: [0, 0, 0], radius: 0.1}},
                    tolerance: 0};
            case 'simulation.codec':
                return {representative_characteristic_length: 1,
                    representative_collision_cross_sectional_area: 1,
                    representative_statistical_weight: 1,
                    representative_cell_volume: 1};
            default:
                return {};
        }
    }
}
