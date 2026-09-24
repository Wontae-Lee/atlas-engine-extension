import type {JsonValue} from '../../engine/protocol';

export interface TreeNode {
    label: string;
    path: (string | number)[];
    value: JsonValue | undefined;
    kind: 'section' | 'object' | 'array' | 'value';
}
