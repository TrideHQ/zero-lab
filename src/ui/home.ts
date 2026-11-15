import { h } from './dom.ts';
import { logo } from './components/logo.ts';
import { ring } from './components/ring.ts';
import { L, t } from '../i18n/index.ts';
import { board, content, mapping, summary } from '../topics/loader.ts';
import { progress, topicFraction } from '../store/progress.ts';
import type { Screen } from '../router.ts';

export default async function home(): Promise<Screen> {
  const physics = content.topics.filter((x) => x.subject === 'physics');
  const moon = content.topics.filter((x) => x.subject === 'moon');
  const recent = progress().recent.map(summary).filter((x) => !!x);

  const tile = (name: string, glyph: string, href: string | null, sub: string) =>
    h(href ? 'a.tile' : 'div.tile.soon', href ? { href } : {}, h('span.tile-glyph', { 'aria-hidden': 'true' }, glyph), h('span.tile-name', name), h('span.tile-sub', sub));

  const el = h('div.page.home',
    h('section.hero',
      h('div.hero-glow', { 'aria-hidden': 'true' }),
      logo(64),
      h('h1.tagline', t('app.tagline')),
      h('p.lead', t('app.sub')),
      h('a.btn.primary', { href: '#/s/physics' }, t('home.start'))),
    recent.length ? h('section',
      h('h2', t('home.continue')),
      h('div.row', recent.map((s) => h('a.chip-card', { href: `#/t/${s!.slug}` },
        ring(topicFraction(s!.slug, s!.cards, s!.checks), 36),
        h('span', h('strong', L(s!.title)), h('small', mapping(s!)?.level ?? '')))))) : null,
    h('section',
      h('h2', t('home.subjects')),
      h('div.tiles',
        tile(t('home.physics'), 'Φ', '#/s/physics', t('home.topics', { n: physics.length })),
        tile(t('home.chemistry'), '⚗', null, t('home.soon')),
        tile(t('home.biology'), '🧬', null, t('home.soon')),
        tile(t('home.maths'), '∑', null, t('home.soon')))),
    moon.length ? h('section',
      h('a.feature', { href: '#/s/moon' },
        h('span.moon-disc', { 'aria-hidden': 'true' }),
        h('span', h('strong', t('home.moon_title')), h('span.muted', t('home.moon_sub'))),
        h('span.btn', t('home.open')))) : null,
    h('section.boards-strip',
      h('h2', t('app.works_with')),
      h('p.muted', content.boards.map((b) => b.name).join(' · ')),
      h('p', h('a', { href: '#/settings' }, `${t('subject.curriculum')}: ${board().name} · ${t('subject.change')}`))));
  return { el };
}
