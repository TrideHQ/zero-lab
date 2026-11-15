import * as THREE from 'three';
import type { State } from '../types.ts';
import type { ControlSpec, Handle, PickTarget, SetOpts, Template, ViewHint } from './types.ts';

/** Shared state handling: numeric keys ease towards their target, the rest switch at once. */
export abstract class BaseTemplate implements Template {
  abstract readonly name: string;
  group = new THREE.Group();
  view: ViewHint = { dist: 3.6, target: [0, 0.8, 0], yaw: 0, pitch: 0.12 };
  canSlice = false;
  onChange: ((s: State) => void) | null = null;
  protected state: State = {};
  protected target: State = {};
  protected defaults: State = {};
  protected dirty = true;
  protected disposables: { dispose(): void }[] = [];
  readonly preset: string;
  readonly params: State;
  readonly lite: boolean;

  constructor(preset: string, params: State, lite: boolean) {
    this.preset = preset;
    this.params = params;
    this.lite = lite;
  }

  /** Call once from the subclass constructor. Params override defaults with the same key. */
  protected init(defaults: State) {
    this.defaults = { ...defaults };
    for (const k of Object.keys(defaults)) if (k in this.params) this.defaults[k] = this.params[k];
    this.state = { ...this.defaults };
    this.target = { ...this.defaults };
  }

  setState(s: State, o: SetOpts = {}) {
    const animate = o.animate ?? true;
    const next = o.reset ? { ...this.defaults, ...s } : { ...this.target, ...s };
    for (const k of Object.keys(next)) {
      if (!(k in this.defaults)) continue;
      this.target[k] = next[k];
      if (typeof next[k] !== 'number' || !animate) this.state[k] = next[k];
    }
    this.dirty = true;
    this.changed(s);
  }

  /** Immediate change from a drag or a control; notifies the UI so sliders follow. */
  protected put(k: string, v: number | boolean | string) {
    this.state[k] = v;
    this.target[k] = v;
    this.dirty = true;
    this.onChange?.(this.target);
  }

  getState(): State {
    return { ...this.target };
  }

  protected n(k: string): number {
    return this.state[k] as number;
  }
  protected b(k: string): boolean {
    return !!this.state[k];
  }

  update(dt: number, t: number) {
    let moving = false;
    const f = Math.min(1, dt * 7);
    for (const k of Object.keys(this.target)) {
      const to = this.target[k], cur = this.state[k];
      if (typeof to === 'number' && typeof cur === 'number' && cur !== to) {
        const next = cur + (to - cur) * f;
        this.state[k] = Math.abs(to - next) < 1e-4 * Math.max(1, Math.abs(to)) ? to : next;
        moving = true;
      }
    }
    if (moving || this.dirty) {
      this.dirty = false;
      this.apply();
    }
    this.tick(dt, t);
  }

  protected keep<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** Mesh helper that tracks geometry and material for disposal. */
  protected mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.group): THREE.Mesh {
    this.keep(geo);
    this.keep(mat);
    const m = new THREE.Mesh(geo, mat);
    parent.add(m);
    return m;
  }

  protected changed(_s: State): void {}
  protected abstract apply(): void;
  protected tick(_dt: number, _t: number): void {}
  abstract pickTargets(): Record<string, PickTarget>;
  diagramTargets(): string[] {
    return Object.keys(this.pickTargets());
  }
  handles(): Handle[] {
    return [];
  }
  controls(): ControlSpec[] {
    return [];
  }
  action(_key: string): void {}

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.group.removeFromParent();
  }
}

export const DEG = Math.PI / 180;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const v3 = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
