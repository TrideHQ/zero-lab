import { h } from '../dom.ts';

/** Progress ring, 0..1. */
export function ring(fraction: number, size = 44): HTMLElement {
  const r = 16, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  const el = h('span.ring', { role: 'img', 'aria-label': Math.round(f * 100) + '%' });
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 40 40"><circle cx="20" cy="20" r="${r}" fill="none" stroke="rgba(54,227,255,.18)" stroke-width="4"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="${f >= 1 ? '#ffb347' : '#36e3ff'}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 20 20)"/>${f >= 1 ? '<path d="M14 20.5l4 4 8-9" fill="none" stroke="#ffb347" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' : ''}</svg>`;
  return el;
}
