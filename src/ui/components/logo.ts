import { h } from '../dom.ts';

/** The wordmark: "0⁰ Lab", with the superscript zero drawn as a small glowing ring. */
export function logo(size = 28): HTMLElement {
  return h('span.logo', { role: 'img', 'aria-label': '0⁰ Lab', style: { fontSize: size + 'px' } },
    h('span', { 'aria-hidden': 'true' }, '0'),
    h('span.logo-ring', { 'aria-hidden': 'true' }),
    h('span', { 'aria-hidden': 'true' }, ' Lab'));
}
