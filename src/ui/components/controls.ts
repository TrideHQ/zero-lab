// Renders a template's controls (sliders, toggles, actions) so every interaction
// that can be done by dragging in 3D also has a plain, accessible control.
import { h } from '../dom.ts';
import { num, t } from '../../i18n/index.ts';
import type { Stage } from '../../render/renderer.ts';
import type { Template } from '../../templates/types.ts';

export interface ControlBar { el: HTMLElement; sync(): void }

export function controlBar(tpl: Template, stage: Stage, only?: string[]): ControlBar {
  const syncs: (() => void)[] = [];
  const el = h('div.tools-inner', { style: { display: 'contents' } });
  for (const c of tpl.controls()) {
    if (only && !only.includes(c.key)) continue;
    if (c.type === 'range') {
      const out = h('b');
      const input = h('input', { type: 'range', min: c.min, max: c.max, step: c.step, 'data-key': c.key, 'aria-label': t(c.label),
        oninput: () => { tpl.setState({ [c.key]: Number(input.value) }, { animate: false }); show(); } }) as HTMLInputElement;
      const show = () => { out.textContent = num(Number(tpl.getState()[c.key]), c.dp ?? 0) + (c.unit ?? ''); };
      syncs.push(() => { input.value = String(tpl.getState()[c.key]); show(); });
      el.append(h('label', t(c.label), input, out));
    } else if (c.type === 'toggle') {
      const btn = h('button.btn.small', { 'data-key': c.key, onclick: () => { tpl.setState({ [c.key]: !tpl.getState()[c.key] }); sync(); } }, t(c.label));
      syncs.push(() => btn.setAttribute('aria-pressed', String(!!tpl.getState()[c.key])));
      el.append(btn);
    } else if (c.type === 'action') {
      el.append(h('button.btn.small', { 'data-key': c.key, onclick: () => { tpl.action(c.key); sync(); } }, t(c.label)));
    } else if (c.type === 'choice') {
      const seg = h('span.seg', { role: 'radiogroup', 'aria-label': t(c.label) }, (c.options ?? []).map((o) =>
        h('button', { role: 'radio', 'data-key': c.key, 'data-value': o.value, onclick: () => { tpl.setState({ [c.key]: Number.isNaN(Number(o.value)) ? o.value : Number(o.value) }); sync(); } }, t(o.label))));
      syncs.push(() => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.getAttribute('data-value') === String(tpl.getState()[c.key])))));
      el.append(seg);
    }
  }
  if (tpl.canSlice && (!only || only.includes('slice'))) {
    const btn = h('button.btn.small', { 'data-key': 'slice', onclick: () => stage.setSlice(stage.slice > 0.5 ? 0 : 1) }, t('topic.slice'));
    stage.onSlice = (v) => btn.setAttribute('aria-pressed', String(v > 0.5));
    el.append(btn);
  }
  if (!only) el.append(h('button.btn.small', { 'data-key': 'reset-view', 'aria-label': t('topic.reset'), title: t('topic.reset'), onclick: () => stage.resetView() }, '⟲'));
  const sync = () => syncs.forEach((f) => f());
  tpl.onChange = sync;
  sync();
  return { el, sync };
}
