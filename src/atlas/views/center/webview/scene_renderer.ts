import { box_wireframe, geometry_wireframe } from '../../../detail/scene_geometry';
import type { SceneWireframe } from '../../../detail/scene_geometry';
import type { Vector3 } from '../../../streaming/streaming_types';
import type { SceneAsset, SceneFrame } from '../simulation_types';

const SPECIES_COLORS = ['#61d6c3', '#e8ad67', '#b59af8', '#ee8293', '#7fb8ee', '#c6d46b', '#ef98d8', '#e4ceaf'];

export class SceneRenderer {
	private readonly context: CanvasRenderingContext2D;
	private readonly resize_observer: ResizeObserver;
	private frame?: SceneFrame;
	private domain?: SceneWireframe;
	private geometries: { mesh: SceneWireframe; name: string }[] = [];
	private geometry_key = '';
	private previous_assets: readonly SceneAsset[] = [];
	private preview_errors: string[] = [];
	private readonly visible = { domain: true, geometry: true, particles: true };
	private center: Vector3 = [0, 0, 0];
	private span = 1;
	private yaw = Math.PI / 4;
	private pitch = Math.PI / 5;
	private zoom = 1;
	private pan: [number, number] = [0, 0];
	private width = 1;
	private height = 1;
	private pixel_ratio = 1;
	private pending_draw?: number;
	private pointer?: { id: number; x: number; y: number; pan: boolean };

	constructor(private readonly canvas: HTMLCanvasElement) {
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Canvas rendering is unavailable in this webview.');
		}
		this.context = context;
		this.resize_observer = new ResizeObserver(this.resize);
		this.resize_observer.observe(canvas);
		canvas.addEventListener('pointerdown', this.pointer_down);
		canvas.addEventListener('pointermove', this.pointer_move);
		canvas.addEventListener('pointerup', this.pointer_up);
		canvas.addEventListener('pointercancel', this.pointer_up);
		canvas.addEventListener('lostpointercapture', this.pointer_up);
		canvas.addEventListener('wheel', this.wheel, { passive: false });
		canvas.addEventListener('contextmenu', this.context_menu);
		this.resize();
	}

	get errors(): readonly string[] {
		return this.preview_errors;
	}

	set_frame(frame: SceneFrame): void {
		const first_frame = this.frame === undefined;
		this.frame = frame;
		const geometry_key = JSON.stringify([frame.project.domain, frame.project.geometry]);
		const assets = frame.assets ?? this.previous_assets;
		const assets_changed = assets.length !== this.previous_assets.length || assets.some((asset, index) => {
			const previous = this.previous_assets[index];
			return !previous || asset.id !== previous.id || asset.content !== previous.content || asset.error !== previous.error;
		});
		if (geometry_key !== this.geometry_key || assets_changed) {
			this.geometry_key = geometry_key;
			this.previous_assets = assets;
			this.preview_errors = [];
			const { lower_corner, upper_corner } = frame.project.domain;
			this.domain = box_wireframe(lower_corner, upper_corner);
			const extent = Math.hypot(...upper_corner.map((value, axis) => value - lower_corner[axis]));
			this.geometries = [];
			for (const entry of frame.project.geometry) {
				try {
					this.geometries.push({ mesh: geometry_wireframe(entry, assets, extent), name: entry.name });
				} catch (error) {
					this.preview_errors.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}
		if (first_frame) {
			this.fit();
		} else {
			this.request_draw();
		}
	}

	fit(): void {
		const lower: Vector3 = [Infinity, Infinity, Infinity];
		const upper: Vector3 = [-Infinity, -Infinity, -Infinity];
		const include = (point: Vector3): void => {
			for (let axis = 0; axis < 3; axis++) {
				lower[axis] = Math.min(lower[axis], point[axis]);
				upper[axis] = Math.max(upper[axis], point[axis]);
			}
		};
		this.domain?.vertices.forEach(include);
		this.geometries.forEach(geometry => geometry.mesh.vertices.forEach(include));
		this.frame?.snapshot?.positions.forEach(include);
		if (Number.isFinite(lower[0])) {
			this.center = lower.map((value, axis) => (value + upper[axis]) / 2) as Vector3;
			this.span = Math.max(Math.hypot(...upper.map((value, axis) => value - lower[axis])), 1e-12) * 1.25;
		}
		this.pan = [0, 0];
		this.zoom = 1;
		this.request_draw();
	}

	set_camera(view: 'iso' | 'xy' | 'xz' | 'yz'): void {
		this.yaw = view === 'iso' ? Math.PI / 4 : view === 'yz' ? Math.PI / 2 : 0;
		this.pitch = view === 'iso' ? Math.PI / 5 : view === 'xy' ? Math.PI / 2 : 0;
		this.request_draw();
	}

	set_visibility(layer: 'domain' | 'geometry' | 'particles', visible: boolean): void {
		this.visible[layer] = visible;
		this.request_draw();
	}

	dispose(): void {
		this.resize_observer.disconnect();
		if (this.pending_draw !== undefined) {
			cancelAnimationFrame(this.pending_draw);
		}
		this.canvas.removeEventListener('pointerdown', this.pointer_down);
		this.canvas.removeEventListener('pointermove', this.pointer_move);
		this.canvas.removeEventListener('pointerup', this.pointer_up);
		this.canvas.removeEventListener('pointercancel', this.pointer_up);
		this.canvas.removeEventListener('lostpointercapture', this.pointer_up);
		this.canvas.removeEventListener('wheel', this.wheel);
		this.canvas.removeEventListener('contextmenu', this.context_menu);
	}

	private readonly resize = (): void => {
		const bounds = this.canvas.getBoundingClientRect();
		this.width = Math.max(1, bounds.width);
		this.height = Math.max(1, bounds.height);
		this.pixel_ratio = window.devicePixelRatio || 1;
		this.canvas.width = Math.round(this.width * this.pixel_ratio);
		this.canvas.height = Math.round(this.height * this.pixel_ratio);
		this.request_draw();
	};

	private readonly pointer_down = (event: PointerEvent): void => {
		if (event.button !== 0 && event.button !== 2) {
			return;
		}
		event.preventDefault();
		this.canvas.setPointerCapture(event.pointerId);
		this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button === 2 };
	};

	private readonly pointer_move = (event: PointerEvent): void => {
		if (!this.pointer || event.pointerId !== this.pointer.id) {
			return;
		}
		const dx = event.clientX - this.pointer.x;
		const dy = event.clientY - this.pointer.y;
		if (this.pointer.pan) {
			this.pan[0] += dx;
			this.pan[1] += dy;
		} else {
			this.yaw -= dx * 0.008;
			this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch + dy * 0.008));
		}
		this.pointer.x = event.clientX;
		this.pointer.y = event.clientY;
		this.request_draw();
	};

	private readonly pointer_up = (event: PointerEvent): void => {
		if (event.pointerId === this.pointer?.id) {
			this.pointer = undefined;
			if (this.canvas.hasPointerCapture(event.pointerId)) {
				this.canvas.releasePointerCapture(event.pointerId);
			}
		}
	};

	private readonly wheel = (event: WheelEvent): void => {
		event.preventDefault();
		const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
		this.zoom = Math.max(0.02, Math.min(200, this.zoom * Math.exp(-delta * 0.001)));
		this.request_draw();
	};

	private readonly context_menu = (event: MouseEvent): void => {
		event.preventDefault();
	};

	private request_draw(): void {
		if (this.pending_draw === undefined) {
			this.pending_draw = requestAnimationFrame(() => {
				this.pending_draw = undefined;
				this.draw();
			});
		}
	}

	private draw(): void {
		const context = this.context;
		context.setTransform(this.pixel_ratio, 0, 0, this.pixel_ratio, 0, 0);
		context.clearRect(0, 0, this.width, this.height);
		const styles = getComputedStyle(this.canvas);
		const foreground = styles.getPropertyValue('--vscode-editor-foreground').trim() || '#d4d4d4';
		const muted = styles.getPropertyValue('--vscode-descriptionForeground').trim() || '#9b9b9b';
		const right: Vector3 = [Math.cos(this.yaw), Math.sin(this.yaw), 0];
		const up: Vector3 = [-Math.sin(this.yaw) * Math.sin(this.pitch), Math.cos(this.yaw) * Math.sin(this.pitch), Math.cos(this.pitch)];
		const depth: Vector3 = [Math.sin(this.yaw) * Math.cos(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch)];
		const scale = Math.min(this.width, this.height) * this.zoom / this.span;
		const project = (point: Vector3): [number, number, number] => {
			const x = point[0] - this.center[0];
			const y = point[1] - this.center[1];
			const z = point[2] - this.center[2];
			return [
				this.width / 2 + this.pan[0] + scale * (x * right[0] + y * right[1] + z * right[2]),
				this.height / 2 + this.pan[1] - scale * (x * up[0] + y * up[1] + z * up[2]),
				x * depth[0] + y * depth[1] + z * depth[2]
			];
		};
		const wire = (mesh: SceneWireframe, color: string, dashed: boolean): void => {
			const points = mesh.vertices.map(project);
			context.strokeStyle = color;
			context.lineWidth = 1;
			context.setLineDash(dashed ? [5, 5] : []);
			context.beginPath();
			for (const [first, second] of mesh.edges) {
				context.moveTo(points[first][0], points[first][1]);
				context.lineTo(points[second][0], points[second][1]);
			}
			context.stroke();
			context.setLineDash([]);
		};
		if (this.visible.domain && this.domain) {
			context.globalAlpha = 0.55;
			wire(this.domain, muted, true);
			context.globalAlpha = 1;
		}
		if (this.visible.geometry) {
			context.globalAlpha = 0.72;
			for (const geometry of this.geometries) {
				wire(geometry.mesh, '#72b9d5', geometry.mesh.dashed ?? false);
			}
			context.globalAlpha = 1;
		}
		const snapshot = this.frame?.snapshot;
		if (this.visible.particles && snapshot) {
			const particles = snapshot.positions.map((position, index) => ({ point: project(position), species: snapshot.species[index] }));
			particles.sort((first, second) => first.point[2] - second.point[2]);
			for (const particle of particles) {
				const [x, y] = particle.point;
				if (x < -3 || y < -3 || x > this.width + 3 || y > this.height + 3) {
					continue;
				}
				context.fillStyle = SPECIES_COLORS[particle.species % SPECIES_COLORS.length] ?? foreground;
				context.fillRect(x - 1.5, y - 1.5, 3, 3);
			}
		}
		context.font = '11px sans-serif';
		if (this.visible.geometry) {
			for (const geometry of this.geometries) {
				const point = project(geometry.mesh.vertices[0]);
				context.fillStyle = foreground;
				context.fillText(geometry.name, point[0] + 6, point[1] - 6);
			}
		}
		for (let axis = 0; axis < 3; axis++) {
			const x = 48 + right[axis] * 27;
			const y = this.height - 48 - up[axis] * 27;
			context.strokeStyle = ['#eb7777', '#87c97c', '#7db5ee'][axis];
			context.fillStyle = context.strokeStyle;
			context.beginPath();
			context.moveTo(48, this.height - 48);
			context.lineTo(x, y);
			context.stroke();
			context.fillText(['X', 'Y', 'Z'][axis], x + 4, y - 4);
		}
		context.fillStyle = muted;
		context.fillText('m', 44, this.height - 13);
	}
}
