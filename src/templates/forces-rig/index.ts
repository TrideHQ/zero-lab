// forces-rig: simple pendulum, spring (Hooke's law) and a pivoted metre rule
// (moments). Motion is integrated in code; nothing here is pre-animated.
import * as THREE from 'three';
import type { State } from '../../types.ts';
import type { ControlSpec, Handle, PickTarget, Template } from '../types.ts';
import { BaseTemplate, DEG, clamp, v3 } from '../base.ts';
import { Beams, arrow, arc, type P3, type Seg } from '../../render/beams.ts';
import { Label } from '../../render/label.ts';
import { CYAN, TEAL, WARM, C_FORCE, C_FORCE2, C_ALT, C_GOOD, edges, holo } from '../../render/hologram-shader.ts';

/** Model units per metre. */
export const SCALE = 1.3;
const PIVOT_Y = 1.62;

/** Period of a simple pendulum, with the standard large-amplitude correction. */
export function pendulumPeriod(L: number, g: number, ampDeg = 0): number {
  const a = ampDeg * DEG;
  return 2 * Math.PI * Math.sqrt(L / g) * (1 + (a * a) / 16 + (11 * a ** 4) / 3072);
}

/** Extension (m) of a spring of stiffness k under mass m; stiffens past the elastic limit load. */
export function springExtension(m: number, k: number, g: number, limitKg = 0.5): number {
  const e = (m * g) / k;
  if (m <= limitKg) return e;
  const over = ((m - limitKg) * g) / k;
  return e + over * 1.8; // past the limit the spring stretches more than Hooke's law predicts
}

/** Net anticlockwise moment (N m) about the pivot: left mass minus right mass. */
export const netMoment = (m1: number, d1: number, m2: number, d2: number, g: number) => g * (m1 * d1 - m2 * d2);

export interface PendulumBench {
  setLength(L: number): void;
  pull(deg: number): void;
  release(): void;
  stop(): void;
  /** Simulated seconds since release. */
  time(): number;
  /** Completed oscillations since release. */
  swings(): number;
  releaseAmp(): number;
  running(): boolean;
  timeScale: number;
}

class ForcesRig extends BaseTemplate {
  readonly name = 'forces-rig';
  private beams = new Beams(700);
  private labels: Record<string, Label> = {};
  private targets: Record<string, PickTarget> = {};
  private bob: THREE.Mesh | null = null;
  private bobPos = v3(0, 0);
  private clampPos = v3(0, 0);
  private h1 = v3(0, 0);
  private h2 = v3(0, 0);
  // pendulum dynamics
  private theta = 0;
  private omega = 0;
  private simT = 0;
  private count = 0;
  private relAmp = 0;
  timeScale = 1;
  // spring / beam dynamics
  private ext = 0;
  private extV = 0;
  private tilt = 0;
  private tiltV = 0;
  private load: THREE.Mesh | null = null;
  private m1: THREE.Mesh | null = null;
  private m2: THREE.Mesh | null = null;

  constructor(preset: string, params: State, lite: boolean) {
    super(preset, params, lite);
    this.view = { dist: 3.9, target: [0, 0.92, 0], yaw: 0.3, pitch: 0.12 };
    if (preset === 'spring') this.init({ mass: 0.2, k: 25, g: 9.81, arrows: true });
    else if (preset === 'moments') this.init({ m1: 0.2, d1: 0.4, m2: 0.4, d2: 0.2, g: 9.81, arrows: true });
    else this.init({ L: 0.6, amp: 10, g: 9.81, running: true, arrows: false });
    this.group.add(this.beams.mesh);
    this.keep(this.beams);
    this.build();
    this.theta = this.n('amp') * DEG || 0;
    this.relAmp = this.n('amp') || 0;
  }

  private label(key: string, color = '#e8f7ff', size = 0.08): Label {
    const l = this.keep(new Label('', { color, size }));
    this.labels[key] = l;
    this.group.add(l.sprite);
    return l;
  }

  private build() {
    const base = new THREE.BoxGeometry(0.7, 0.05, 0.4);
    const bm = this.mesh(base, holo(TEAL, { opacity: 0.8, fill: 0.2 }));
    bm.add(edges(base));
    if (this.preset === 'moments') {
      bm.position.set(0, 0.025, 0);
      const tri = new THREE.ConeGeometry(0.11, 0.72, 4);
      const t = this.mesh(tri, holo(TEAL, { opacity: 0.9, fill: 0.25 }));
      t.position.set(0, 0.41, 0);
      t.add(edges(tri));
      const box = new THREE.BoxGeometry(0.13, 0.13, 0.13);
      this.m1 = this.mesh(box, holo(WARM, { opacity: 1, fill: 0.45 }));
      this.m2 = this.mesh(box.clone(), holo(WARM, { opacity: 1, fill: 0.45 }));
      this.m1.add(edges(box, WARM));
      this.m2.add(edges(box, WARM));
      this.label('l1', '#ffd9a3', 0.07);
      this.label('l2', '#ffd9a3', 0.07);
      this.label('status', '#7cf0c0', 0.085);
      return;
    }
    bm.position.set(-0.55, 0.025, 0);
    if (this.preset === 'spring') {
      const g = new THREE.CylinderGeometry(0.1, 0.1, 1, this.lite ? 12 : 20);
      this.load = this.mesh(g, holo(WARM, { opacity: 1, fill: 0.45 }));
      this.label('m', '#ffd9a3', 0.075);
      this.label('e', '#8fe9ff', 0.075);
      this.label('status', '#ff8a7a', 0.07);
    } else {
      const g = new THREE.SphereGeometry(0.075, this.lite ? 12 : 24, this.lite ? 8 : 16);
      this.bob = this.mesh(g, holo(WARM, { opacity: 1, fill: 0.5, rim: 1.4 }));
      this.label('L', '#8fe9ff', 0.075);
      this.label('W', '#ffcf7a', 0.07);
      this.label('T', '#9fd4ff', 0.07);
    }
  }

  protected changed(s: State) {
    if (this.preset !== 'pendulum') return;
    if ('amp' in s || 'running' in s || 'L' in s) {
      this.theta = Number(this.target.amp) * DEG;
      this.omega = 0;
      this.simT = 0;
      this.count = 0;
      this.relAmp = Number(this.target.amp);
    }
  }

  // ---- dynamics ----------------------------------------------------------
  protected tick(dt: number) {
    if (this.preset === 'pendulum') {
      if (this.b('running')) {
        const L = this.n('L'), g = this.n('g');
        const total = dt * this.timeScale;
        const steps = Math.max(8, Math.ceil(total / 0.002));
        const hh = total / steps;
        for (let i = 0; i < steps; i++) { // velocity Verlet keeps the period accurate
          const a0 = -(g / L) * Math.sin(this.theta);
          const before = this.theta;
          this.theta += this.omega * hh + 0.5 * a0 * hh * hh;
          const a1 = -(g / L) * Math.sin(this.theta);
          this.omega += 0.5 * (a0 + a1) * hh;
          if (before < 0 && this.theta >= 0) this.count++; // one full swing per same-direction centre pass
        }
        this.simT += total;
      }
      this.drawPendulum();
    } else if (this.preset === 'spring') {
      const target = springExtension(this.n('mass'), this.n('k'), this.n('g'));
      const w2 = 60;
      this.extV += (-w2 * (this.ext - target) - 6 * this.extV) * dt;
      this.ext += this.extV * dt;
      this.drawSpring();
    } else {
      const net = netMoment(this.n('m1'), this.n('d1'), this.n('m2'), this.n('d2'), this.n('g'));
      const target = clamp(net * 0.9, -0.3, 0.3);
      this.tiltV += (-40 * (this.tilt - target) - 7 * this.tiltV) * dt;
      this.tilt += this.tiltV * dt;
      this.drawMoments(net);
    }
  }

  protected apply() {
    if (this.preset === 'pendulum' && !this.b('running')) this.theta = this.n('amp') * DEG;
  }

  private stand(segs: Seg[], armTo = 0) {
    segs.push({ a: [-0.55, 0.05, 0], b: [-0.55, 1.72, 0], c: TEAL, w: 0.03 });
    segs.push({ a: [-0.55, PIVOT_Y, 0], b: [armTo, PIVOT_Y, 0], c: TEAL, w: 0.026 });
  }

  private drawPendulum() {
    const segs: Seg[] = [];
    const L = this.n('L') * SCALE;
    const P: P3 = [0, PIVOT_Y, 0];
    const B: P3 = [Math.sin(this.theta) * L, PIVOT_Y - Math.cos(this.theta) * L, 0];
    this.stand(segs);
    segs.push({ a: P, b: B, c: CYAN, w: 0.012 });
    segs.push({ a: [0, PIVOT_Y, 0], b: [0, PIVOT_Y - L - 0.12, 0], c: CYAN, w: 0.006, dash: 0.03, alpha: 0.35 });
    // metre rule beside the stand, with a sliding marker for the length
    const rx = -0.4;
    segs.push({ a: [rx, PIVOT_Y, 0], b: [rx, PIVOT_Y - SCALE, 0], c: TEAL, w: 0.02, alpha: 0.7 });
    for (let k = 0; k <= 10; k++) segs.push({ a: [rx, PIVOT_Y - (k / 10) * SCALE, 0], b: [rx + (k % 5 === 0 ? 0.07 : 0.04), PIVOT_Y - (k / 10) * SCALE, 0], c: CYAN, w: 0.008 });
    this.clampPos.set(rx, PIVOT_Y - L, 0);
    segs.push({ a: [rx - 0.05, PIVOT_Y - L, 0], b: [rx + 0.12, PIVOT_Y - L, 0], c: WARM, w: 0.022 });
    this.labels.L.set(`L = ${this.n('L').toFixed(2)} m`);
    this.labels.L.at(rx - 0.02, PIVOT_Y + 0.14, 0);
    if (Math.abs(this.theta) > 0.03) segs.push(...arc(0, PIVOT_Y, 0.3, -Math.PI / 2, -Math.PI / 2 + this.theta, CYAN, 0.007));
    const show = this.b('arrows');
    this.labels.W.sprite.visible = this.labels.T.sprite.visible = show;
    if (show) {
      const W: P3 = [B[0], B[1] - 0.34, 0];
      const Tn: P3 = [B[0] - Math.sin(this.theta) * 0.3, B[1] + Math.cos(this.theta) * 0.3, 0];
      segs.push(...arrow(B, W, C_FORCE, 0.02));
      segs.push(...arrow(B, Tn, C_FORCE2, 0.02));
      const r = -Math.sin(this.theta) * 0.34; // restoring component, along the arc
      if (Math.abs(r) > 0.02) segs.push(...arrow(B, [B[0] + Math.cos(this.theta) * r, B[1] + Math.sin(this.theta) * r, 0], C_ALT, 0.018, 0.07));
      this.labels.W.set('W = mg');
      this.labels.W.at(W[0] + 0.2, W[1] + 0.04, 0.02);
      this.labels.T.set('T');
      this.labels.T.at(Tn[0] + 0.08, Tn[1] + 0.03, 0.02);
      this.targets.weight = [v3(...B), v3(...W)];
      this.targets.tension = [v3(...B), v3(...Tn)];
    } else {
      delete this.targets.weight;
      delete this.targets.tension;
    }
    this.bob!.position.set(B[0], B[1], 0);
    this.bobPos.set(B[0], B[1], 0);
    this.beams.set(segs);
    this.targets.pivot = v3(0, PIVOT_Y, 0);
    this.targets.bob = v3(B[0], B[1], 0);
    this.targets.string = [v3(P[0], P[1] - L * 0.25), v3((P[0] + B[0]) / 2, (P[1] + B[1]) / 2)];
    this.targets.rule = [v3(rx, PIVOT_Y - 0.2), v3(rx, PIVOT_Y - SCALE)];
  }

  private drawSpring() {
    const segs: Seg[] = [];
    this.stand(segs);
    const L0 = 0.42, len = L0 + this.ext * 2.2, top = PIVOT_Y - 0.04;
    const coils = 11, n = this.lite ? 44 : 88, r = 0.065;
    let prev: P3 = [0, top, 0];
    segs.push({ a: [0, PIVOT_Y, 0], b: prev, c: CYAN, w: 0.012 });
    for (let k = 1; k <= n; k++) {
      const f = k / n, a = f * coils * Math.PI * 2;
      const p: P3 = [Math.sin(a) * r, top - f * len, Math.cos(a) * r - r];
      segs.push({ a: prev, b: p, c: CYAN, w: 0.012 });
      prev = p;
    }
    const mass = this.n('mass');
    const hgt = 0.03 + mass * 0.42;
    const yLoad = top - len - 0.07 - hgt / 2;
    segs.push({ a: [0, top - len, 0], b: [0, top - len - 0.07, 0], c: CYAN, w: 0.012 });
    this.load!.scale.set(1, hgt, 1);
    this.load!.position.set(0, yLoad, 0);
    this.h1.set(0, yLoad, 0);
    // rule with markers for the unloaded and loaded positions
    const rx = 0.36, y0 = top - L0, y1 = top - len;
    segs.push({ a: [rx, top, 0], b: [rx, 0.25, 0], c: TEAL, w: 0.02, alpha: 0.7 });
    for (let y = top; y > 0.25; y -= 0.11) segs.push({ a: [rx, y, 0], b: [rx - 0.05, y, 0], c: CYAN, w: 0.007 });
    segs.push({ a: [0.1, y0, 0], b: [rx, y0, 0], c: CYAN, w: 0.006, dash: 0.02, alpha: 0.6 });
    segs.push({ a: [0.1, y1, 0], b: [rx, y1, 0], c: WARM, w: 0.01 });
    if (y0 - y1 > 0.03) segs.push(...arrow([rx + 0.1, y0, 0], [rx + 0.1, y1, 0], C_GOOD, 0.014, 0.06));
    const eTrue = springExtension(mass, this.n('k'), this.n('g'));
    this.labels.e.set(`e = ${(eTrue * 100).toFixed(1)} cm`);
    this.labels.e.at(rx + 0.36, (y0 + y1) / 2, 0);
    this.labels.m.set(`m = ${Math.round(mass * 1000)} g`);
    this.labels.m.at(-0.02, yLoad - hgt / 2 - 0.1, 0.1);
    this.labels.status.set(mass > 0.5 ? 'past the elastic limit' : '');
    this.labels.status.sprite.visible = mass > 0.5;
    this.labels.status.at(0.75, PIVOT_Y + 0.12, 0);
    if (this.b('arrows') && mass > 0) {
      const f = mass * 0.5;
      segs.push(...arrow([-0.16, yLoad, 0], [-0.16, yLoad - 0.1 - f, 0], C_FORCE, 0.02));
      segs.push(...arrow([-0.16, yLoad, 0], [-0.16, yLoad + 0.1 + f, 0], C_FORCE2, 0.02));
    }
    this.beams.set(segs);
    this.targets = {
      spring: [v3(0, top - 0.05), v3(0, top - len)],
      load: v3(0, yLoad, 0),
      extension: [v3(rx + 0.1, y0), v3(rx + 0.1, Math.min(y1, y0 - 0.02))],
      rule: [v3(rx, top), v3(rx, 0.3)],
    };
  }

  private drawMoments(net: number) {
    const segs: Seg[] = [];
    const py = 0.79, half = 0.5 * 1.6;
    const c = Math.cos(this.tilt), s = Math.sin(this.tilt);
    // tilt > 0 is anticlockwise: the left end goes down
    const pt = (x: number): P3 => [x * c, py + x * s, 0];
    const A = pt(-half), B = pt(half);
    segs.push({ a: A, b: B, c: CYAN, w: 0.035 });
    for (let k = 0; k <= 10; k++) {
      const x = -half + (k / 10) * 2 * half, p = pt(x);
      segs.push({ a: p, b: [p[0], p[1] + (k === 5 ? 0.09 : 0.05), 0], c: CYAN, w: 0.007 });
    }
    const m1 = this.n('m1'), d1 = this.n('d1'), m2 = this.n('m2'), d2 = this.n('d2');
    const p1 = pt(-d1 * 1.6), p2 = pt(d2 * 1.6);
    const y1 = p1[1] - 0.22, y2 = p2[1] - 0.22;
    segs.push({ a: p1, b: [p1[0], y1 + 0.065, 0], c: CYAN, w: 0.009 }, { a: p2, b: [p2[0], y2 + 0.065, 0], c: CYAN, w: 0.009 });
    const sc = (m: number) => 0.7 + m * 1.6;
    this.m1!.position.set(p1[0], y1, 0);
    this.m1!.scale.setScalar(sc(m1));
    this.m2!.position.set(p2[0], y2, 0);
    this.m2!.scale.setScalar(sc(m2));
    this.h1.set(p1[0], y1, 0);
    this.h2.set(p2[0], y2, 0);
    if (this.b('arrows')) {
      segs.push(...arrow([p1[0], y1 - 0.1, 0], [p1[0], y1 - 0.16 - m1 * 0.5, 0], C_FORCE, 0.02));
      segs.push(...arrow([p2[0], y2 - 0.1, 0], [p2[0], y2 - 0.16 - m2 * 0.5, 0], C_FORCE, 0.02));
      segs.push(...arrow([0, py + 0.03, 0], [0, py + 0.2 + (m1 + m2) * 0.4, 0], C_FORCE2, 0.02));
    }
    const g = this.n('g');
    this.labels.l1.set(`${Math.round(m1 * 1000)} g × ${Math.round(d1 * 100)} cm = ${(m1 * g * d1).toFixed(2)} N m`);
    this.labels.l1.at(-0.72, 1.42, 0);
    this.labels.l2.set(`${Math.round(m2 * 1000)} g × ${Math.round(d2 * 100)} cm = ${(m2 * g * d2).toFixed(2)} N m`);
    this.labels.l2.at(0.72, 1.28, 0);
    const balanced = Math.abs(net) < 0.012;
    this.labels.status.set(balanced ? 'Balanced' : net > 0 ? '↺ turns anticlockwise' : '↻ turns clockwise');
    this.labels.status.at(0, 1.62, 0);
    this.beams.set(segs);
    this.targets = {
      pivot: v3(0, py - 0.04, 0),
      rule: [v3(...pt(0.15)), v3(...B)],
      left_mass: v3(p1[0], y1, 0),
      right_mass: v3(p2[0], y2, 0),
    };
  }

  // ---- interaction -------------------------------------------------------
  handles(): Handle[] {
    if (this.preset === 'pendulum') {
      return [
        {
          name: 'bob', pos: this.bobPos, radius: 0.13,
          drag: (p, phase) => {
            if (phase === 'end') {
              this.setState({ running: true });
              return;
            }
            const a = clamp(Math.atan2(p.x, PIVOT_Y - p.y) / DEG, -70, 70);
            this.state.running = this.target.running = false;
            this.put('amp', Math.round(a));
            this.theta = a * DEG;
            this.omega = 0;
          },
        },
        { name: 'clamp', pos: this.clampPos, radius: 0.1, drag: (p) => { this.setState({ L: clamp(Math.round(((PIVOT_Y - p.y) / SCALE) * 20) / 20, 0.2, 1) }, { animate: false }); this.onChange?.(this.target); } },
      ];
    }
    if (this.preset === 'spring') {
      return [{ name: 'load', pos: this.h1, radius: 0.14, drag: (p) => {
        const e = (PIVOT_Y - 0.04 - 0.42 - 0.12 - p.y) / 2.2;
        this.put('mass', clamp(Math.round(((e * this.n('k')) / this.n('g')) * 20) / 20, 0, 0.7));
      } }];
    }
    return [
      { name: 'left_mass', pos: this.h1, radius: 0.13, drag: (p) => this.put('d1', clamp(Math.round((-p.x / 1.6) * 100) / 100, 0.05, 0.48)) },
      { name: 'right_mass', pos: this.h2, radius: 0.13, drag: (p) => this.put('d2', clamp(Math.round((p.x / 1.6) * 100) / 100, 0.05, 0.48)) },
    ];
  }

  controls(): ControlSpec[] {
    if (this.preset === 'pendulum') {
      return [
        { key: 'L', label: 'controls.length', type: 'range', min: 0.2, max: 1, step: 0.05, unit: ' m', dp: 2 },
        { key: 'amp', label: 'controls.angle', type: 'range', min: 2, max: 60, step: 1, unit: '°', dp: 0 },
        { key: 'g', label: 'controls.gravity', type: 'choice', options: [{ value: '9.81', label: 'controls.earth' }, { value: '1.62', label: 'controls.moon' }] },
        { key: 'arrows', label: 'controls.arrows', type: 'toggle' },
        { key: 'release', label: 'controls.release', type: 'action' },
      ];
    }
    if (this.preset === 'spring') {
      return [
        { key: 'mass', label: 'controls.mass', type: 'range', min: 0, max: 0.7, step: 0.05, unit: ' kg', dp: 2 },
        { key: 'k', label: 'controls.stiffness', type: 'range', min: 10, max: 50, step: 1, unit: ' N/m', dp: 0 },
        { key: 'arrows', label: 'controls.arrows', type: 'toggle' },
      ];
    }
    return [
      { key: 'm1', label: 'controls.left_m', type: 'range', min: 0.05, max: 0.6, step: 0.05, unit: ' kg', dp: 2 },
      { key: 'd1', label: 'controls.left_mass', type: 'range', min: 0.05, max: 0.48, step: 0.01, unit: ' m', dp: 2 },
      { key: 'm2', label: 'controls.right_m', type: 'range', min: 0.05, max: 0.6, step: 0.05, unit: ' kg', dp: 2 },
      { key: 'd2', label: 'controls.right_mass', type: 'range', min: 0.05, max: 0.48, step: 0.01, unit: ' m', dp: 2 },
      { key: 'arrows', label: 'controls.arrows', type: 'toggle' },
    ];
  }

  action(key: string) {
    if (key === 'release') this.setState({ running: true });
  }

  pickTargets() {
    return this.targets;
  }

  diagramTargets(): string[] {
    if (this.preset === 'pendulum') return ['pivot', 'string', 'bob', 'weight', 'tension'];
    if (this.preset === 'spring') return ['spring', 'load', 'extension'];
    return ['pivot', 'rule', 'left_mass', 'right_mass'];
  }

  bench(): PendulumBench {
    const self = this;
    return {
      setLength: (L) => this.setState({ L, running: false }, { animate: false }),
      pull: (deg) => this.setState({ amp: deg, running: false }, { animate: false }),
      release: () => this.setState({ running: true }),
      stop: () => this.setState({ running: false }),
      time: () => this.simT,
      swings: () => this.count,
      releaseAmp: () => this.relAmp,
      running: () => this.b('running'),
      get timeScale() { return self.timeScale; },
      set timeScale(v: number) { self.timeScale = v; },
    };
  }
}

export type { ForcesRig };
export function create(preset: string, params: State, lite: boolean): Template {
  return new ForcesRig(preset, params, lite);
}
