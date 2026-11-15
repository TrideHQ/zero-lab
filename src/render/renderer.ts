// The shared 3D stage: one WebGL canvas reused by every topic and practical.
// Handles orbit / zoom / slice gestures, handle dragging, part picking, the
// hologram floor, optional bloom, and hands the same scene to WebXR.
import * as THREE from 'three';
import { U, CYAN } from './hologram-shader.ts';
import { materialise } from './scanline.ts';
import type { Bloom } from './bloom.ts';
import type { Handle, PickTarget, Template } from '../templates/types.ts';

export type FrameHook = (dt: number, t: number, frame?: XRFrame) => void;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 300);
  /** Everything the student looks at. XR and AR move and scale this group. */
  root = new THREE.Group();
  floor: THREE.GridHelper;
  template: Template | null = null;
  orbit = { yaw: 0, pitch: 0.12, zoom: 1, target: new THREE.Vector3(0, 0.8, 0), dist: 3.6 };
  lite = false;
  slice = 0;
  frame = new Set<FrameHook>();
  /** Extra grab / tap targets added by a practical (instruments), in template-local space. */
  extraHandles: Handle[] = [];
  onTap: ((name: string | null) => void) | null = null;
  /** Raw tap in template-local coordinates on the template's upright (z = 0) plane. */
  onTapPoint: ((local: THREE.Vector3) => void) | null = null;
  onSlice: ((v: number) => void) | null = null;
  /** Set by the XR controller while a session runs. */
  xrHook: FrameHook | null = null;
  /** True in phone AR, where the touch screen still drives the model. */
  arTouch = false;
  fps = 60;

  private host: HTMLElement | null = null;
  private ro: ResizeObserver;
  private bloom: Bloom | null = null;
  private wantBloom = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private active: Handle | null = null;
  private plane = new THREE.Plane();
  private moved = 0;
  private downAt = 0;
  private gesture: { dist: number; midY: number; zoom: number; slice: number; mode: '' | 'zoom' | 'slice' } | null = null;
  private ray = new THREE.Raycaster();
  private last = 0;
  private acc = 0;
  private skip = false;
  private slow = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.xr.enabled = true;
    this.scene.add(this.root);
    this.floor = new THREE.GridHelper(8, 32, CYAN, 0x1fb6d6);
    const fm = this.floor.material as THREE.LineBasicMaterial;
    fm.transparent = true;
    fm.opacity = 0.16;
    fm.depthWrite = false;
    fm.blending = THREE.AdditiveBlending;
    this.root.add(this.floor);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.12));
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.ro = new ResizeObserver(() => this.resize());
  }

  // ---- lifecycle ---------------------------------------------------------
  mount(host: HTMLElement, lite: boolean) {
    this.lite = lite;
    this.host = host;
    if (!this.presenting) host.prepend(this.renderer.domElement); // during XR the canvas stays where the session put it
    this.ro.observe(host);
    this.renderer.setPixelRatio(lite ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.resize();
    this.wantBloom = !lite && !/Android|iPhone|iPad|Quest|Oculus/i.test(navigator.userAgent);
    if (this.wantBloom && !this.bloom) {
      void import('./bloom.ts').then((m) => {
        if (!this.wantBloom || !this.host) return;
        this.bloom = m.createBloom(this.renderer, this.scene, this.camera);
        this.resize();
      });
    }
    this.last = 0;
    this.renderer.setAnimationLoop(this.loop);
  }

  unmount() {
    if (!this.presenting) this.renderer.setAnimationLoop(null); // an XR session outlives a page change
    this.ro.disconnect();
    this.renderer.domElement.remove();
    this.host = null;
    this.setTemplate(null);
    this.frame.clear();
    this.extraHandles = [];
    this.onTap = this.onTapPoint = this.onSlice = null;
  }

  setTemplate(t: Template | null) {
    if (this.template) this.template.dispose();
    this.template = t;
    this.slice = 0;
    if (!t) return;
    this.root.add(t.group);
    this.resetView();
    t.update(0, 0);
    materialise(t.group, this.lite);
  }

  resetView() {
    const v = this.template?.view;
    if (!v) return;
    this.orbit.yaw = v.yaw;
    this.orbit.pitch = v.pitch;
    this.orbit.zoom = 1;
    this.orbit.dist = v.dist;
    this.orbit.target.set(...v.target);
  }

  setSlice(v: number) {
    this.slice = clamp(v, 0, 1);
    if (this.template?.canSlice) this.template.setState({ explode: this.slice }, { animate: false });
    this.onSlice?.(this.slice);
  }

  private sizePoints(scale: number) {
    this.template?.group.traverse((o) => {
      const m = (o as THREE.Points).isPoints ? ((o as THREE.Points).material as THREE.PointsMaterial) : null;
      if (!m) return;
      m.userData.base ??= m.size;
      m.size = m.userData.base * scale;
    });
  }

  /** Called when an XR session ends. */
  afterXR() {
    this.sizePoints(1);
    U.uScanFreq.value = 70;
    if (!this.host) this.renderer.setAnimationLoop(null);
    else {
      this.host.prepend(this.renderer.domElement);
      setTimeout(() => this.resize(), 50);
    }
  }

  /** The camera that is actually rendering: the XR view while presenting. */
  private cam(): THREE.Camera {
    if (!this.presenting) return this.camera;
    const x = this.renderer.xr.getCamera();
    return x.cameras[0] ?? x;
  }

  get presenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  private resize() {
    if (!this.host || this.presenting) return;
    const w = Math.max(2, this.host.clientWidth), h = Math.max(2, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bloom?.setSize(w, h);
  }

  // ---- frame loop --------------------------------------------------------
  private loop = (time: number, frame?: XRFrame) => {
    const t = time / 1000;
    const raw = this.last ? t - this.last : 0.016;
    this.last = t;
    this.acc += Math.min(0.1, raw);
    const xr = this.presenting;
    if (this.lite && !xr && (this.skip = !this.skip)) return; // Lite: render every other frame
    const dt = Math.min(0.05, this.acc);
    this.acc = 0;
    this.fps += (1 / Math.max(raw, 1e-3) - this.fps) * 0.05;
    U.uTime.value = t;
    this.template?.update(dt, t);
    for (const f of this.frame) f(dt, t, frame);
    this.xrHook?.(dt, t, frame);
    if (xr) {
      // point sprites and scan lines are sized in world units: keep them in step with the scaled-down lab
      this.sizePoints(this.root.scale.x);
      U.uScanFreq.value = 70 / this.root.scale.x;
    }
    if (!xr) this.placeCamera();
    const useBloom = this.bloom && this.wantBloom && !xr;
    this.scene.background = useBloom ? NAVY : xr && !this.arMode ? NAVY : null;
    if (useBloom) {
      this.bloom!.render();
      // drop bloom for good if the device cannot hold a reasonable frame rate with it
      if (this.fps < 38 && ++this.slow > 120) this.wantBloom = false;
    } else this.renderer.render(this.scene, this.camera);
  };
  arMode = false;

  private placeCamera() {
    const o = this.orbit;
    const fitPortrait = Math.max(1, 1.2 / this.camera.aspect);
    const d = o.dist * o.zoom * fitPortrait;
    const cp = Math.cos(o.pitch);
    this.camera.position.set(o.target.x + Math.sin(o.yaw) * cp * d, o.target.y + Math.sin(o.pitch) * d, o.target.z + Math.cos(o.yaw) * cp * d);
    this.camera.lookAt(o.target);
  }

  // ---- picking -----------------------------------------------------------
  private rect(): DOMRect {
    return this.renderer.domElement.getBoundingClientRect();
  }

  /** Template-local point -> canvas pixel coordinates. */
  toScreen(local: THREE.Vector3): { x: number; y: number } {
    const r = this.rect();
    tmp.copy(local);
    this.template?.group.localToWorld(tmp);
    tmp.project(this.cam());
    return { x: (tmp.x * 0.5 + 0.5) * r.width, y: (-tmp.y * 0.5 + 0.5) * r.height };
  }

  private setRay(cx: number, cy: number) {
    const r = this.rect();
    this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.cam());
  }

  private pickHandle(cx: number, cy: number): Handle | null {
    if (!this.template) return null;
    const r = this.rect();
    const x = cx - r.left, y = cy - r.top;
    let best: Handle | null = null, bestD = 1e9;
    for (const h of [...this.template.handles(), ...this.extraHandles]) {
      if (h.enabled && !h.enabled()) continue;
      const s = this.toScreen(h.pos);
      const edge = this.toScreen(tmp2.copy(h.pos).add(new THREE.Vector3(h.radius, 0, 0)));
      const reach = Math.max(30, Math.hypot(edge.x - s.x, edge.y - s.y) * 1.2);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < reach && d < bestD) { best = h; bestD = d; }
    }
    return best;
  }

  /** Name of the part nearest to a canvas point (within a finger-sized radius), or null. */
  pick(cx: number, cy: number, reach = 40): string | null {
    if (!this.template) return null;
    const r = this.rect();
    const x = cx - r.left, y = cy - r.top;
    let best: string | null = null, bestD = reach;
    for (const [name, target] of Object.entries(this.template.pickTargets())) {
      const d = this.distTo(target, x, y);
      if (d < bestD) { best = name; bestD = d; }
    }
    return best;
  }

  private distTo(t: PickTarget, x: number, y: number): number {
    if (!Array.isArray(t)) {
      const s = this.toScreen(t);
      return Math.hypot(s.x - x, s.y - y) * 0.8; // points win ties against lines
    }
    const a = this.toScreen(t[0]), b = this.toScreen(t[1]);
    const dx = b.x - a.x, dy = b.y - a.y;
    const k = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(a.x + dx * k - x, a.y + dy * k - y);
  }

  private localOnPlane(cx: number, cy: number, plane: THREE.Plane): THREE.Vector3 | null {
    this.setRay(cx, cy);
    const hit = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit || !this.template) return null;
    return this.template.group.worldToLocal(hit);
  }

  private planeFor(pos: THREE.Vector3, axis: 'x' | 'y' | 'z') {
    const g = this.template!.group;
    g.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).transformDirection(g.matrixWorld);
    this.plane.setFromNormalAndCoplanarPoint(n, g.localToWorld(pos.clone()));
  }

  // ---- pointer input -----------------------------------------------------
  private down = (e: PointerEvent) => {
    if (this.presenting && !this.arTouch) return;
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.moved = 0;
      this.downAt = performance.now();
      this.active = this.pickHandle(e.clientX, e.clientY);
      if (this.active?.drag) {
        this.planeFor(this.active.pos, this.active.plane ?? 'z');
        const p = this.localOnPlane(e.clientX, e.clientY, this.plane);
        if (p) this.active.drag(p, 'start');
      }
    } else if (this.pointers.size === 2) {
      if (this.active?.drag) this.active.drag(this.active.pos.clone(), 'end');
      this.active = null;
      const [a, b] = [...this.pointers.values()];
      this.gesture = { dist: Math.hypot(a.x - b.x, a.y - b.y), midY: (a.y + b.y) / 2, zoom: this.presenting ? this.root.scale.x : this.orbit.zoom, slice: this.slice, mode: '' };
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.active?.drag) {
        const l = this.localOnPlane(e.clientX, e.clientY, this.plane);
        if (l) this.active.drag(l, 'move');
      } else if (this.moved > 6 && this.presenting) {
        this.root.rotation.y += dx * 0.01; // AR: turn the lab itself
      } else if (this.moved > 6) {
        this.orbit.yaw -= dx * 0.008;
        this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.006, -0.25, 1.5);
      }
    } else if (this.pointers.size === 2 && this.gesture) {
      const [a, b] = [...this.pointers.values()];
      const g = this.gesture;
      const dist = Math.hypot(a.x - b.x, a.y - b.y), midY = (a.y + b.y) / 2;
      if (!g.mode && (Math.abs(dist - g.dist) > 14 || Math.abs(midY - g.midY) > 14)) {
        g.mode = Math.abs(dist - g.dist) >= Math.abs(midY - g.midY) || !this.template?.canSlice ? 'zoom' : 'slice';
      }
      if (g.mode === 'zoom' && this.presenting) this.root.scale.setScalar(clamp((g.zoom * dist) / Math.max(20, g.dist), 0.05, 1));
      else if (g.mode === 'zoom') this.orbit.zoom = clamp((g.zoom * g.dist) / Math.max(20, dist), 0.35, 2.5);
      if (g.mode === 'slice') this.setSlice(g.slice - (midY - g.midY) / 160);
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const single = this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.gesture = null;
    if (!single) return;
    const tap = this.moved < 10 && performance.now() - this.downAt < 450 && e.type === 'pointerup';
    const h = this.active;
    this.active = null;
    if (h?.drag) h.drag(h.pos.clone(), 'end');
    if (!tap) return;
    if (h?.tap) {
      h.tap();
      return;
    }
    this.onTap?.(this.pick(e.clientX, e.clientY));
    if (this.onTapPoint && this.template) {
      this.planeFor(new THREE.Vector3(), 'z');
      const l = this.localOnPlane(e.clientX, e.clientY, this.plane);
      if (l) this.onTapPoint(l);
    }
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.orbit.zoom = clamp(this.orbit.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 2.5);
  };

  /** Camera elevation above the template's upright plane, in radians (0 = face-on). Used for parallax. */
  viewObliqueness(): number {
    if (!this.template) return 0;
    const g = this.template.group;
    g.updateWorldMatrix(true, false);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld);
    const cam = new THREE.Vector3();
    this.cam().getWorldPosition(cam);
    const to = cam.sub(g.localToWorld(new THREE.Vector3(...(this.template.view.target)))).normalize();
    return Math.acos(clamp(Math.abs(n.dot(to)), 0, 1));
  }
}

const NAVY = new THREE.Color(0x0a1230);

let stage: Stage | null = null;
export function getStage(): Stage {
  stage ??= new Stage();
  (window as unknown as { __stage: Stage }).__stage = stage; // for automated run-throughs
  return stage;
}
export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
