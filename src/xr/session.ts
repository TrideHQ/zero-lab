// WebXR sessions. VR / MR headsets (Quest, VR Glasses): seated, hands only,
// panels and model placed inside a ~70° x 66° field of view. Android phones:
// immersive-ar with hit-test placement and the normal HTML UI as a DOM overlay.
import * as THREE from 'three';
import type { Stage } from '../render/renderer.ts';
import type { Handle } from '../templates/types.ts';
import type { XRApp } from './panel-spec.ts';
import { HandState } from './hands.ts';
import { PalmSwipe, PalmUpHold, pointerRay } from './gestures.ts';
import { Panel } from './panel.ts';
import { ArPlacement } from './ar-placement.ts';
import { WARM, glow } from '../render/hologram-shader.ts';
import { t } from '../i18n/index.ts';
import { go } from '../router.ts';
import { blip } from '../audio/sfx.ts';

let app: XRApp | null = null;
let active: Controller | null = null;

/** Layout constants (metres), chosen so everything sits inside a 70° x 66° field of view at arm's reach. */
export const LAYOUT = { dist: 0.62, drop: 0.02, scale: 0.15, sideX: 0.32, sideZ: -0.05, sideTurn: 0.6, buttonsY: -0.21, buttonsZ: 0.05, buttonsTilt: -0.35 };

export async function xrSupport(): Promise<{ vr: boolean; ar: boolean }> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) return { vr: false, ar: false };
  const ok = (m: XRSessionMode) => xr.isSessionSupported(m).catch(() => false);
  const [vr, ar] = await Promise.all([ok('immersive-vr'), ok('immersive-ar')]);
  return { vr, ar };
}
export function setXRApp(a: XRApp | null) {
  app = a;
  if (active) active.dirty = true;
}
export const xrApp = () => app;
export const xrActive = () => !!active;
/** For tests and the demo. */
export const xrController = () => active;

export async function enterXR(mode: 'vr' | 'ar', stage: Stage): Promise<void> {
  if (active) return;
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) throw new Error('WebXR is not available');
  const init: XRSessionInit & { domOverlay?: { root: Element } } = { optionalFeatures: ['local-floor', 'hand-tracking', ...(mode === 'ar' ? ['hit-test', 'dom-overlay'] : [])] };
  if (mode === 'ar') init.domOverlay = { root: document.body };
  const session = await xr.requestSession(mode === 'ar' ? 'immersive-ar' : 'immersive-vr', init);
  stage.renderer.xr.setReferenceSpaceType('local-floor');
  try {
    await stage.renderer.xr.setSession(session);
  } catch {
    stage.renderer.xr.setReferenceSpaceType('local');
    await stage.renderer.xr.setSession(session);
  }
  active = new Controller(stage, session, mode);
}

interface Grab { handle?: Handle; plane?: THREE.Plane; rotate?: { x: number; yaw: number } }

class Controller {
  dirty = true;
  readonly phoneAR: boolean;
  readonly hands = [new HandState('left'), new HandState('right')];
  readonly text = new Panel(0.24, 0.3);
  readonly side = new Panel(0.24, 0.3);
  readonly buttons = new Panel(0.7, 0.2);
  readonly menu = new Panel(0.22, 0.2);
  private rig = new THREE.Group();
  private cursors = [0, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), glow(WARM, 1)));
  private placement: ArPlacement | null = null;
  private placed = false;
  private centre = new THREE.Vector3();
  private lastVersion = -1;
  private lastTpl: unknown = null;
  private grabs: (Grab | null)[] = [null, null];
  private poked = [false, false];
  private two: { d: number; scale: number; slice: number; mode: 'zoom' | 'slice' } | null = null;
  private palmUp = [new PalmUpHold(), new PalmUpHold()];
  private swipe = [new PalmSwipe(), new PalmSwipe()];
  private ray = new THREE.Ray();
  private hov = new Map<Panel, number>();
  private head = new THREE.Vector3();
  private yaw = 0;
  private bar: HTMLElement | null = null;
  private since = 0;
  private stage: Stage;
  private session: XRSession;

  constructor(stage: Stage, session: XRSession, mode: 'vr' | 'ar') {
    this.stage = stage;
    this.session = session;
    this.phoneAR = mode === 'ar' && !!(session as XRSession & { domOverlayState?: unknown }).domOverlayState;
    stage.arMode = mode === 'ar';
    stage.arTouch = this.phoneAR;
    stage.floor.visible = mode !== 'ar';
    if (this.phoneAR) this.startPhoneAR();
    else {
      stage.scene.add(this.rig, ...this.hands.map((h) => h.mesh), ...this.cursors);
      this.rig.add(this.text.mesh, this.side.mesh, this.buttons.mesh);
      this.text.mesh.position.set(-LAYOUT.sideX, 0.02, LAYOUT.sideZ);
      this.text.mesh.rotation.y = LAYOUT.sideTurn;
      this.side.mesh.position.set(LAYOUT.sideX, 0.02, LAYOUT.sideZ);
      this.side.mesh.rotation.y = -LAYOUT.sideTurn;
      this.buttons.mesh.position.set(0, LAYOUT.buttonsY, LAYOUT.buttonsZ);
      this.buttons.mesh.rotation.x = LAYOUT.buttonsTilt;
      stage.scene.add(this.menu.mesh);
      this.menu.mesh.visible = false;
      this.menu.set({ title: t('xr.menu'), body: [], buttons: [
        { id: 'recentre', label: t('xr.recenter'), on: () => { this.placed = false; this.menu.mesh.visible = false; } },
        { id: 'home', label: t('xr.home'), on: () => { this.menu.mesh.visible = false; go('/s/physics'); } },
        { id: 'exit', label: t('xr.exit'), primary: true, on: () => void session.end() },
      ] });
    }
    stage.xrHook = (dt, time, frame) => this.frame(dt, time, frame);
    session.addEventListener('end', () => this.end());
  }

  // ---- phone AR ----------------------------------------------------------
  private startPhoneAR() {
    document.documentElement.classList.add('ar-active');
    this.placement = new ArPlacement();
    this.stage.scene.add(this.placement.reticle);
    void this.placement.start(this.session);
    this.stage.root.visible = false;
    const hint = document.createElement('span');
    hint.textContent = t('xr.place');
    const move = document.createElement('button');
    move.className = 'btn small';
    move.textContent = t('xr.replace');
    move.onclick = () => { this.placement!.placed = false; this.stage.root.visible = false; hint.textContent = t('xr.place'); };
    const exit = document.createElement('button');
    exit.className = 'btn small primary';
    exit.id = 'exit-ar';
    exit.textContent = t('topic.exit_xr');
    exit.onclick = () => void this.session.end();
    this.bar = document.createElement('div');
    this.bar.className = 'ar-bar';
    this.bar.append(hint, move, exit);
    document.body.append(this.bar);
    // taps on the HTML controls must not also place the lab
    document.body.addEventListener('beforexrselect', this.guard);
    this.session.addEventListener('select', () => {
      if (!this.placement || this.placement.placed) return;
      this.placement.place(this.stage.root, this.stage.renderer.xr.getCamera());
      this.stage.root.visible = true;
      hint.textContent = '';
      blip('hum');
    });
  }
  private guard = (e: Event) => {
    if ((e.target as Element | null)?.closest?.('button, a, input, select, label, .panel, .tools, .ar-bar, .bubble')) e.preventDefault();
  };

  // ---- headset placement -------------------------------------------------
  private place() {
    const tpl = this.stage.template;
    if (!tpl) return;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.centre.copy(this.head).addScaledVector(f, LAYOUT.dist);
    this.centre.y = this.head.y - LAYOUT.drop - 0.06;
    this.rig.position.copy(this.centre);
    this.rig.rotation.y = this.yaw;
    const root = this.stage.root;
    root.rotation.set(0, this.yaw, 0);
    this.fit(LAYOUT.scale);
    this.placed = true;
    this.lastTpl = tpl;
  }

  private fit(scale: number) {
    const tpl = this.stage.template;
    if (!tpl) return;
    // templates differ in width: keep each one inside the gap between the side panels
    const s = scale * Math.min(1, 3.6 / tpl.view.dist);
    this.stage.root.scale.setScalar(s);
    this.stage.root.position.set(this.centre.x, this.centre.y - tpl.view.target[1] * s, this.centre.z);
  }

  // ---- per frame ---------------------------------------------------------
  private frame(dt: number, _time: number, frame?: XRFrame) {
    const ref = this.stage.renderer.xr.getReferenceSpace();
    if (!frame || !ref) return;
    const cam = this.stage.renderer.xr.getCamera();
    cam.getWorldPosition(this.head);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    if (this.phoneAR) {
      this.placement?.update(frame, ref);
      return;
    }
    this.since += dt;
    if ((!this.placed && this.since > 0.3) || (this.placed && this.stage.template !== this.lastTpl)) this.place();
    if (app && (app.version !== this.lastVersion || this.dirty)) this.redraw();

    const sources = [...this.session.inputSources];
    this.hov.clear();
    this.hands.forEach((h, i) => {
      h.update(frame, ref, sources.find((s) => s.handedness === h.side && s.hand), dt);
      this.hand(i, dt);
    });
    for (const p of [this.buttons, this.menu]) p.setHover(this.hov.get(p) ?? -1);
    this.twoHands();
  }

  private redraw() {
    if (!app) return;
    this.lastVersion = app.version;
    this.dirty = false;
    const main = app.main();
    const speech = app.speech?.();
    this.text.set({ ...main, body: speech ? [...main.body, `${t('bench.partner')}: ${speech}`] : main.body, buttons: [] });
    this.buttons.set({ title: '', body: [], buttons: main.buttons });
    const image = app.sideImage?.() ?? null;
    const side = app.side?.() ?? null;
    this.side.mesh.visible = !!(image || side);
    this.side.set(image ? null : side, image);
  }

  private panelHit(panel: Panel, ray: THREE.Ray): { u: number; v: number; point: THREE.Vector3; dist: number } | null {
    if (!panel.mesh.visible) return null;
    const inv = new THREE.Matrix4().copy(panel.mesh.matrixWorld).invert();
    const local = ray.clone().applyMatrix4(inv);
    if (Math.abs(local.direction.z) < 1e-5) return null;
    const k = -local.origin.z / local.direction.z;
    if (k < 0 || k > 3) return null;
    const p = local.origin.clone().addScaledVector(local.direction, k);
    const g = (panel.mesh.geometry as THREE.PlaneGeometry).parameters;
    const u = p.x / g.width + 0.5, v = p.y / g.height + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { u, v, point: p.applyMatrix4(panel.mesh.matrixWorld), dist: k };
  }

  private hand(i: number, dt: number) {
    const h = this.hands[i];
    const cursor = this.cursors[i];
    cursor.visible = false;
    if (!h.tracked) {
      if (this.grabs[i]) this.release(i);
      return;
    }
    pointerRay(h, this.head, this.yaw, this.ray);
    const panels = [this.buttons, this.menu];
    // hover / pinch on a panel
    let hot: { panel: Panel; index: number } | null = null;
    for (const p of panels) {
      const hit = this.panelHit(p, this.ray);
      if (!hit) continue;
      cursor.visible = true;
      cursor.position.copy(hit.point);
      const index = p.hit(hit.u, hit.v);
      if (index >= 0) hot = { panel: p, index };
      break;
    }
    // direct poke with the index fingertip
    let pokedNow = false;
    for (const p of panels) {
      if (!p.mesh.visible) continue;
      const local = p.mesh.worldToLocal(h.indexTip.clone());
      const g = (p.mesh.geometry as THREE.PlaneGeometry).parameters;
      if (Math.abs(local.z) < 0.014 && Math.abs(local.x) < g.width / 2 && Math.abs(local.y) < g.height / 2) {
        pokedNow = true;
        const index = p.hit(local.x / g.width + 0.5, local.y / g.height + 0.5);
        if (index >= 0 && !this.poked[i]) {
          p.press(index);
          blip('tick');
        }
      }
    }
    this.poked[i] = pokedNow;
    if (hot) this.hov.set(hot.panel, hot.index);

    if (h.pinchStart) {
      if (hot) {
        hot.panel.press(hot.index);
        blip('tick');
      } else if (!cursor.visible) this.grab(i);
    }
    const g = this.grabs[i];
    if (g && h.pinching) {
      if (g.handle?.drag && g.plane) {
        const p = this.ray.intersectPlane(g.plane, new THREE.Vector3()) ?? g.plane.projectPoint(h.pinchPos, new THREE.Vector3());
        g.handle.drag(this.stage.template!.group.worldToLocal(p), 'move');
      } else if (g.rotate && !this.two) {
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        this.stage.root.rotation.y = g.rotate.yaw + (h.pinchPos.dot(right) - g.rotate.x) * 6;
      }
    }
    if (h.pinchEnd && g) this.release(i);

    if (this.palmUp[i].update(h, dt)) {
      this.menu.mesh.visible = !this.menu.mesh.visible;
      this.menu.mesh.position.copy(h.palm).add(new THREE.Vector3(0, 0.16, 0));
      this.menu.mesh.lookAt(this.head);
      blip('step');
    }
    const sw = this.swipe[i].update(h, new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)), dt);
    if (sw && !this.grabs[0] && !this.grabs[1]) app?.onSwipe?.(sw);
  }

  private grab(i: number) {
    const tpl = this.stage.template;
    const h = this.hands[i];
    if (!tpl) return;
    tpl.group.updateWorldMatrix(true, false);
    const s = this.stage.root.scale.x;
    // 1. a handle: pinch it directly, or point at it
    let best: Handle | null = null, bestD = 1e9;
    for (const hd of [...tpl.handles(), ...this.stage.extraHandles]) {
      if (hd.enabled && !hd.enabled()) continue;
      const w = tpl.group.localToWorld(hd.pos.clone());
      const direct = w.distanceTo(h.pinchPos), along = this.ray.distanceToPoint(w);
      const d = direct < Math.max(0.05, hd.radius * s * 1.5) ? direct * 0.5 : along < Math.max(0.03, hd.radius * s) ? along : 1e9;
      if (d < bestD) { best = hd; bestD = d; }
    }
    if (best) {
      if (best.drag) {
        const axis = best.plane ?? 'z';
        const n = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).transformDirection(tpl.group.matrixWorld);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, tpl.group.localToWorld(best.pos.clone()));
        this.grabs[i] = { handle: best, plane };
        const p = this.ray.intersectPlane(plane, new THREE.Vector3());
        if (p) best.drag(tpl.group.worldToLocal(p), 'start');
      } else best.tap?.();
      blip('tick');
      return;
    }
    // 2. a named part (point + pinch), or any point on the model's plane when the screen wants it
    const zn = new THREE.Vector3(0, 0, 1).transformDirection(tpl.group.matrixWorld);
    const zPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(zn, tpl.group.localToWorld(new THREE.Vector3()));
    const on = this.ray.intersectPlane(zPlane, new THREE.Vector3());
    const local = on ? tpl.group.worldToLocal(on.clone()) : null;
    let name: string | null = null, nd = 0.028;
    for (const [k, target] of Object.entries(tpl.pickTargets())) {
      const pts = Array.isArray(target) ? [0, 0.25, 0.5, 0.75, 1].map((f) => target[0].clone().lerp(target[1], f)) : [target.clone()];
      for (const p of pts) {
        const d = this.ray.distanceToPoint(tpl.group.localToWorld(p));
        if (d < nd) { nd = d; name = k; }
      }
    }
    const inside = !!local && Math.abs(local.x) < 1.7 && local.y > -0.1 && local.y < 2.3;
    if (name || (inside && app?.pointAnywhere?.())) {
      app?.onPoint?.(name, local);
      blip('tick');
      return;
    }
    // 3. empty space: twist the model
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.grabs[i] = { rotate: { x: h.pinchPos.dot(right), yaw: this.stage.root.rotation.y } };
  }

  private release(i: number) {
    const g = this.grabs[i];
    this.grabs[i] = null;
    if (g?.handle?.drag) g.handle.drag(g.handle.pos.clone(), 'end');
  }

  private twoHands() {
    const [a, b] = this.hands;
    const free = (g: Grab | null) => !!g?.rotate;
    if (a.tracked && b.tracked && a.pinching && b.pinching && free(this.grabs[0]) && free(this.grabs[1])) {
      const d = a.pinchPos.distanceTo(b.pinchPos);
      if (!this.two) this.two = { d, scale: this.stage.root.scale.x, slice: this.stage.slice, mode: this.stage.template?.canSlice && d < 0.2 ? 'slice' : 'zoom' };
      else if (this.two.mode === 'slice') this.stage.setSlice(this.two.slice + (d - this.two.d) / 0.22);
      else {
        const tpl = this.stage.template!;
        const s = Math.min(0.3, Math.max(0.07, (this.two.scale * d) / this.two.d));
        this.stage.root.scale.setScalar(s);
        this.stage.root.position.y = this.centre.y - tpl.view.target[1] * s;
      }
    } else this.two = null;
  }

  // ---- hooks for automated tests and the demo ----------------------------
  pressButton(id: string): boolean {
    for (const p of [this.buttons, this.menu]) {
      const i = p.buttonIds().indexOf(id);
      if (i >= 0 && p.mesh.visible) {
        p.press(i);
        return true;
      }
    }
    return false;
  }
  /** World position of a button's centre, so an emulated hand can aim at it. */
  buttonWorld(id: string): [number, number, number] | null {
    for (const p of [this.buttons, this.menu]) {
      const uv = p.buttonUv(id);
      if (!uv || !p.mesh.visible) continue;
      const g = (p.mesh.geometry as THREE.PlaneGeometry).parameters;
      const w = p.mesh.localToWorld(new THREE.Vector3((uv[0] - 0.5) * g.width, (uv[1] - 0.5) * g.height, 0));
      return [w.x, w.y, w.z];
    }
    return null;
  }
  /** Angular half-extent (degrees) of everything shown, measured from the head: must fit the headset's field of view. */
  extent(): { h: number; v: number } {
    let hMax = 0, vMax = 0;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const see = (w: THREE.Vector3) => {
      const d = w.clone().sub(this.head);
      const z = d.dot(fwd);
      hMax = Math.max(hMax, Math.abs(Math.atan2(d.dot(right), z)) / (Math.PI / 180));
      vMax = Math.max(vMax, Math.abs(Math.atan2(d.y, z)) / (Math.PI / 180));
    };
    for (const p of [this.text, this.side, this.buttons]) {
      if (!p.mesh.visible) continue;
      const g = (p.mesh.geometry as THREE.PlaneGeometry).parameters;
      for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) see(p.mesh.localToWorld(new THREE.Vector3(sx * g.width, sy * g.height, 0)));
    }
    if (this.stage.template) {
      const box = new THREE.Box3().setFromObject(this.stage.template.group);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) see(new THREE.Vector3(x, y, (box.min.z + box.max.z) / 2));
    }
    return { h: hMax, v: vMax };
  }
  state() {
    return { placed: this.placed, phoneAR: this.phoneAR, hands: this.hands.map((h) => ({ tracked: h.tracked, pinching: h.pinching })), buttons: this.buttons.buttonIds(), menu: this.menu.mesh.visible, scale: this.stage.root.scale.x, yaw: this.stage.root.rotation.y };
  }

  // ---- teardown ----------------------------------------------------------
  private end() {
    const st = this.stage;
    st.xrHook = null;
    st.arMode = false;
    st.arTouch = false;
    st.floor.visible = true;
    st.root.visible = true;
    st.root.position.set(0, 0, 0);
    st.root.rotation.set(0, 0, 0);
    st.root.scale.setScalar(1);
    for (const p of [this.text, this.side, this.buttons, this.menu]) p.dispose();
    this.hands.forEach((h) => h.dispose());
    this.cursors.forEach((c) => { c.geometry.dispose(); (c.material as THREE.Material).dispose(); c.removeFromParent(); });
    this.rig.removeFromParent();
    this.placement?.dispose();
    this.bar?.remove();
    document.body.removeEventListener('beforexrselect', this.guard);
    document.documentElement.classList.remove('ar-active');
    active = null;
    st.afterXR();
  }
}
