// circuit-board: battery, switch, rheostat, resistor(s), ammeter and voltmeter
// on a hologram board. Currents and voltages are solved in code; electrons
// drift at a speed proportional to the current. In practical mode the student
// drags each component from the tray onto its place before the circuit works.
import * as THREE from 'three';
import type { State } from '../../types.ts';
import type { ControlSpec, Handle, PickTarget, Template } from '../types.ts';
import { BaseTemplate, clamp, v3 } from '../base.ts';
import { Beams, type P3, type Seg } from '../../render/beams.ts';
import { Label } from '../../render/label.ts';
import { CYAN, TEAL, WARM, WHITE, C_HOT, C_YELLOW, edges, holo } from '../../render/hologram-shader.ts';

const X0 = -1.1, X1 = 1.1, Y0 = 0.55, Y1 = 1.45;
export const RHEOSTAT_MAX = 20;
export const RES = { V: 0.1, I: 0.02 };

export interface Solved { I: number; V: number; V1: number; V2: number; I1: number; I2: number; Req: number }

/** Solve the three circuits. `rheo` is the rheostat fraction 0..1 (ohm preset only). */
export function solve(preset: string, on: boolean, emf: number, R1: number, R2: number, rheo: number): Solved {
  const z: Solved = { I: 0, V: 0, V1: 0, V2: 0, I1: 0, I2: 0, Req: 0 };
  if (preset === 'series') {
    z.Req = R1 + R2;
    if (on) { z.I = emf / z.Req; z.V1 = z.I * R1; z.V2 = z.I * R2; z.V = emf; }
  } else if (preset === 'parallel') {
    z.Req = (R1 * R2) / (R1 + R2);
    if (on) { z.I1 = emf / R1; z.I2 = emf / R2; z.I = z.I1 + z.I2; z.V = emf; }
  } else {
    z.Req = R1 + rheo * RHEOSTAT_MAX;
    if (on) { z.I = emf / z.Req; z.V = z.I * R1; }
  }
  return z;
}

/** Small deterministic PRNG so meter noise is repeatable in tests. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kind = 'battery' | 'switch' | 'rheostat' | 'resistor' | 'ammeter' | 'voltmeter';
interface Comp { name: string; kind: Kind; slot: [number, number]; tray: [number, number]; pos: THREE.Vector3; g: THREE.Group; placed: boolean; vertical: boolean; order: number }

export interface CircuitBench {
  total: number;
  placed(): number;
  complete(): boolean;
  place(name: string): void;
  placeAll(): void;
  setSwitch(on: boolean): void;
  switchOn(): boolean;
  setRheostat(v: number): void;
  rheostat(): number;
  /** What the meters display right now (resolution, calibration and noise included). */
  displayV(): number;
  displayI(): number;
  trueV(): number;
  trueI(): number;
}

class CircuitBoard extends BaseTemplate {
  readonly name = 'circuit-board';
  private beams = new Beams(900);
  private comps: Comp[] = [];
  private labels: Record<string, Label> = {};
  private targets: Record<string, PickTarget> = {};
  private electrons: THREE.Points;
  private loops: { pts: P3[]; len: number[]; total: number; key: 'I' | 'I1' | 'I2' }[] = [];
  private phase = [0, 0];
  private nEl: number;
  private sol: Solved = solve('ohm', false, 6, 1, 1, 0);
  private knob = v3(0, 0);
  private building = false;
  private heat = 0;
  private cal = { V: 1, I: 1 };
  private noise = { V: 0, I: 0 };
  private rand: () => number;
  private noiseT = 0;
  private dragging: Comp | null = null;

  constructor(preset: string, params: State, lite: boolean) {
    super(preset, params, lite);
    this.view = { dist: 4.3, target: [0, 0.95, 0], yaw: 0.16, pitch: 0.14 };
    this.canSlice = true;
    this.rand = rng(Number(params.seed ?? 7));
    this.cal = { V: 1 + (this.rand() - 0.5) * 0.02, I: 1 + (this.rand() - 0.5) * 0.02 };
    if (preset === 'ohm') this.init({ switchOn: true, rheo: 0.3, R: 4.7, emf: 6, electrons: true, explode: 0 });
    else this.init({ switchOn: true, R1: 4, R2: 8, emf: 6, electrons: true, explode: 0 });
    this.group.add(this.beams.mesh);
    this.keep(this.beams);

    const bg = new THREE.BoxGeometry(2.7, 1.75, 0.04);
    const board = this.mesh(bg, holo(TEAL, { opacity: 0.5, fill: 0.06, rim: 1.2, scan: 0.35 }));
    board.position.set(0, 0.92, -0.06);
    board.add(edges(bg, TEAL, 0.5));

    const add = (name: string, kind: Kind, slot: [number, number], vertical = false) => {
      const g = new THREE.Group();
      this.group.add(g);
      const order = this.comps.length;
      const c: Comp = { name, kind, slot, tray: [-1.25 + order * 0.5, 2.05], pos: v3(slot[0], slot[1]), g, placed: true, vertical, order };
      this.comps.push(c);
      this.buildComp(c);
      return c;
    };
    add('battery', 'battery', [X0, 1.0], true);
    add('switch', 'switch', [-0.5, Y1]);
    if (preset === 'ohm') {
      add('rheostat', 'rheostat', [0.45, Y1]);
      add('resistor', 'resistor', [0, Y0]);
      add('ammeter', 'ammeter', [X1, 1.0], true);
      add('voltmeter', 'voltmeter', [0, 0.17]);
    } else if (preset === 'series') {
      add('resistor', 'resistor', [-0.45, Y0]);
      add('resistor2', 'resistor', [0.45, Y0]);
      add('ammeter', 'ammeter', [X1, 1.0], true);
    } else {
      add('resistor', 'resistor', [0, Y0]);
      add('resistor2', 'resistor', [0, 0.17]);
      add('ammeter', 'ammeter', [0.45, Y1]);
    }
    const main: P3[] = [[X0, Y1, 0], [X0, Y0, 0], [X1, Y0, 0], [X1, Y1, 0]]; // electron drift direction (− to +)
    if (preset === 'parallel') {
      this.loops.push(this.loop(main, 'I1'));
      this.loops.push(this.loop([[X0, Y1, 0], [X0, Y0, 0], [-0.6, Y0, 0], [-0.6, 0.17, 0], [0.6, 0.17, 0], [0.6, Y0, 0], [X1, Y0, 0], [X1, Y1, 0]], 'I2'));
    } else this.loops.push(this.loop(main, 'I'));

    for (const k of ['info', 'a', 'b']) {
      const l = this.keep(new Label('', { color: k === 'info' ? '#7cf0c0' : '#ffd9a3', size: 0.075 }));
      this.labels[k] = l;
      this.group.add(l.sprite);
    }
    this.nEl = lite ? 22 : 44;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.nEl * 3), 3));
    this.electrons = new THREE.Points(pg, new THREE.PointsMaterial({ color: C_YELLOW, size: 0.055, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.electrons.frustumCulled = false;
    this.group.add(this.electrons);
  }

  private loop(pts: P3[], key: 'I' | 'I1' | 'I2') {
    const len: number[] = [];
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      len.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
      total += len[i];
    }
    return { pts, len, total, key };
  }

  private buildComp(c: Comp) {
    const g = c.g;
    const body = (geo: THREE.BufferGeometry, color = CYAN, fill = 0.3) => {
      const m = this.mesh(geo, holo(color, { opacity: 0.95, fill, rim: 1.3 }), g);
      m.add(edges(geo, color, 0.8, 30));
      return m;
    };
    if (c.kind === 'battery') {
      body(new THREE.BoxGeometry(0.2, 0.36, 0.16), WARM, 0.35);
      const cap = body(new THREE.BoxGeometry(0.09, 0.05, 0.09), WARM, 0.5);
      cap.position.y = 0.2;
    } else if (c.kind === 'switch') {
      for (const x of [-0.14, 0.14]) body(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), WARM, 0.6).position.set(x, 0, 0.02);
      const lever = body(new THREE.BoxGeometry(0.3, 0.025, 0.05), WARM, 0.7);
      lever.name = 'lever';
      lever.geometry.translate(0.15, 0, 0);
      lever.position.set(-0.14, 0, 0.06);
    } else if (c.kind === 'rheostat') {
      body(new THREE.BoxGeometry(0.62, 0.11, 0.13), CYAN, 0.2);
      const k = body(new THREE.BoxGeometry(0.07, 0.18, 0.16), WARM, 0.7);
      k.name = 'knob';
    } else if (c.kind === 'resistor') {
      const shell = body(new THREE.CylinderGeometry(0.07, 0.07, 0.36, this.lite ? 10 : 18), CYAN, 0.25);
      shell.rotation.z = Math.PI / 2;
      shell.name = 'shell';
      [-0.1, -0.03, 0.04, 0.11].forEach((x, i) => {
        const band = body(new THREE.CylinderGeometry(0.074, 0.074, 0.03, 12), [C_YELLOW, C_HOT, WARM, WHITE][i], 0.8);
        band.rotation.z = Math.PI / 2;
        band.position.x = x;
        band.name = 'band';
      });
    } else {
      const face = body(new THREE.CylinderGeometry(0.19, 0.19, 0.05, this.lite ? 16 : 28), c.kind === 'ammeter' ? CYAN : WHITE, 0.14);
      face.rotation.x = Math.PI / 2;
      const letter = this.keep(new Label(c.kind === 'ammeter' ? 'A' : 'V', { color: '#e8f7ff', size: 0.11, weight: 800 }));
      letter.at(0, 0.02, 0.06);
      g.add(letter.sprite);
      const read = this.keep(new Label('', { color: '#fff0b8', size: 0.085, bg: 'rgba(10,18,48,0.85)', weight: 700 }));
      read.at(c.vertical ? 0.02 : 0, c.vertical ? -0.33 : -0.31, 0.08);
      g.add(read.sprite);
      this.labels['read_' + c.name] = read;
    }
  }

  // ---- circuit state -----------------------------------------------------
  private complete(): boolean {
    return this.comps.every((c) => c.placed);
  }

  private effectiveR(): number {
    const R = this.preset === 'ohm' ? this.n('R') : this.n('R1');
    return R * (1 + 0.012 * this.heat);
  }

  protected apply() {
    const on = this.b('switchOn') && this.complete();
    this.sol = this.preset === 'ohm'
      ? solve('ohm', on, this.n('emf'), this.effectiveR(), 0, this.n('rheo'))
      : solve(this.preset, on, this.n('emf'), this.n('R1'), this.n('R2'), 0);
    this.draw();
  }

  private shown(kind: 'V' | 'I'): number {
    const truth = kind === 'V' ? this.sol.V : this.sol.I;
    if (truth === 0) return 0;
    const res = RES[kind];
    return Math.max(0, Math.round((truth * this.cal[kind] + this.noise[kind] * res) / res) * res);
  }

  private draw() {
    const segs: Seg[] = [];
    const ex = this.n('explode');
    const done = this.complete();
    const wireAlpha = done ? 1 - ex * 0.6 : 0.22;
    const dash = done ? undefined : 0.03;
    const wire = (a: P3, b: P3) => segs.push({ a, b, c: CYAN, w: 0.016, alpha: wireAlpha, dash });
    // main loop, with a gap under the switch
    const sw = this.comps.find((c) => c.kind === 'switch')!;
    wire([X0, Y0, 0], [X0, Y1, 0]);
    wire([X0, Y1, 0], [sw.slot[0] - 0.14, Y1, 0]);
    wire([sw.slot[0] + 0.14, Y1, 0], [X1, Y1, 0]);
    wire([X1, Y1, 0], [X1, Y0, 0]);
    wire([X1, Y0, 0], [X0, Y0, 0]);
    if (this.preset === 'ohm') {
      wire([-0.36, Y0, 0], [-0.36, 0.17, 0]);
      wire([-0.36, 0.17, 0], [-0.19, 0.17, 0]);
      wire([0.36, Y0, 0], [0.36, 0.17, 0]);
      wire([0.36, 0.17, 0], [0.19, 0.17, 0]);
    } else if (this.preset === 'parallel') {
      wire([-0.6, Y0, 0], [-0.6, 0.17, 0]);
      wire([-0.6, 0.17, 0], [0.6, 0.17, 0]);
      wire([0.6, 0.17, 0], [0.6, Y0, 0]);
    }
    for (const c of this.comps) {
      const lift = ex * (0.12 + c.order * 0.07);
      if (c !== this.dragging) {
        const at = c.placed ? c.slot : c.tray;
        c.pos.set(at[0], at[1], 0);
      }
      c.g.position.set(c.pos.x, c.pos.y, lift + (c.placed ? 0 : 0.05));
      c.g.rotation.z = c.vertical && c.kind !== 'ammeter' && c.kind !== 'voltmeter' ? 0 : 0;
      if (!c.placed) { // ghost outline where it belongs
        const [x, y] = c.slot;
        for (let k = 0; k < 12; k += 2) {
          const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
          segs.push({ a: [x + Math.cos(a0) * 0.2, y + Math.sin(a0) * 0.2, 0], b: [x + Math.cos(a1) * 0.2, y + Math.sin(a1) * 0.2, 0], c: WARM, w: 0.012, alpha: 0.8 });
        }
      }
      if (c.kind === 'switch') {
        const lever = c.g.getObjectByName('lever')!;
        lever.rotation.z = this.b('switchOn') ? 0 : 0.6;
      } else if (c.kind === 'rheostat') {
        const k = c.g.getObjectByName('knob')!;
        k.position.x = -0.26 + this.n('rheo') * 0.52;
        this.knob.set(c.pos.x + k.position.x, c.pos.y, 0);
      } else if (c.kind === 'resistor') {
        const shell = c.g.getObjectByName('shell') as THREE.Mesh;
        (shell.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.95 - ex * 0.8;
        c.g.children.forEach((ch) => { if (ch.name === 'band') ch.position.y = ex * 0.2; });
        if (ex > 0.05) { // the resistive track inside
          let prev: P3 | null = null;
          for (let k = 0; k <= 40; k++) {
            const f = k / 40, a = f * 9 * Math.PI * 2;
            const p: P3 = [c.pos.x - 0.16 + f * 0.32, c.pos.y + Math.sin(a) * 0.045, lift + Math.cos(a) * 0.045];
            if (prev) segs.push({ a: prev, b: p, c: C_HOT, w: 0.01, alpha: ex });
            prev = p;
          }
        }
      } else if (c.kind === 'ammeter' || c.kind === 'voltmeter') {
        const isA = c.kind === 'ammeter';
        const val = isA ? this.shown('I') : this.shown('V');
        const full = isA ? 1.5 : this.n('emf');
        const ang = Math.PI / 2 + 1.05 - clamp(val / full, 0, 1) * 2.1;
        segs.push({ a: [c.pos.x, c.pos.y - 0.05, lift + 0.05], b: [c.pos.x + Math.cos(ang) * 0.15, c.pos.y - 0.05 + Math.sin(ang) * 0.15, lift + 0.05], c: WARM, w: 0.012 });
        this.labels['read_' + c.name].set(c.placed ? `${val.toFixed(isA ? 2 : 1)} ${isA ? 'A' : 'V'}` : isA ? 'A' : 'V');
      }
    }
    const s = this.sol;
    const { info, a, b } = this.labels;
    if (this.preset === 'series') {
      a.set(`R₁ = ${this.n('R1').toFixed(0)} Ω   V₁ = ${s.V1.toFixed(2)} V`);
      a.at(-0.5, Y0 + 0.2, 0.05);
      b.set(`R₂ = ${this.n('R2').toFixed(0)} Ω   V₂ = ${s.V2.toFixed(2)} V`);
      b.at(0.55, Y0 - 0.2, 0.05);
      info.set(`R = R₁ + R₂ = ${s.Req.toFixed(1)} Ω`);
    } else if (this.preset === 'parallel') {
      a.set(`R₁ = ${this.n('R1').toFixed(0)} Ω   I₁ = ${s.I1.toFixed(2)} A`);
      a.at(0, Y0 + 0.19, 0.05);
      b.set(`R₂ = ${this.n('R2').toFixed(0)} Ω   I₂ = ${s.I2.toFixed(2)} A`);
      b.at(0, 0.17 - 0.2, 0.05);
      info.set(`1/R = 1/R₁ + 1/R₂   R = ${s.Req.toFixed(2)} Ω`);
    } else {
      a.set(this.params.hideR ? 'R = ?' : `R = ${this.n('R').toFixed(1)} Ω`);
      a.at(0, Y0 + 0.19, 0.05);
      b.set(`${this.n('emf').toFixed(1)} V`);
      b.at(X0 - 0.02, 1.34, 0.05);
      info.set(this.building && !done ? '' : !this.b('switchOn') ? 'switch open: no current' : '');
    }
    info.at(0, 1.02, 0.05);
    this.electrons.visible = this.b('electrons') && done && s.I > 0 && ex < 0.5;
    this.beams.set(segs);
    this.targets = { wire: [v3(X0 + 0.3, Y0), v3(-0.6, Y0)] };
    for (const c of this.comps) this.targets[c.name] = v3(c.pos.x, c.pos.y, 0);
  }

  protected tick(dt: number, t: number) {
    // meter flicker and (practical only) slow resistor heating while current flows
    if (t - this.noiseT > 0.6) {
      this.noiseT = t;
      this.noise = { V: (this.rand() - 0.5) * 0.9, I: (this.rand() - 0.5) * 0.9 };
      this.dirty = true;
    }
    if (this.building) {
      const p = this.sol.I * this.sol.I * this.effectiveR();
      this.heat = clamp(this.heat + (p * 0.03 - this.heat * 0.05) * dt, 0, 4);
    }
    if (!this.electrons.visible) return;
    const pos = this.electrons.geometry.attributes.position as THREE.BufferAttribute;
    const per = Math.floor(this.nEl / this.loops.length);
    this.loops.forEach((lp, li) => {
      const cur = this.sol[lp.key];
      this.phase[li] = (this.phase[li] + dt * (0.08 + cur * 0.55)) % lp.total;
      for (let k = 0; k < per; k++) {
        let d = (this.phase[li] + (k / per) * lp.total) % lp.total;
        let i = 0;
        while (d > lp.len[i]) d -= lp.len[i++];
        const a = lp.pts[i], b = lp.pts[(i + 1) % lp.pts.length], f = d / lp.len[i];
        pos.setXYZ(li * per + k, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0.03);
      }
    });
    pos.needsUpdate = true;
  }

  // ---- interaction -------------------------------------------------------
  handles(): Handle[] {
    const hs: Handle[] = [];
    for (const c of this.comps) {
      if (!c.placed) {
        hs.push({
          name: c.name, pos: c.pos, radius: 0.2,
          drag: (p, phase) => {
            if (phase === 'end') {
              this.dragging = null;
              if (Math.hypot(c.pos.x - c.slot[0], c.pos.y - c.slot[1]) < 0.34) this.place(c.name);
              this.dirty = true;
              return;
            }
            this.dragging = c;
            c.pos.set(clamp(p.x, -1.5, 1.5), clamp(p.y, 0, 2.2), 0);
            this.dirty = true;
          },
        });
      } else if (c.kind === 'switch') hs.push({ name: 'switch', pos: c.pos, radius: 0.2, tap: () => this.put('switchOn', !this.b('switchOn')) });
      else if (c.kind === 'rheostat') hs.push({ name: 'rheostat', pos: this.knob, radius: 0.14, drag: (p) => this.put('rheo', clamp(Math.round(((p.x - c.pos.x + 0.26) / 0.52) * 50) / 50, 0, 1)) });
    }
    return hs;
  }

  private place(name: string) {
    const c = this.comps.find((x) => x.name === name);
    if (!c || c.placed) return;
    c.placed = true;
    this.dirty = true;
    this.onChange?.(this.target);
  }

  controls(): ControlSpec[] {
    const c: ControlSpec[] = [{ key: 'switchOn', label: 'controls.switch', type: 'toggle' }];
    if (this.preset === 'ohm') {
      c.push({ key: 'rheo', label: 'controls.rheostat', type: 'range', min: 0, max: 1, step: 0.02, dp: 2 });
      if (!this.params.hideR) c.push({ key: 'R', label: 'labels.resistor', type: 'range', min: 1, max: 20, step: 0.1, unit: ' Ω', dp: 1 });
    } else {
      c.push({ key: 'R1', label: 'controls.r1', type: 'range', min: 1, max: 20, step: 1, unit: ' Ω', dp: 0 });
      c.push({ key: 'R2', label: 'controls.r2', type: 'range', min: 1, max: 20, step: 1, unit: ' Ω', dp: 0 });
    }
    c.push({ key: 'emf', label: 'controls.emf', type: 'range', min: 1.5, max: 12, step: 1.5, unit: ' V', dp: 1 });
    c.push({ key: 'electrons', label: 'controls.electrons', type: 'toggle' });
    return c;
  }

  pickTargets() {
    return this.targets;
  }

  diagramTargets(): string[] {
    return this.comps.map((c) => c.name);
  }

  /** Practical mode: components start in the tray and must be placed by hand. */
  bench(): CircuitBench {
    this.building = true;
    this.comps.forEach((c) => (c.placed = false));
    this.state.switchOn = this.target.switchOn = false;
    this.view = { dist: 5.2, target: [0, 1.12, 0], yaw: 0.1, pitch: 0.12 };
    this.dirty = true;
    return {
      total: this.comps.length,
      placed: () => this.comps.filter((c) => c.placed).length,
      complete: () => this.complete(),
      place: (n) => this.place(n),
      placeAll: () => this.comps.forEach((c) => this.place(c.name)),
      setSwitch: (on) => this.put('switchOn', on),
      switchOn: () => this.b('switchOn'),
      setRheostat: (v) => this.put('rheo', clamp(v, 0, 1)),
      rheostat: () => this.n('rheo'),
      displayV: () => { this.apply(); return this.shown('V'); },
      displayI: () => { this.apply(); return this.shown('I'); },
      trueV: () => { this.apply(); return this.sol.V; },
      trueI: () => { this.apply(); return this.sol.I; },
    };
  }
}

export type { CircuitBoard };
export function create(preset: string, params: State, lite: boolean): Template {
  return new CircuitBoard(preset, params, lite);
}
