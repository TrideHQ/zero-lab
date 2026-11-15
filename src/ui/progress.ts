import { h } from './dom.ts';
import { t } from '../i18n/index.ts';
import type { Screen } from '../router.ts';
export default async function progressPage(): Promise<Screen> {
  return { el: h('div.page', h('h1', t('progress.title')), h('p.muted', t('progress.none'))) };
}
