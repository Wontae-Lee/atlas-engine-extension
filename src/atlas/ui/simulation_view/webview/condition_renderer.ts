import type {SimulationViewModel, ConditionShape} from '../simulation_view_model';

type Point = [number, number, number];

function point(value: unknown, fallback: Point = [0, 0, 0]): Point {
    return Array.isArray(value) && value.length === 3 && value.every(item => typeof item === 'number')
        ? value as Point : fallback;
}

export function draw_conditions(canvas: HTMLCanvasElement, model?: SimulationViewModel): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    const context = canvas.getContext('2d');
    if (!context) {
        return;
    }
    const drawing = context;
    drawing.scale(devicePixelRatio, devicePixelRatio);
    drawing.clearRect(0, 0, width, height);
    if (!model?.bounds) {
        return;
    }
    const lower = point(model.bounds.lower_corner, [-1, -1, -1]);
    const upper = point(model.bounds.upper_corner, [1, 1, 1]);
    const span_x = upper[0] - lower[0];
    const span_y = upper[1] - lower[1];
    const size = Math.min(width / Math.max(span_x, 0.001), height / Math.max(span_y, 0.001)) * 0.78;
    const project = (x: number, y: number): [number, number] => [
        width / 2 + (x - (lower[0] + upper[0]) / 2) * size,
        height / 2 - (y - (lower[1] + upper[1]) / 2) * size
    ];
    const outline = (a: Point, b: Point) => {
        const [x1, y1] = project(a[0], a[1]);
        const [x2, y2] = project(b[0], b[1]);
        drawing.strokeRect(x1, y2, x2 - x1, y1 - y2);
    };
    drawing.lineWidth = 2;
    drawing.strokeStyle = '#89929b';
    outline(lower, upper);
    for (const shape of model.shapes) {
        draw_shape(shape);
    }

    function draw_shape(shape: ConditionShape): void {
        const translation = point(shape.translation);
        const geometry = shape.geometry;
        drawing.strokeStyle = shape.role === 'emitter' ? '#62c890' : shape.role === 'sink' ? '#e6a75a'
            : shape.role === 'collider' ? '#70b8ed' : '#a9a4e7';
        const kind = geometry.type;
        if (kind === 'box') {
            const a = point(geometry.lower_corner);
            const b = point(geometry.upper_corner);
            outline([a[0] + translation[0], a[1] + translation[1], 0],
                [b[0] + translation[0], b[1] + translation[1], 0]);
        } else {
            const center = point(geometry.center);
            const [x, y] = project(center[0] + translation[0], center[1] + translation[1]);
            const radius = typeof geometry.radius === 'number' ? geometry.radius * size : 7;
            drawing.beginPath();
            drawing.arc(x, y, Math.max(4, radius), 0, Math.PI * 2);
            drawing.stroke();
        }
        if (shape.role === 'emitter') {
            const flow = point(shape.flow);
            const center = point(geometry.center);
            const [x, y] = project(center[0] + translation[0], center[1] + translation[1]);
            const length = Math.hypot(flow[0], flow[1]);
            if (length > 0) {
                drawing.beginPath();
                drawing.moveTo(x, y);
                drawing.lineTo(x + flow[0] / length * 24, y - flow[1] / length * 24);
                drawing.stroke();
            }
        }
    }
}
