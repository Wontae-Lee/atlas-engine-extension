import type * as vscode from 'vscode';
import type {CaseProject} from '../../project/case_project';
import type {ProjectState} from '../../project/project_types';
import type {EntryDefinition, FieldDefinition, ViewAction, ViewItem} from '../view_types';
import {EntryView} from '../entry_view';

const RIGID_FIELDS: readonly FieldDefinition[] = [
    {key: 'translation', label: 'Translation', type: 'vector', default_value: [0, 0, 0], unit: 'm'},
    {key: 'rotation', label: 'Rotation (Euler XYZ)', type: 'vector', default_value: [0, 0, 0], unit: 'rad'},
    {key: 'velocity', label: 'Velocity', type: 'vector', default_value: [0, 0, 0], unit: 'm/s'},
    {key: 'angular_velocity', label: 'Angular velocity', type: 'vector', default_value: [0, 0, 0], unit: 'rad/s'}
];

export const GEOMETRY_KINDS: readonly EntryDefinition[] = [
    {
        kind: 'sphere',
        label: 'Sphere',
        fields: [
            {key: 'center', label: 'Center', type: 'vector', default_value: [0, 0, 0], unit: 'm'},
            {key: 'radius', label: 'Radius', type: 'number', default_value: 0.5, exclusive_min: 0, unit: 'm'},
            ...RIGID_FIELDS
        ]
    },
    {
        kind: 'box',
        label: 'Box',
        fields: [
            {key: 'lower', label: 'Lower corner', type: 'vector', default_value: [-0.5, -0.5, -0.5], unit: 'm'},
            {key: 'upper', label: 'Upper corner', type: 'vector', default_value: [0.5, 0.5, 0.5], unit: 'm'},
            ...RIGID_FIELDS
        ]
    },
    {
        kind: 'cylinder',
        label: 'Cylinder (Z axis)',
        fields: [
            {key: 'center', label: 'Center', type: 'vector', default_value: [0, 0, 0], unit: 'm'},
            {key: 'radius', label: 'Radius', type: 'number', default_value: 0.5, exclusive_min: 0, unit: 'm'},
            {key: 'height', label: 'Height', type: 'number', default_value: 1, exclusive_min: 0, unit: 'm'},
            {key: 'open', label: 'Open ends', type: 'boolean', default_value: false},
            ...RIGID_FIELDS
        ]
    },
    {
        kind: 'plane',
        label: 'Plane (infinite)',
        fields: [
            {key: 'normal', label: 'Normal', type: 'vector', default_value: [0, 0, 1]},
            {key: 'offset', label: 'Offset (normal · point + offset = 0)', type: 'number', default_value: 0, unit: 'm'},
            ...RIGID_FIELDS
        ]
    },
    {
        kind: 'circle',
        label: 'Circle (filled disk)',
        fields: [
            {key: 'center', label: 'Center', type: 'vector', default_value: [0, 0, 0], unit: 'm'},
            {key: 'normal', label: 'Normal', type: 'vector', default_value: [0, 0, 1]},
            {key: 'radius', label: 'Radius', type: 'number', default_value: 0.5, exclusive_min: 0, unit: 'm'},
            ...RIGID_FIELDS
        ]
    },
    {
        kind: 'square',
        label: 'Square',
        fields: [
            {key: 'center', label: 'Center', type: 'vector', default_value: [0, 0, 0], unit: 'm'},
            {key: 'normal', label: 'Normal', type: 'vector', default_value: [0, 0, 1]},
            {key: 'side_length', label: 'Side length', type: 'number', default_value: 1, exclusive_min: 0, unit: 'm'},
            ...RIGID_FIELDS
        ]
    },
    {
        kind: 'triangle',
        label: 'Triangle',
        fields: [
            {key: 'a', label: 'Vertex A', type: 'vector', default_value: [0, 0, 0], unit: 'm'},
            {key: 'b', label: 'Vertex B', type: 'vector', default_value: [1, 0, 0], unit: 'm'},
            {key: 'c', label: 'Vertex C', type: 'vector', default_value: [0, 1, 0], unit: 'm'},
            ...RIGID_FIELDS
        ]
    },
    {
        kind: 'polygonal_prism',
        label: 'Polygonal prism (Z axis)',
        fields: [
            {key: 'center', label: 'Center', type: 'vector', default_value: [0, 0, 0], unit: 'm'},
            {key: 'side_count', label: 'Side count', type: 'integer', default_value: 6, min: 3},
            {key: 'radius', label: 'Circumradius', type: 'number', default_value: 0.5, exclusive_min: 0, unit: 'm'},
            {key: 'height', label: 'Height', type: 'number', default_value: 1, exclusive_min: 0, unit: 'm'},
            ...RIGID_FIELDS
        ]
    },
    {
        kind: 'triangle_mesh',
        label: 'Triangle mesh (OBJ)',
        fields: [
            {key: 'asset_id', label: 'Mesh asset', type: 'asset'},
            ...RIGID_FIELDS
        ]
    }
];

export class Geometry extends EntryView {
    constructor(project: CaseProject) {
        super(project, 'geometry', 'GEOMETRY');
    }

    execute(api: typeof vscode, action: ViewAction): Promise<void> {
        return this.edit_entries(api, action, GEOMETRY_KINDS);
    }

    protected async items(state: ProjectState): Promise<ViewItem[]> {
        return [
            ...await this.entry_rows(state.geometry, GEOMETRY_KINDS, state),
            this.action_row('Add Geometry', {action: 'add'}, 'add')
        ];
    }
}
