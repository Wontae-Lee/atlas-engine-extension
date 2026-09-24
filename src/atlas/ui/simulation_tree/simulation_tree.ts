import type * as vscode from 'vscode';
import type {ProjectState} from '../../project/project_types';
import type {JsonValue} from '../../engine/protocol';
import type {TreeNode} from './tree_nodes';

export class SimulationTree implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
    private readonly changed: vscode.EventEmitter<TreeNode | undefined>;
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined>;
    private readonly tree: vscode.TreeView<TreeNode>;

    constructor(private readonly api: typeof vscode, private readonly get_project: () => ProjectState | undefined) {
        this.changed = new api.EventEmitter<TreeNode | undefined>();
        this.onDidChangeTreeData = this.changed.event;
        this.tree = api.window.createTreeView('atlas-engine.simulation', {treeDataProvider: this, showCollapseAll: true});
    }

    refresh(): void { this.changed.fire(undefined); }

    getTreeItem(node: TreeNode): vscode.TreeItem {
        const expandable = node.kind !== 'value';
        const item = new this.api.TreeItem(node.label, expandable
            ? this.api.TreeItemCollapsibleState.Collapsed : this.api.TreeItemCollapsibleState.None);
        item.description = node.kind === 'value' ? JSON.stringify(node.value) : undefined;
        item.contextValue = node.kind === 'array' ? 'atlasArray' : typeof node.path.at(-1) === 'number'
            ? 'atlasRemovable' : node.kind === 'object' ? 'atlasObject' : undefined;
        if (node.kind === 'value' || node.kind === 'object' && node.path.length > 0) {
            item.command = {command: 'atlas-engine.parameter.edit', title: 'Edit parameter', arguments: [node]};
        }
        return item;
    }

    getChildren(node?: TreeNode): TreeNode[] {
        const project = this.get_project();
        if (!project) {
            return [];
        }
        if (!node) {
            const simulation = project.simulation;
            const fluid = simulation.fluid as Record<string, JsonValue>;
            return [
                this.node('Domain', ['simulation', 'universe'], simulation.universe),
                {...this.node('Fluid', ['simulation', 'fluid'], Object.fromEntries(Object.entries(fluid)
                    .filter(([key]) => key !== 'materials'))), kind: 'section'},
                this.node('Materials', ['simulation', 'fluid', 'materials'], fluid.materials),
                this.node('Solvers', ['simulation', 'solvers'], simulation.solvers),
                this.node('Geometry', ['geometries'], project.geometries as unknown as JsonValue),
                this.node('Emitters', ['simulation', 'emitters'], simulation.emitters),
                this.node('Colliders', ['simulation', 'colliders'], simulation.colliders),
                this.node('Sinks', ['simulation', 'sinks'], simulation.sinks),
                this.node('Codec', ['simulation', 'codec'], simulation.codec),
                this.node('Output', ['output'], project.output as unknown as JsonValue),
                this.node('Time step', ['simulation', 'dt'], simulation.dt)
            ];
        }
        if (Array.isArray(node.value)) {
            if (node.value.every(value => typeof value === 'number')) {
                return [];
            }
            return node.value.map((value, index) => this.node(`${index + 1}`, [...node.path, index], value));
        }
        if (node.value && typeof node.value === 'object') {
            return Object.entries(node.value).map(([key, value]) => this.node(key, [...node.path, key], value));
        }
        return [];
    }

    dispose(): void { this.tree.dispose(); this.changed.dispose(); }

    private node(label: string, path: (string | number)[], value: JsonValue | undefined): TreeNode {
        return {label, path, value, kind: Array.isArray(value)
            ? value.every(item => typeof item === 'number') ? 'value' : 'array'
            : value && typeof value === 'object' ? 'object' : 'value'};
    }
}
