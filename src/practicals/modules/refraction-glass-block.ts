// Refraction through a glass block -> n. The student places four pins by
// tapping the rays, the rays are traced from those pins, and the protractor
// reads i and r. Viewing from the side gives a parallax error, as in a real lab.
import type * as THREE from 'three';
import { createTemplate } from '../../templates/registry.ts';
import { BLOCK } from '../../templates/ray-optics/index.ts';
import { Beams, type Seg } from '../../render/beams.ts';
import { CYAN, WARM, WHITE } from '../../render/hologram-shader.ts';
import { protractorSegs, readAngles, tracePins, type Pin } from '../protractor.ts';
import type { Action, Driver, DriverCtx } from '../driver.ts';
import { t } from '../../i18n/index.ts';
import { blip } from '../../audio/sfx.ts';

export async function mount(ctx: DriverCtx): Promise<Driver> {
  const n = Number(ctx.practical.variants[ctx.engine.variant].params.n);
  const tpl = await createTemplate('ray-optics', 'glass-block', { n, hideN: true }, ctx.lite);
  tpl.setState({ angle: 30, showNormal: false, photons: false }, { animate: false });
  const top = BLOCK.cy + BLOCK.h / 2, bottom = BLOCK.cy - BLOCK.h / 2;
  let above: Pin[] = [], below: Pin[] = [];
  const marks = new Beams(260);
  tpl.group.add(marks.mesh);

  const sign = () => (ctx.engine.rows.length % 2 === 0 ? 1 : -1);
  const trace = () => tracePins(above, below, top, bottom);
  const current = () => {
    const tr = trace();
    return tr ? readAngles(tr, ctx.stage.viewObliqueness(), sign()) : null;
  };

  const draw = () => {
    const segs: Seg[] = [];
    for (const p of [...above, ...below]) {
      segs.push({ a: [p.x - 0.035, p.y, 0.01], b: [p.x + 0.035, p.y, 0.01], c: WARM, w: 0.012 });
      segs.push({ a: [p.x, p.y - 0.035, 0.01], b: [p.x, p.y + 0.035, 0.01], c: WARM, w: 0.012 });
      segs.push({ a: [p.x, p.y, 0], b: [p.x, p.y, 0.12], c: WARM, w: 0.01 });
    }
    const tr = trace();
    if (tr) {
      const far = above[0].y > above[1].y ? above[0] : above[1];
      const low = below[0].y < below[1].y ? below[0] : below[1];
      segs.push({ a: [far.x, far.y, 0.006], b: [tr.entry.x, top, 0.006], c: WHITE, w: 0.008, dash: 0.02 });
      segs.push({ a: [tr.entry.x, top, 0.006], b: [tr.exit.x, bottom, 0.006], c: WHITE, w: 0.008, dash: 0.02 });
      segs.push({ a: [tr.exit.x, bottom, 0.006], b: [low.x, low.y, 0.006], c: WHITE, w: 0.008, dash: 0.02 });
      segs.push({ a: [tr.entry.x, top + 0.42, 0.006], b: [tr.entry.x, top - 0.42, 0.006], c: CYAN, w: 0.008, dash: 0.03 });
      segs.push(...protractorSegs(tr.entry.x, top, 0.34, CYAN));
    }
    marks.set(segs);
  };
  const clear = () => {
    above = [];
    below = [];
    draw();
    ctx.refresh();
  };
  tpl.onChange = clear; // moving the ray box invalidates the pins

  const place = (p: Pin) => {
    if (p.y > top + 0.03 && above.length < 2) above.push(p);
    else if (p.y < bottom - 0.03 && below.length < 2) below.push(p);
    else return;
    blip('tick');
    draw();
    ctx.refresh();
  };

  const driver: Driver = {
    template: tpl,
    handles: [],
    actions(): Action[] {
      return [
        { id: 'angle', label: t('controls.angle'), kind: 'range', min: 10, max: 75, step: 1, value: Number(tpl.getState().angle), unit: '°', dp: 0, on: (v) => { tpl.setState({ angle: v! }, { animate: false }); clear(); } },
        { id: 'straight', label: t('bench.top_view'), kind: 'button', on: () => { ctx.stage.orbit.yaw = 0; ctx.stage.orbit.pitch = 0; ctx.refresh(); } },
        { id: 'clear-pins', label: t('bench.clear_pins'), kind: 'button', disabled: above.length + below.length === 0, on: clear },
      ];
    },
    readout() {
      const a = current();
      return a ? t('bench.i_r', { i: a.i, r: a.r }) : t('bench.pins', { n: above.length + below.length });
    },
    status: () => (above.length + below.length < 4 ? t('bench.pin', { n: above.length + below.length + 1 }) : t('bench.pins_done')),
    step: () => (above.length + below.length === 0 ? (ctx.engine.rows.length ? 0 : 0) : above.length + below.length < 4 ? 1 : 2),
    read() {
      const tr = trace();
      if (!tr) return { error: 'bench.pins_first' };
      const oblique = ctx.stage.viewObliqueness();
      const a = readAngles(tr, oblique, sign());
      return { values: { i: a.i, r: a.r }, meta: { oblique, pinGap: tr.pinGap, trueI: Number(tpl.getState().angle) } };
    },
    afterRecord: clear,
    update() {},
    onTapPoint: (local: THREE.Vector3) => place({ x: local.x, y: local.y }),
    bot: {
      angle: (v) => { tpl.setState({ angle: v }, { animate: false }); clear(); },
      pin: (x, y) => place({ x, y }),
      straight: () => { ctx.stage.orbit.yaw = 0; ctx.stage.orbit.pitch = 0; },
      pins: () => above.length + below.length,
    },
    dispose() {
      marks.dispose();
    },
  };
  return driver;
}
