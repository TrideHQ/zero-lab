// Simple pendulum -> g. The student sets the length, releases the bob, and
// times 20 swings with the stopwatch. Nothing is filled in for them.
import * as THREE from 'three';
import { createTemplate } from '../../templates/registry.ts';
import type { ForcesRig } from '../../templates/forces-rig/index.ts';
import { Label } from '../../render/label.ts';
import { WARM, edges, holo } from '../../render/hologram-shader.ts';
import { Stopwatch } from '../stopwatch.ts';
import type { Action, Driver, DriverCtx } from '../driver.ts';
import { t } from '../../i18n/index.ts';
import { blip } from '../../audio/sfx.ts';

export async function mount(ctx: DriverCtx): Promise<Driver> {
  const g = Number(ctx.practical.variants[ctx.engine.variant].params.g);
  const tpl = (await createTemplate('forces-rig', 'pendulum', { g }, ctx.lite)) as ForcesRig;
  const bench = tpl.bench();
  tpl.setState({ L: 0.6, amp: 8, running: false, arrows: false }, { animate: false });
  const sw = new Stopwatch();
  const fast = Number(new URLSearchParams(location.hash.split('?')[1] ?? '').get('fast') ?? 0);
  bench.timeScale = fast || 1;

  // a stopwatch you can tap (or pinch) on the bench itself
  const watch = new THREE.Group();
  const face = new THREE.CylinderGeometry(0.16, 0.16, 0.05, ctx.lite ? 16 : 28);
  const fm = new THREE.Mesh(face, holo(WARM, { opacity: 1, fill: 0.3 }));
  fm.rotation.x = Math.PI / 2;
  fm.add(edges(face, WARM));
  const time = new Label('0:00.00', { color: '#fff0b8', size: 0.085, weight: 700 });
  time.at(0, 0, 0.05);
  watch.add(fm, time.sprite);
  watch.position.set(0.72, 0.62, 0.25);
  tpl.group.add(watch);
  const watchPos = watch.position.clone();

  const toggle = () => {
    sw.toggle();
    blip('tick');
    ctx.refresh();
  };

  const driver: Driver = {
    template: tpl,
    handles: [{ name: 'stopwatch', pos: watchPos, radius: 0.2, tap: toggle }],
    actions(): Action[] {
      const s = tpl.getState();
      return [
        { id: 'L', label: t('controls.length'), kind: 'range', min: 0.2, max: 1, step: 0.05, value: Number(s.L), unit: ' m', dp: 2, on: (v) => { bench.setLength(v!); ctx.refresh(); } },
        { id: 'amp', label: t('bench.pull'), kind: 'range', min: 2, max: 40, step: 1, value: Math.abs(Number(s.amp)), unit: '°', dp: 0, on: (v) => { bench.pull(v!); ctx.refresh(); } },
        { id: 'release', label: t('controls.release'), kind: 'button', on: () => { bench.release(); ctx.refresh(); } },
        { id: 'stopwatch', label: sw.running ? t('bench.stop') : t('bench.start'), kind: 'button', primary: true, on: toggle },
        { id: 'sw-reset', label: t('bench.reset'), kind: 'button', on: () => { sw.reset(); ctx.refresh(); } },
        { id: 'speed', label: `${t('bench.speed')} ${bench.timeScale > 1 ? '×' + bench.timeScale : '×1'}`, kind: 'toggle', pressed: bench.timeScale > 1, on: () => { bench.timeScale = bench.timeScale > 1 ? 1 : 4; ctx.refresh(); } },
      ];
    },
    readout: () => sw.text(),
    status: () => `L = ${Number(tpl.getState().L).toFixed(2)} m`,
    step() {
      if (sw.running) return 2;
      if (sw.read() > 0) return 3;
      return bench.running() ? 2 : ctx.engine.rows.length || Number(tpl.getState().L) !== 0.6 ? 1 : 0;
    },
    read() {
      if (sw.running) return { error: 'bench.stop_first' };
      if (sw.read() <= 0) return { error: 'bench.time_first' };
      return { values: { L: Number(tpl.getState().L), t: sw.read() }, meta: { amp: Math.abs(bench.releaseAmp()) } };
    },
    afterRecord() {
      sw.reset();
    },
    update(dt) {
      sw.tick(dt * bench.timeScale);
      time.set(sw.text());
    },
    bot: {
      setLength: (L) => bench.setLength(L),
      pull: (deg) => bench.pull(deg),
      release: () => bench.release(),
      swings: () => bench.swings(),
      toggle,
      time: () => sw.read(),
      speed: (v) => { bench.timeScale = v; },
    },
    dispose() {
      time.dispose();
    },
  };
  return driver;
}
