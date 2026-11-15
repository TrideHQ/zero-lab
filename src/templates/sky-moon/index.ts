// sky-moon: free fall with and without air (hammer and feather, Earth or Moon),
// laser ranging to a retroreflector on the Moon, and the phases of the Moon.
// The Moon is procedural (generated texture), so there are no external assets.
import * as THREE from 'three';
import type { State } from '../../types.ts';
import type { ControlSpec, Handle, PickTarget, Template } from '../types.ts';
import { BaseTemplate, DEG, clamp, v3 } from '../base.ts';
import { Beams, arrow, type P3, type Seg } from '../../render/beams.ts';
import { Label } from '../../render/label.ts';
import { CYAN, TEAL, WARM, WHITE, C_FORCE, edges, glow, holo } from '../../render/hologram-shader.ts';
import { t } from '../../i18n/index.ts';

export const G_EARTH = 9.81;
export const G_MOON = 1.62;
export const C_KM_S = 299792.458;
/** Model units per metre in the drop scene. */
const M = 0.8;
const GROUND = 0.14;

/** Time to fall h metres from rest with linear air drag (terminal speed vt), or in a vacuum when vt is Infinity. */
export function fallTime(h: number, g: number, vt = Infinity): number {
  if (!Number.isFinite(vt)) return Math.sqrt((2 * h) / g);
  // y(t) = vt*t - (vt^2/g)(1 - e^(-g t / vt)); solve y = h by bisection
  const y = (tt: number) => vt * tt - ((vt * vt) / g) * (1 - Math.exp((-g * tt) / vt));
  let lo = 0, hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (y(mid) < h) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Round-trip time in seconds for light to a reflector d km away, and back. */
export const roundTrip = (dKm: number) => (2 * dKm) / C_KM_S;

/** Fraction of the Moon's disc that is lit, for a Sun–Earth–Moon angle in degrees (0 = new moon). */
export const litFraction = (deg: number) => (1 - Math.cos(deg * DEG)) / 2;

export function phaseName(deg: number): string {
  const a = ((deg % 360) + 360) % 360;
  const near = (x: number) => Math.abs(a - x) < 8 || Math.abs(a - x - 360) < 8 || Math.abs(a - x + 360) < 8;
  if (near(0)) return 'new';
  if (near(90)) return 'first_quarter';
  if (near(180)) return 'full';
  if (near(270)) return 'last_quarter';
  return a < 90 ? 'waxing_crescent' : a < 180 ? 'waxing_gibbous' : a < 270 ? 'waning_gibbous' : 'waning_crescent';
}

let moonTex: THREE.CanvasTexture | null = null;
function moonTexture(): THREE.CanvasTexture {
  if (moonTex) return moonTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a978d';
  g.fillRect(0, 0, 256, 128);
  let s = 12345;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 9; i++) { // maria
    g.fillStyle = `rgba(70,70,74,${0.25 + r() * 0.3})`;
    g.beginPath();
    g.ellipse(r() * 256, 20 + r() * 88, 12 + r() * 30, 8 + r() * 18, r() * 3, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 150; i++) { // craters: dark floor, bright rim
    const x = r() * 256, y = r() * 128, rad = 1 + r() * r() * 9;
    g.fillStyle = 'rgba(60,58,54,0.5)';
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    g.strokeStyle = 'rgba(235,232,220,0.55)';
    g.lineWidth = 0.8;
    g.beginPath(); g.arc(x - rad * 0.15, y - rad * 0.15, rad, 0, 7); g.stroke();
  }
  moonTex = new THREE.CanvasTexture(c);
  moonTex.colorSpace = THREE.SRGBColorSpace;
  moonTex.wrapS = THREE.RepeatWrapping;
  return moonTex;
}

interface Body { mesh: THREE.Object3D; y: number; v: number; t: number; landed: boolean; vt: number; x: number; label: Label }

class SkyMoon extends BaseTemplate {
  readonly name = 'sky-moon';
  private beams = new Beams(500);
  private targets: Record<string, PickTarget> = {};
  private labels: Record<string, Label> = {};
  private bodies: Body[] = [];
  private ground: THREE.Mesh | null = null;
  private earthBall: THREE.Mesh | null = null;
  private moonBall: THREE.Mesh | null = null;
  private pulse: THREE.Mesh | null = null;
  private fireT = -1;
  private result: 'idle' | 'flying' | 'hit' | 'miss' = 'idle';
  private moonPos = v3(0, 0);
  private phaseCanvas: HTMLCanvasElement | null = null;
  private phaseTex: THREE.CanvasTexture | null = null;
  private pair: string;

  constructor(preset: string, params: State, lite: boolean) {
    super(preset, params, lite);
    this.pair = String(params.pair ?? 'hammer-feather');
    this.group.add(this.beams.mesh);
    this.keep(this.beams);
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-4, preset === 'phases' ? 0 : 3, preset === 'phases' ? 0 : 2);
    this.group.add(sun, sun.target);
    if (preset === 'laser') this.buildLaser();
    else if (preset === 'phases') this.buildPhases();
    else this.buildDrop();
  }

  private label(key: string, color = '#e8f7ff', size = 0.075): Label {
    const l = this.keep(new Label('', { color, size }));
    this.labels[key] = l;
    this.group.add(l.sprite);
    return l;
  }

  private rock(radius: number, seg: number): THREE.Mesh {
    const m = this.mesh(new THREE.SphereGeometry(radius, seg, Math.ceil(seg * 0.6)), new THREE.MeshLambertMaterial({ map: moonTexture() }));
    return m;
  }

  // ---- drop --------------------------------------------------------------
  private buildDrop() {
    this.init({ gravity: 'earth', air: true, height: 1.5, dropped: false });
    this.view = { dist: 4.1, target: [0, 0.85, 0], yaw: 0.25, pitch: 0.14 };
    const gg = new THREE.CylinderGeometry(1.25, 1.3, 0.12, this.lite ? 20 : 40);
    this.ground = this.mesh(gg, new THREE.MeshLambertMaterial({ map: moonTexture(), color: 0xffffff }));
    this.ground.position.y = GROUND - 0.06;
    this.ground.add(edges(gg, TEAL, 0.6, 40));
    this.earthBall = this.mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshLambertMaterial({ color: 0x3f7fe0, emissive: 0x0a1c40 }));
    this.earthBall.position.set(-1.25, 1.75, -1.2);
    const mk = (kind: string, x: number): Body => {
      const g = new THREE.Group();
      if (kind === 'hammer') {
        const head = new THREE.BoxGeometry(0.2, 0.09, 0.09);
        const hm = this.mesh(head, holo(WARM, { opacity: 1, fill: 0.55, rim: 1.2 }), g);
        hm.position.y = 0.1;
        hm.add(edges(head, WARM));
        this.mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8), holo(WARM, { opacity: 1, fill: 0.5 }), g).position.y = -0.03;
      } else if (kind === 'feather') {
        const s = new THREE.Shape();
        s.moveTo(0, -0.16);
        s.quadraticCurveTo(0.09, 0, 0, 0.17);
        s.quadraticCurveTo(-0.09, 0, 0, -0.16);
        this.mesh(new THREE.ShapeGeometry(s, 10), holo(WHITE, { opacity: 1, fill: 0.5, rim: 1 }), g);
        this.mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 5), glow(WHITE), g);
      } else {
        const rad = kind === 'heavy' ? 0.11 : 0.06;
        this.mesh(new THREE.SphereGeometry(rad, 18, 12), holo(kind === 'heavy' ? WARM : WHITE, { opacity: 1, fill: 0.5, rim: 1.3 }), g);
      }
      this.group.add(g);
      const label = this.keep(new Label('', { color: '#fff0b8', size: 0.07 }));
      this.group.add(label.sprite);
      return { mesh: g, y: 0, v: 0, t: 0, landed: false, vt: Infinity, x, label };
    };
    this.bodies = this.pair === 'balls' ? [mk('heavy', -0.3), mk('light', 0.3)] : [mk('hammer', -0.3), mk('feather', 0.3)];
    this.label('g', '#8fe9ff', 0.085);
    this.label('note', '#ffd9a3', 0.07);
    this.resetDrop();
  }

  private gNow(): number {
    return this.state.gravity === 'moon' ? G_MOON : G_EARTH;
  }
  private airNow(): boolean {
    return this.state.gravity !== 'moon' && this.b('air');
  }

  private resetDrop() {
    for (const b of this.bodies) { b.y = this.n('height'); b.v = 0; b.t = 0; b.landed = false; }
    this.state.dropped = this.target.dropped = false;
    this.dirty = true;
  }

  protected changed(s: State) {
    if (this.preset === 'drop' && ('gravity' in s || 'air' in s || 'height' in s)) this.resetDrop();
    if (this.preset === 'drop' && s.dropped === true) {
      for (const b of this.bodies) { b.y = this.n('height'); b.v = 0; b.t = 0; b.landed = false; }
      this.state.dropped = this.target.dropped = true;
    }
    if (this.preset === 'laser' && ('aim' in s || 'dist' in s)) { this.result = 'idle'; this.fireT = -1; }
  }

  // ---- laser -------------------------------------------------------------
  private buildLaser() {
    this.init({ aim: 0.9, dist: 384400 });
    this.view = { dist: 4.0, target: [0, 0.85, 0], yaw: 0.0, pitch: 0.12 };
    this.earthBall = this.mesh(new THREE.SphereGeometry(0.34, this.lite ? 20 : 36, 20), new THREE.MeshLambertMaterial({ color: 0x3f7fe0, emissive: 0x0a1c40 }));
    this.earthBall.position.set(-1.15, 0.8, 0);
    this.moonBall = this.rock(0.14, this.lite ? 16 : 28);
    this.moonBall.position.set(1.2, 0.8, 0);
    this.pulse = this.mesh(new THREE.SphereGeometry(0.035, 10, 8), glow(0x7dff9a, 1));
    this.pulse.visible = false;
    for (const k of ['timer', 'calc', 'sent', 'back', 'scale']) this.label(k, k === 'calc' ? '#7cf0c0' : '#e8f7ff', k === 'timer' ? 0.11 : 0.07);
  }

  // ---- phases ------------------------------------------------------------
  private buildPhases() {
    this.init({ phase: 45 });
    this.view = { dist: 4.3, target: [0, 0.75, 0], yaw: 0.0, pitch: 0.62 };
    const sun = this.mesh(new THREE.SphereGeometry(0.2, 20, 14), glow(WARM, 1));
    sun.position.set(-1.55, 0.8, 0);
    this.earthBall = this.mesh(new THREE.SphereGeometry(0.2, this.lite ? 18 : 30, 18), new THREE.MeshLambertMaterial({ color: 0x3f7fe0 }));
    this.earthBall.position.set(0.15, 0.8, 0);
    this.moonBall = this.rock(0.09, this.lite ? 14 : 24);
    this.phaseCanvas = document.createElement('canvas');
    this.phaseCanvas.width = this.phaseCanvas.height = 128;
    this.phaseTex = this.keep(new THREE.CanvasTexture(this.phaseCanvas));
    this.phaseTex.colorSpace = THREE.SRGBColorSpace;
    const view = new THREE.Sprite(this.keep(new THREE.SpriteMaterial({ map: this.phaseTex, depthTest: false })));
    view.scale.setScalar(0.5);
    view.position.set(1.3, 1.55, 0);
    view.renderOrder = 9;
    this.group.add(view);
    this.label('name', '#fff0b8', 0.08);
    this.label('seen', '#9db6d8', 0.06);
  }

  private drawPhaseView(deg: number) {
    const g = this.phaseCanvas!.getContext('2d')!;
    const R = 54, cx = 64, cy = 64;
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#1b1f2e';
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    const a = ((deg % 360) + 360) % 360;
    const k = Math.cos(a * DEG); // +1 new, -1 full
    const waxing = a < 180;
    g.fillStyle = '#e9e6da';
    g.beginPath();
    // lit limb: right side while waxing (northern-hemisphere view), left while waning
    g.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, !waxing);
    g.ellipse(cx, cy, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, waxing ? k > 0 : k < 0);
    g.fill();
    g.strokeStyle = '#36e3ff';
    g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R + 4, 0, 7); g.stroke();
    this.phaseTex!.needsUpdate = true;
  }

  // ---- per-state drawing -------------------------------------------------
  protected apply() {
    const segs: Seg[] = [];
    if (this.preset === 'phases') {
      const a = this.n('phase') * DEG, R = 0.85, ex = 0.15;
      // phase 0 = new moon: the Moon sits between the Earth and the Sun (towards -x)
      const mx = ex - Math.cos(a) * R, mz = Math.sin(a) * R;
      this.moonBall!.position.set(mx, 0.8, mz);
      this.moonPos.set(mx, 0.8, mz);
      for (let k = 0; k < 48; k += 2) {
        const a0 = (k / 48) * Math.PI * 2, a1 = ((k + 1) / 48) * Math.PI * 2;
        segs.push({ a: [ex + Math.cos(a0) * R, 0.8, Math.sin(a0) * R], b: [ex + Math.cos(a1) * R, 0.8, Math.sin(a1) * R], c: CYAN, w: 0.008, alpha: 0.6 });
      }
      for (const z of [-0.5, -0.25, 0, 0.25, 0.5]) segs.push(...arrow([-1.3, 0.8, z], [-0.95, 0.8, z], WARM, 0.012, 0.06));
      segs.push({ a: [ex, 0.8, 0], b: [mx, 0.8, mz], c: WHITE, w: 0.006, dash: 0.03, alpha: 0.5 });
      this.drawPhaseView(this.n('phase'));
      this.labels.name.set(`${t('sky.' + phaseName(this.n('phase')))} · ${Math.round(litFraction(this.n('phase')) * 100)}%`);
      this.labels.name.at(1.3, 1.2, 0);
      this.labels.seen.set(t('sky.from_earth'));
      this.labels.seen.at(1.3, 1.9, 0);
      this.targets = { sun: v3(-1.55, 0.8, 0), earth: v3(ex, 0.8, 0), moon: v3(mx, 0.8, mz) };
    } else if (this.preset === 'laser') {
      const E: P3 = [-0.82, 0.86, 0], Rf: P3 = [1.07, 0.84, 0];
      const off = (this.n('aim') * 0.12);
      const aimAt: P3 = [Rf[0], Rf[1] + off, 0];
      segs.push({ a: E, b: aimAt, c: 0x7dff9a, w: 0.006, dash: 0.03, alpha: 0.5 });
      // the beam spreads: by the Moon it is kilometres wide, far wider than the reflector
      segs.push({ a: E, b: [aimAt[0], aimAt[1] + 0.09, 0], c: 0x7dff9a, w: 0.004, alpha: 0.25 }, { a: E, b: [aimAt[0], aimAt[1] - 0.09, 0], c: 0x7dff9a, w: 0.004, alpha: 0.25 });
      segs.push({ a: [Rf[0] - 0.03, Rf[1] - 0.03, 0.02], b: [Rf[0] + 0.03, Rf[1] + 0.03, 0.02], c: WARM, w: 0.012 }, { a: [Rf[0] - 0.03, Rf[1] + 0.03, 0.02], b: [Rf[0] + 0.03, Rf[1] - 0.03, 0.02], c: WARM, w: 0.012 });
      segs.push({ a: [E[0] - 0.02, E[1] - 0.06, 0], b: [E[0] + 0.05, E[1] + 0.03, 0], c: WARM, w: 0.03 });
      const tt = roundTrip(this.n('dist'));
      this.labels.scale.set(t('sky.not_to_scale'));
      this.labels.scale.at(0.1, 0.35, 0);
      this.labels.sent.set(t('sky.sent'));
      this.labels.sent.at(-0.75, 1.42, 0);
      this.labels.back.set(this.result === 'hit' ? t('sky.returned') : this.result === 'miss' ? t('sky.missed') : '');
      this.labels.back.at(0.75, 1.42, 0);
      this.labels.timer.at(0.1, 1.72, 0);
      this.labels.calc.set(this.result === 'hit' ? `d = c·t / 2 = ${Math.round((C_KM_S * tt) / 2).toLocaleString('en')} km` : '');
      this.labels.calc.at(0.1, 1.2, 0);
      if (this.result === 'idle') this.labels.timer.set('t = 0.00 s');
      this.targets = { earth: v3(-1.15, 0.8, 0), moon: v3(1.2, 0.8, 0), laser: v3(...E), reflector: v3(...Rf) };
    } else {
      const moon = this.state.gravity === 'moon';
      (this.ground!.material as THREE.MeshLambertMaterial).color.setHex(moon ? 0xffffff : 0x4f8f6a);
      this.earthBall!.visible = moon;
      this.labels.g.set(`${t(moon ? 'controls.moon' : 'controls.earth')}: g = ${this.gNow().toFixed(2)} m/s²`);
      this.labels.g.at(0, 1.92, 0);
      this.labels.note.set(moon ? t('sky.no_air') : this.b('air') ? t('sky.air') : t('sky.vacuum'));
      this.labels.note.at(0, 1.74, 0);
      const light = this.bodies[1];
      light.vt = this.airNow() ? (this.pair === 'balls' ? 7 : 0.9) : Infinity;
      this.bodies[0].vt = Infinity;
    }
    if (this.preset !== 'drop') this.beams.set(segs);
  }

  protected tick(dt: number, tm: number) {
    if (this.preset === 'drop') {
      const g = this.gNow();
      const segs: Seg[] = [];
      const h0 = this.n('height');
      for (const b of this.bodies) {
        if (this.b('dropped') && !b.landed) {
          const steps = 8, hh = dt / steps;
          for (let i = 0; i < steps && !b.landed; i++) {
            const a = Number.isFinite(b.vt) ? g * (1 - b.v / b.vt) : g;
            b.v += a * hh;
            b.y -= b.v * hh;
            b.t += hh;
            if (b.y <= 0) { b.y = 0; b.landed = true; }
          }
        }
        const flutter = Number.isFinite(b.vt) && b.vt < 2 && this.b('dropped') && !b.landed ? Math.sin(tm * 5) : 0;
        b.mesh.position.set(b.x + flutter * 0.06, GROUND + 0.18 + b.y * M, 0);
        b.mesh.rotation.z = flutter * 0.5;
        b.label.set(this.b('dropped') ? `t = ${b.t.toFixed(2)} s` : '');
        b.label.at(b.x + (b.x < 0 ? -0.42 : 0.42), GROUND + 0.2 + b.y * M, 0);
        segs.push({ a: [b.x, GROUND + 0.02, 0], b: [b.x, GROUND + 0.18 + h0 * M, 0], c: CYAN, w: 0.005, dash: 0.03, alpha: 0.35 });
        if (this.b('dropped') && !b.landed) segs.push(...arrow([b.x + 0.16, GROUND + 0.18 + b.y * M, 0], [b.x + 0.16, GROUND + 0.18 + b.y * M - clamp(b.v * 0.06, 0.05, 0.4), 0], C_FORCE, 0.014, 0.05));
      }
      // height rule
      segs.push({ a: [-0.85, GROUND + 0.18, 0], b: [-0.85, GROUND + 0.18 + h0 * M, 0], c: TEAL, w: 0.014 });
      this.beams.set(segs);
      const [A, B] = this.bodies;
      const names = this.pair === 'balls' ? ['ball', 'ball2'] : ['hammer', 'feather'];
      this.targets = { [names[0]]: A.mesh.position.clone(), [names[1]]: B.mesh.position.clone(), ground: v3(0.8, GROUND, 0) };
    } else if (this.preset === 'laser' && this.result === 'flying') {
      if (this.fireT < 0) this.fireT = tm;
      const total = roundTrip(this.n('dist'));
      const el = tm - this.fireT;
      const hit = Math.abs(this.n('aim')) < 0.25;
      const E = v3(-0.82, 0.86, 0), Rf = v3(1.07, 0.84 + this.n('aim') * 0.12, 0);
      const f = el / (total / 2);
      if (f <= 1) this.pulse!.position.lerpVectors(E, Rf, f);
      else if (hit && f <= 2) this.pulse!.position.lerpVectors(Rf, E, f - 1);
      else if (!hit && f <= 1.6) this.pulse!.position.lerpVectors(E, Rf, f);
      const done = hit ? f >= 2 : f >= 1.6;
      this.pulse!.visible = !done;
      this.pulse!.scale.setScalar(hit && f > 1 ? 0.5 : 1 + f * 1.5);
      this.labels.timer.set(`t = ${Math.min(el, hit ? total : el).toFixed(2)} s`);
      if (done) {
        this.result = hit ? 'hit' : 'miss';
        if (hit) this.labels.timer.set(`t = ${total.toFixed(2)} s`);
        this.dirty = true;
        this.onChange?.(this.target);
      }
    } else if (this.preset === 'phases' && this.moonBall) this.moonBall.rotation.y = -this.n('phase') * DEG;
  }

  // ---- interaction -------------------------------------------------------
  action(key: string) {
    if (key === 'drop') this.setState({ dropped: true });
    if (key === 'reset') this.resetDrop();
    if (key === 'fire') {
      this.result = 'flying';
      this.fireT = -1;
      this.dirty = true;
    }
  }

  handles(): Handle[] {
    if (this.preset !== 'phases') return [];
    return [{ name: 'moon', pos: this.moonPos, radius: 0.16, plane: 'y', drag: (p) => {
      const a = Math.atan2(p.z, -(p.x - 0.15)) / DEG;
      this.put('phase', Math.round((a + 360) % 360));
    } }];
  }

  controls(): ControlSpec[] {
    if (this.preset === 'phases') return [{ key: 'phase', label: 'controls.phase', type: 'range', min: 0, max: 360, step: 1, unit: '°', dp: 0 }];
    if (this.preset === 'laser') {
      return [
        { key: 'aim', label: 'controls.aim', type: 'range', min: -2, max: 2, step: 0.05, dp: 2 },
        { key: 'dist', label: 'controls.distance', type: 'range', min: 356500, max: 406700, step: 100, unit: ' km', dp: 0 },
        { key: 'fire', label: 'controls.fire', type: 'action' },
      ];
    }
    return [
      { key: 'gravity', label: 'controls.gravity', type: 'choice', options: [{ value: 'earth', label: 'controls.earth' }, { value: 'moon', label: 'controls.moon' }] },
      { key: 'air', label: 'controls.air', type: 'toggle' },
      { key: 'drop', label: 'controls.drop', type: 'action' },
      { key: 'reset', label: 'controls.reset', type: 'action' },
    ];
  }

  pickTargets() {
    return this.targets;
  }

  /** For tests and the demo: landing times of the two bodies so far. */
  times(): number[] {
    return this.bodies.map((b) => b.t);
  }
  landed(): boolean {
    return this.bodies.every((b) => b.landed);
  }
  laserResult(): string {
    return this.result;
  }
}

export type { SkyMoon };
export function create(preset: string, params: State, lite: boolean): Template {
  return new SkyMoon(preset, params, lite);
}
