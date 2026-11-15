// ray-optics: plane mirror, rectangular glass block, semicircular block (total
// internal reflection) and thin lenses. All rays are traced in code from the
// state, so the model, the generated diagrams and the practical agree exactly.
import * as THREE from 'three';
import type { State } from '../../types.ts';
import type { ControlSpec, Handle, PickTarget, Template } from '../types.ts';
import { BaseTemplate, DEG, clamp, v3 } from '../base.ts';
import { Beams, arc, arrow, type P3, type Seg } from '../../render/beams.ts';
import { Label } from '../../render/label.ts';
import { CYAN, TEAL, WARM, WHITE, edges, holo } from '../../render/hologram-shader.ts';

const RAY = 0xfff0b8;
const AXIS_Y = 0.8;
const BOUND_X = 1.4;

export interface BlockTrace { entry: P3; exit: P3; r: number; source: P3; end: P3 }

/** Rectangular block geometry shared with the refraction practical. */
export const BLOCK = { cx: 0, cy: 0.75, w: 1.5, h: 0.6, entryX: -0.3 };

/** Snell's law for air -> medium of index n. Angles in degrees. */
export function refractAngle(iDeg: number, n: number): number {
  return Math.asin(clamp(Math.sin(iDeg * DEG) / n, -1, 1)) / DEG;
}

export function traceBlock(iDeg: number, n: number): BlockTrace {
  const top = BLOCK.cy + BLOCK.h / 2;
  const i = iDeg * DEG, r = refractAngle(iDeg, n) * DEG;
  const entry: P3 = [BLOCK.entryX, top, 0];
  const source: P3 = [entry[0] - Math.sin(i) * 0.8, entry[1] + Math.cos(i) * 0.8, 0];
  const exit: P3 = [entry[0] + Math.tan(r) * BLOCK.h, top - BLOCK.h, 0];
  const end: P3 = [exit[0] + Math.sin(i) * 0.6, exit[1] - Math.cos(i) * 0.6, 0];
  return { entry, exit, r: r / DEG, source, end };
}

/** Thin lens (real-is-positive): image distance and magnification. f < 0 for a diverging lens. */
export function thinLens(u: number, f: number): { v: number; m: number } {
  const d = u - f;
  if (Math.abs(d) < 1e-6) return { v: Infinity, m: Infinity };
  const v = (u * f) / d;
  return { v, m: -v / u };
}

/** Critical angle in degrees for glass (index n) to air. */
export const criticalAngle = (n: number) => Math.asin(1 / n) / DEG;

/** Unpolarised Fresnel reflectance going from index n into air at internal angle iDeg. */
export function reflectance(iDeg: number, n: number): number {
  const si = Math.sin(iDeg * DEG) * n;
  if (si >= 1) return 1;
  const ci = Math.cos(iDeg * DEG), ct = Math.sqrt(1 - si * si);
  const rs = (n * ci - ct) / (n * ci + ct), rp = (n * ct - ci) / (n * ct + ci);
  return (rs * rs + rp * rp) / 2;
}

class RayOptics extends BaseTemplate {
  readonly name = 'ray-optics';
  private beams = new Beams(900);
  private labels: Record<string, Label> = {};
  private targets: Record<string, PickTarget> = {};
  private src = v3(0, 0, 0);
  private path: { a: P3; b: P3; v: number }[] = [];
  private photons: THREE.Points;
  private box: THREE.Mesh | null = null;
  private front: THREE.Mesh | null = null;
  private isLens: boolean;
  private concave: boolean;
  private nPhot: number;

  constructor(preset: string, params: State, lite: boolean) {
    super(preset, params, lite);
    this.isLens = preset.endsWith('lens');
    this.concave = preset === 'concave-lens';
    this.view = { dist: 3.5, target: [0, AXIS_Y, 0], yaw: 0.22, pitch: 0.1 };
    if (preset === 'mirror') this.init({ angle: 35, showNormal: true, showImage: false, photons: false });
    else if (preset === 'tir') this.init({ angle: 25, n: 1.5, showNormal: true, photons: false });
    else if (this.isLens) this.init({ u: 0.95, f: 0.4, explode: 0, photons: false });
    else this.init({ angle: 30, n: 1.5, showNormal: true, photons: false });
    this.canSlice = this.isLens;
    this.group.add(this.beams.mesh);
    this.keep(this.beams);
    this.build();

    this.nPhot = lite ? 8 : 16;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.nPhot * 3), 3));
    const pm = new THREE.PointsMaterial({ color: 0xffffff, size: 0.075, map: dot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.photons = new THREE.Points(pg, pm);
    this.photons.frustumCulled = false;
    this.photons.visible = false;
    this.group.add(this.photons);
  }

  private label(key: string, text: string, color = '#e8f7ff', size = 0.085): Label {
    const l = this.keep(new Label(text, { color, size }));
    this.labels[key] = l;
    this.group.add(l.sprite);
    return l;
  }

  private build() {
    const glass = () => holo(TEAL, { opacity: 0.85, fill: 0.1, rim: 1.6 });
    if (this.preset === 'glass-block') {
      const g = new THREE.BoxGeometry(BLOCK.w, BLOCK.h, 0.36);
      this.box = this.mesh(g, glass());
      this.box.position.set(BLOCK.cx, BLOCK.cy, 0);
      this.box.add(edges(g));
      this.label('n', 'n', '#8fe9ff');
    } else if (this.preset === 'tir') {
      const s = new THREE.Shape();
      s.moveTo(-0.62, 0);
      s.absarc(0, 0, 0.62, Math.PI, Math.PI * 2, false);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false, curveSegments: this.lite ? 16 : 32 });
      g.translate(0, AXIS_Y, -0.15);
      this.box = this.mesh(g, glass());
      this.box.add(edges(g, CYAN, 0.9, 30));
      this.label('n', 'n', '#8fe9ff');
      this.label('c', '', '#ffd9a3', 0.075);
    } else if (this.preset === 'mirror') {
      const g = new THREE.BoxGeometry(1.9, 0.04, 0.42);
      this.box = this.mesh(g, holo(CYAN, { opacity: 0.95, fill: 0.45, rim: 1 }));
      this.box.position.set(0, 0.43, 0);
      this.box.add(edges(g));
    } else {
      const R = 0.55, seg = this.lite ? 14 : 28;
      const pts: THREE.Vector2[] = [];
      for (let k = 0; k <= 12; k++) pts.push(new THREE.Vector2(Math.max(1e-3, (R * k) / 12), this.halfWidth((R * k) / 12)));
      for (let k = 12; k >= 0; k--) pts.push(new THREE.Vector2(Math.max(1e-3, (R * k) / 12), -this.halfWidth((R * k) / 12)));
      const half = (start: number) => {
        const m = this.mesh(new THREE.LatheGeometry(pts, seg, start, Math.PI), glass());
        m.rotation.z = Math.PI / 2;
        m.position.y = AXIS_Y;
        return m;
      };
      this.front = half(-Math.PI / 2);
      this.box = half(Math.PI / 2);
      this.label('F1', 'F', '#8fe9ff', 0.075);
      this.label('F2', 'F', '#8fe9ff', 0.075);
      this.label('img', '', '#8fe9ff', 0.07);
    }
    if (!this.isLens) {
      const rb = new THREE.BoxGeometry(0.2, 0.11, 0.14);
      const m = this.mesh(rb, holo(WARM, { opacity: 1, fill: 0.5, rim: 1 }));
      m.name = 'raybox';
      m.add(edges(rb, WARM));
      this.label('i', 'i', '#fff0b8', 0.08);
      this.label('r', 'r', '#fff0b8', 0.08);
    }
  }

  private halfWidth(r: number): number {
    const k = r / 0.55;
    return this.concave ? 0.022 + 0.07 * k * k : 0.012 + 0.075 * (1 - k * k);
  }

  // ---- ray tracing per preset -------------------------------------------
  protected apply() {
    const segs: Seg[] = [];
    this.path = [];
    this.targets = {};
    if (this.preset === 'glass-block') this.applyBlock(segs);
    else if (this.preset === 'mirror') this.applyMirror(segs);
    else if (this.preset === 'tir') this.applyTir(segs);
    else this.applyLens(segs);
    this.beams.set(segs);
    this.photons.visible = this.b('photons');
  }

  private rayBox(at: P3, towards: P3) {
    const rb = this.group.getObjectByName('raybox');
    if (!rb) return;
    this.src.set(at[0], at[1], 0);
    rb.position.copy(this.src);
    rb.rotation.z = Math.atan2(towards[1] - at[1], towards[0] - at[0]);
  }

  private applyBlock(segs: Seg[]) {
    const i = this.n('angle'), n = this.n('n');
    const tr = traceBlock(i, n);
    const top = tr.entry[1], bot = tr.exit[1];
    segs.push({ a: tr.source, b: tr.entry, c: RAY, w: 0.022 });
    segs.push({ a: tr.entry, b: tr.exit, c: RAY, w: 0.022, alpha: 0.85 });
    segs.push({ a: tr.exit, b: tr.end, c: RAY, w: 0.022 });
    // faint partial reflection at the top face
    segs.push({ a: tr.entry, b: [tr.entry[0] + Math.sin(i * DEG) * 0.45, top + Math.cos(i * DEG) * 0.45, 0], c: RAY, w: 0.012, alpha: 0.14 });
    const nTop: P3 = [tr.entry[0], top + 0.5, 0], nBot: P3 = [tr.entry[0], top - 0.42, 0];
    if (this.b('showNormal')) {
      segs.push({ a: nTop, b: nBot, c: CYAN, w: 0.01, dash: 0.035, alpha: 0.9 });
      segs.push({ a: [tr.exit[0], bot + 0.3, 0], b: [tr.exit[0], bot - 0.4, 0], c: CYAN, w: 0.008, dash: 0.035, alpha: 0.5 });
      segs.push(...arc(tr.entry[0], top, 0.2, Math.PI / 2, Math.PI / 2 + i * DEG, RAY, 0.008));
      segs.push(...arc(tr.entry[0], top, 0.24, -Math.PI / 2, -Math.PI / 2 + tr.r * DEG, RAY, 0.008));
    }
    this.labels.i.sprite.visible = this.labels.r.sprite.visible = this.b('showNormal') && i > 6;
    const hi = Math.PI / 2 + (i * DEG) / 2, hr = -Math.PI / 2 + (tr.r * DEG) / 2;
    this.labels.i.at(tr.entry[0] + Math.cos(hi) * 0.3, top + Math.sin(hi) * 0.3, 0.02);
    this.labels.r.at(tr.entry[0] + Math.cos(hr) * 0.34, top + Math.sin(hr) * 0.34, 0.02);
    this.labels.n.set(this.params.hideN ? 'n = ?' : `n = ${n.toFixed(2)}`);
    this.labels.n.at(BLOCK.cx + BLOCK.w / 2 - 0.26, BLOCK.cy - BLOCK.h / 2 + 0.09, 0.2);
    this.rayBox(tr.source, tr.entry);
    this.path = [{ a: tr.source, b: tr.entry, v: 1 }, { a: tr.entry, b: tr.exit, v: 1 / n }, { a: tr.exit, b: tr.end, v: 1 }];
    this.targets = {
      incident: [v3(...tr.source), v3(...tr.entry)],
      refracted: [v3(...tr.entry), v3(...tr.exit)],
      emergent: [v3(...tr.exit), v3(...tr.end)],
      normal: [v3(nTop[0], nTop[1]), v3(nTop[0], top + 0.12)],
      block: v3(BLOCK.cx + 0.45, BLOCK.cy, 0),
    };
  }

  private applyMirror(segs: Seg[]) {
    const i = this.n('angle') * DEG;
    const P: P3 = [0, 0.45, 0];
    const S: P3 = [-Math.sin(i) * 0.95, 0.45 + Math.cos(i) * 0.95, 0];
    const Rf: P3 = [Math.sin(i) * 0.95, 0.45 + Math.cos(i) * 0.95, 0];
    segs.push({ a: S, b: P, c: RAY, w: 0.022 }, { a: P, b: Rf, c: RAY, w: 0.022 });
    for (let k = 0; k < 16; k++) { // hatching marks the silvered back
      const x = -0.92 + k * 0.12;
      segs.push({ a: [x, 0.41, 0], b: [x - 0.06, 0.34, 0], c: TEAL, w: 0.008, alpha: 0.6 });
    }
    const nTop: P3 = [0, 1.25, 0];
    if (this.b('showNormal')) {
      segs.push({ a: P, b: nTop, c: CYAN, w: 0.01, dash: 0.035, alpha: 0.9 });
      segs.push(...arc(0, 0.45, 0.24, Math.PI / 2, Math.PI / 2 + i, RAY, 0.008));
      segs.push(...arc(0, 0.45, 0.28, Math.PI / 2 - i, Math.PI / 2, RAY, 0.008));
    }
    this.labels.i.sprite.visible = this.labels.r.sprite.visible = this.b('showNormal') && i > 0.12;
    this.labels.i.at(Math.cos(Math.PI / 2 + i / 2) * 0.34, 0.45 + Math.sin(Math.PI / 2 + i / 2) * 0.34, 0.02);
    this.labels.r.at(Math.cos(Math.PI / 2 - i / 2) * 0.38, 0.45 + Math.sin(Math.PI / 2 - i / 2) * 0.38, 0.02);
    const img: P3 = [S[0], 0.9 - S[1], 0];
    if (this.b('showImage')) {
      segs.push({ a: P, b: img, c: RAY, w: 0.01, dash: 0.03, alpha: 0.55 });
      segs.push({ a: S, b: img, c: CYAN, w: 0.006, dash: 0.03, alpha: 0.4 });
      segs.push(...arc(img[0], img[1], 0.05, 0, Math.PI * 2, CYAN, 0.012));
    }
    this.rayBox(S, P);
    this.path = [{ a: S, b: P, v: 1 }, { a: P, b: Rf, v: 1 }];
    this.targets = {
      incident: [v3(...S), v3(...P)],
      reflected: [v3(...P), v3(...Rf)],
      normal: [v3(0, 0.6), v3(...nTop)],
      mirror: [v3(-0.9, 0.44), v3(0.9, 0.44)],
    };
    if (this.b('showImage')) this.targets.image = v3(...img);
  }

  private applyTir(segs: Seg[]) {
    const iDeg = this.n('angle'), n = this.n('n');
    const i = iDeg * DEG;
    const C: P3 = [0, AXIS_Y, 0];
    const S: P3 = [-Math.sin(i) * 0.98, AXIS_Y - Math.cos(i) * 0.98, 0];
    const Rf: P3 = [Math.sin(i) * 0.98, AXIS_Y - Math.cos(i) * 0.98, 0];
    const R = reflectance(iDeg, n);
    const total = R >= 1;
    segs.push({ a: S, b: C, c: RAY, w: 0.022 });
    segs.push({ a: C, b: Rf, c: RAY, w: 0.022, alpha: Math.max(0.1, R) });
    let out: P3 | null = null;
    if (!total) {
      const r = Math.asin(n * Math.sin(i));
      out = [Math.sin(r) * 0.75, AXIS_Y + Math.cos(r) * 0.75, 0];
      segs.push({ a: C, b: out, c: RAY, w: 0.022, alpha: Math.max(0.08, 1 - R) });
      if (this.b('showNormal')) segs.push(...arc(0, AXIS_Y, 0.26, Math.PI / 2 - r, Math.PI / 2, RAY, 0.008));
      this.labels.r.at(Math.cos(Math.PI / 2 - r / 2) * 0.36, AXIS_Y + Math.sin(Math.PI / 2 - r / 2) * 0.36, 0.02);
    }
    const nTop: P3 = [0, AXIS_Y + 0.6, 0], nBot: P3 = [0, AXIS_Y - 0.5, 0];
    if (this.b('showNormal')) {
      segs.push({ a: nTop, b: nBot, c: CYAN, w: 0.01, dash: 0.035, alpha: 0.9 });
      segs.push(...arc(0, AXIS_Y, 0.22, -Math.PI / 2 - i, -Math.PI / 2, RAY, 0.008));
    }
    this.labels.i.sprite.visible = this.b('showNormal') && iDeg > 6;
    this.labels.r.sprite.visible = this.b('showNormal') && !total && iDeg > 4;
    this.labels.i.at(Math.cos(-Math.PI / 2 - i / 2) * 0.33, AXIS_Y + Math.sin(-Math.PI / 2 - i / 2) * 0.33, 0.2);
    this.labels.n.set(`n = ${n.toFixed(2)}`);
    this.labels.n.at(0.3, AXIS_Y - 0.5, 0.2);
    this.labels.c.set(total ? `i > c = ${criticalAngle(n).toFixed(1)}°` : `c = ${criticalAngle(n).toFixed(1)}°`);
    this.labels.c.at(-0.85, AXIS_Y + 0.42, 0);
    this.rayBox(S, C);
    this.path = [{ a: S, b: C, v: 1 / n }, total || !out ? { a: C, b: Rf, v: 1 / n } : { a: C, b: out, v: 1 }];
    this.targets = {
      incident: [v3(...S), v3(...C)],
      reflected: [v3(...C), v3(...Rf)],
      normal: [v3(0, AXIS_Y + 0.15), v3(...nTop)],
      block: v3(0.38, AXIS_Y - 0.2, 0),
    };
    if (out) this.targets.refracted = [v3(...C), v3(...out)];
  }

  private applyLens(segs: Seg[]) {
    const u = this.n('u'), fMag = this.n('f');
    const f = this.concave ? -fMag : fMag;
    const h = 0.26;
    const { v, m } = thinLens(u, f);
    const T: P3 = [-u, AXIS_Y + h, 0], O: P3 = [0, AXIS_Y, 0], L1: P3 = [0, AXIS_Y + h, 0];
    segs.push({ a: [-BOUND_X, AXIS_Y, 0], b: [BOUND_X, AXIS_Y, 0], c: CYAN, w: 0.007, dash: 0.03, alpha: 0.6 });
    for (const s of [-1, 1]) {
      segs.push({ a: [s * fMag, AXIS_Y - 0.035, 0], b: [s * fMag, AXIS_Y + 0.035, 0], c: CYAN, w: 0.012 });
      if (2 * fMag < BOUND_X) segs.push({ a: [s * 2 * fMag, AXIS_Y - 0.025, 0], b: [s * 2 * fMag, AXIS_Y + 0.025, 0], c: CYAN, w: 0.008, alpha: 0.6 });
    }
    this.labels.F1.at(-fMag, AXIS_Y - 0.1, 0.02);
    this.labels.F2.at(fMag, AXIS_Y - 0.1, 0.02);
    segs.push(...arrow([-u, AXIS_Y, 0], T, WARM, 0.024, 0.08));
    // ray 1: parallel to the axis, then through (or as if from) the principal focus
    const d1: [number, number] = [Math.abs(f), -h * Math.sign(f)];
    const e1 = clip(L1, d1);
    segs.push({ a: T, b: L1, c: RAY, w: 0.016 }, { a: L1, b: e1, c: RAY, w: 0.016 });
    // ray 2: straight through the optical centre
    const e2 = clip(O, [u, -h]);
    segs.push({ a: T, b: O, c: RAY, w: 0.016 }, { a: O, b: e2, c: RAY, w: 0.016 });
    const finite = Number.isFinite(v) && Math.abs(v) < BOUND_X && Math.abs(m * h) < 0.72;
    const I: P3 = [v, AXIS_Y + m * h, 0];
    if (finite) {
      const virtual = v < 0;
      if (virtual) {
        segs.push({ a: L1, b: I, c: RAY, w: 0.009, dash: 0.03, alpha: 0.55 });
        segs.push({ a: T, b: I, c: RAY, w: 0.009, dash: 0.03, alpha: 0.55 });
        for (const s of arrow([v, AXIS_Y, 0], I, CYAN, 0.02, 0.07)) segs.push({ ...s, dash: 0.022 });
      } else segs.push(...arrow([v, AXIS_Y, 0], I, CYAN, 0.024, 0.08));
      this.targets.image = [v3(v, AXIS_Y), v3(...I)];
    }
    this.labels.img.set(!finite ? '∞' : v < 0 ? 'virtual' : 'real');
    this.labels.img.at(finite ? v : 1.15, finite ? AXIS_Y + m * h + Math.sign(m || 1) * 0.09 : AXIS_Y + 0.5, 0.02);
    // slice: the front half slides out and the cross-section outline lights up
    const ex = this.n('explode');
    if (this.front) {
      this.front.position.z = ex * 0.55;
      this.front.position.x = ex * 0.12;
    }
    if (ex > 0.02) {
      let prev: P3 | null = null;
      for (let k = 0; k <= 24; k++) {
        const y = -0.55 + (1.1 * k) / 24;
        const p: P3 = [this.halfWidth(Math.abs(y)), AXIS_Y + y, 0];
        if (prev) {
          segs.push({ a: prev, b: p, c: WHITE, w: 0.012, alpha: ex });
          segs.push({ a: [-prev[0], prev[1], 0], b: [-p[0], p[1], 0], c: WHITE, w: 0.012, alpha: ex });
        }
        prev = p;
      }
    }
    this.src.set(T[0], T[1], 0);
    this.path = [{ a: T, b: L1, v: 1 }, { a: L1, b: e1, v: 1 }];
    this.targets = {
      ...this.targets,
      lens: [v3(0, AXIS_Y - 0.5), v3(0, AXIS_Y + 0.5)],
      focus: v3(fMag, AXIS_Y, 0),
      object: [v3(-u, AXIS_Y), v3(...T)],
      axis: [v3(0.6, AXIS_Y), v3(BOUND_X, AXIS_Y)],
    };
  }

  // ---- photons: evenly timed dots, so they bunch up where light is slower ----
  protected tick(_dt: number, t: number) {
    if (!this.photons.visible || !this.path.length) return;
    const times = this.path.map((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / s.v);
    const total = times.reduce((a, b) => a + b, 0);
    const pos = this.photons.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < this.nPhot; k++) {
      let tau = (t * 0.45 + (k / this.nPhot) * total) % total;
      let s = 0;
      while (s < times.length - 1 && tau > times[s]) tau -= times[s++];
      const seg = this.path[s], f = clamp(tau / times[s], 0, 1);
      pos.setXYZ(k, seg.a[0] + (seg.b[0] - seg.a[0]) * f, seg.a[1] + (seg.b[1] - seg.a[1]) * f, 0.01);
    }
    pos.needsUpdate = true;
  }

  // ---- interaction -------------------------------------------------------
  handles(): Handle[] {
    if (this.isLens) {
      return [{ name: 'object', pos: this.src, radius: 0.14, drag: (p) => this.put('u', clamp(-p.x, 0.15, 1.3)) }];
    }
    return [{
      name: 'source', pos: this.src, radius: 0.14,
      drag: (p) => {
        let a: number;
        if (this.preset === 'glass-block') a = Math.atan2(BLOCK.entryX - p.x, p.y - (BLOCK.cy + BLOCK.h / 2));
        else if (this.preset === 'mirror') a = Math.atan2(-p.x, p.y - 0.45);
        else a = Math.atan2(-p.x, AXIS_Y - p.y);
        this.put('angle', Math.round(clamp(a / DEG, 0, this.preset === 'tir' ? 85 : 80)));
      },
    }];
  }

  controls(): ControlSpec[] {
    if (this.isLens) {
      return [
        { key: 'u', label: 'controls.object', type: 'range', min: 0.15, max: 1.3, step: 0.01, dp: 2 },
        { key: 'f', label: 'controls.focal', type: 'range', min: 0.2, max: 0.7, step: 0.01, dp: 2 },
        { key: 'photons', label: 'controls.photons', type: 'toggle' },
      ];
    }
    const c: ControlSpec[] = [{ key: 'angle', label: 'controls.angle', type: 'range', min: 0, max: this.preset === 'tir' ? 85 : 80, step: 1, unit: '°', dp: 0 }];
    if (this.preset !== 'mirror') c.push({ key: 'n', label: 'controls.n', type: 'range', min: this.preset === 'tir' ? 1.3 : 1, max: 2.4, step: 0.01, dp: 2 });
    c.push({ key: 'showNormal', label: 'controls.normal', type: 'toggle' });
    if (this.preset === 'mirror') c.push({ key: 'showImage', label: 'labels.image', type: 'toggle' });
    c.push({ key: 'photons', label: 'controls.photons', type: 'toggle' });
    return c;
  }

  pickTargets() {
    return this.targets;
  }

  diagramTargets(): string[] {
    if (this.preset === 'glass-block') return ['incident', 'normal', 'refracted', 'emergent'];
    if (this.preset === 'mirror') return ['incident', 'normal', 'reflected', 'mirror', 'image'];
    if (this.preset === 'tir') return ['incident', 'normal', 'reflected', 'refracted'];
    return ['object', 'lens', 'focus', 'image'];
  }
}

function clip(a: P3, d: [number, number]): P3 {
  let k = 10;
  if (d[0] > 1e-6) k = Math.min(k, (BOUND_X - a[0]) / d[0]);
  if (d[0] < -1e-6) k = Math.min(k, (-BOUND_X - a[0]) / d[0]);
  if (d[1] > 1e-6) k = Math.min(k, (AXIS_Y + 0.75 - a[1]) / d[1]);
  if (d[1] < -1e-6) k = Math.min(k, (AXIS_Y - 0.75 - a[1]) / d[1]);
  return [a[0] + d[0] * k, a[1] + d[1] * k, 0];
}

let dotTex: THREE.CanvasTexture | null = null;
function dot(): THREE.CanvasTexture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,240,184,0.8)');
  grad.addColorStop(1, 'rgba(255,240,184,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return (dotTex = new THREE.CanvasTexture(c));
}

export function create(preset: string, params: State, lite: boolean): Template {
  return new RayOptics(preset, params, lite);
}
