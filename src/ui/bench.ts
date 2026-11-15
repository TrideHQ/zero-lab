import { h } from './dom.ts';
import type { Screen } from '../router.ts';
export default async function bench(_p: string[], _q: URLSearchParams): Promise<Screen> {
  return { el: h('div.page', h('p.muted', 'Practical bench: coming in the next step.')) };
}
