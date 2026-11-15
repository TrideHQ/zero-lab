// ?debug=1 : a small on-screen readout for measuring on a real phone.
// Frame rate (1 s average and the worst frame in that second), time to first
// paint, time to open a topic and time until the 3D model is ready.
import { isLite } from '../store/settings.ts';
import { t } from '../i18n/index.ts';

const marks: Record<string, number> = {};
/** Called by the router and the topic / bench screens. */
export function perfMark(name: 'route' | 'screen' | 'model') {
  marks[name] = performance.now();
  if (name === 'route') { delete marks.screen; delete marks.model; }
}

export function installDebug() {
  const el = document.createElement('div');
  el.id = 'debug';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99998;font:600 12px/1.45 ui-monospace,Menlo,monospace;color:#d8f6ff;background:rgba(4,8,24,.86);border:1px solid rgba(54,227,255,.35);border-radius:10px;padding:8px 10px;pointer-events:none;white-space:pre';
  document.body.append(el);
  let frames = 0, worst = 0, last = performance.now(), since = last, fps = 0, slowest = 0;
  const tick = (now: number) => {
    frames++;
    worst = Math.max(worst, now - last);
    last = now;
    if (now - since >= 1000) {
      fps = (frames * 1000) / (now - since);
      slowest = worst;
      frames = 0;
      worst = 0;
      since = now;
      const paint = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
      const ms = (v?: number) => (v === undefined ? '–' : `${Math.round(v)} ms`);
      const stage = (window as unknown as { __stage?: { fps: number; presenting: boolean } }).__stage;
      el.textContent = [
        `${t('debug.fps')}  ${fps.toFixed(0)}  (worst frame ${slowest.toFixed(0)} ms)${stage?.presenting ? `  XR ${stage.fps.toFixed(0)}` : ''}`,
        `${t('debug.load')}  ${ms(paint)}`,
        `${t('debug.topic')}  ${ms(marks.screen !== undefined ? marks.screen - marks.route : undefined)}`,
        `${t('debug.model')}  ${ms(marks.model !== undefined ? marks.model - marks.route : undefined)}`,
        `${t('debug.mode')}  ${isLite() ? t('debug.lite') : t('debug.full')}  ·  DPR ${devicePixelRatio}  ·  ${innerWidth}×${innerHeight}`,
      ].join('\n');
      (window as unknown as { __perf: unknown }).__perf = { fps, slowest, paint, screen: marks.screen - marks.route, model: marks.model - marks.route };
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
