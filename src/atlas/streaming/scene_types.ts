export type SceneValue = number | string | boolean | number[] | number[][];

export interface SceneEntry {
    id: string;
    name: string;
    kind: string;
    fields: Record<string, SceneValue>;
}

export interface SceneConfig {
    geometry: SceneEntry[];
    sources: SceneEntry[];
    boundaries: SceneEntry[];
    sinks: SceneEntry[];
    assets?: { id: string; content: string }[];
    output: {
        enabled: boolean;
        interval: number;
        output_directory: string;
    };
}
