import { h } from './dom.ts';
import { ring } from './components/ring.ts';
import { topicCard } from './components/card.ts';
import { L, t } from '../i18n/index.ts';
import { board, content, mapping, summary } from '../topics/loader.ts';
import { progress, topicFraction } from '../store/progress.ts';
import type { Screen } from '../router.ts';

export default async function home(): Promise<Screen> {
  const physics = content.topics.filter((x) => x.subject === 'physics');
  const moon = content.topics.filter((x) => x.subject === 'moon');
  const recent = progress().recent.map(summary).filter((x) => !!x);
  const featured = ['refraction', 'simple-pendulum', 'ohms-law'].map(summary).filter((x) => !!x);
  const [lead, soft] = t('app.tagline').split(' — ');
  const plate = ['refraction', 'simple-pendulum', 'phases-of-the-moon'].filter((s) => summary(s));

  const el = h('div.page.home',
    h('section.hero',
      h('div.hero-copy',
        h('p.eyebrow', t('home.eyebrow')),
        h('h1.display', lead, soft ? h('span.soft', soft.charAt(0).toUpperCase() + soft.slice(1)) : null),
        h('p.lead', t('app.sub')),
        h('div.cta',
          h('a.btn.primary', { href: '#/s/physics' }, t('home.start')),
          h('a.arrow-link', { href: '#/p/ohms-law' }, t('home.cta2'))),
        h('p.modes', t('home.modes'))),
      h('div.plate', { 'aria-hidden': 'true' },
        plate.map((s) => h('img', { src: `/img/gen/${s}-0.webp`, alt: '', decoding: 'async' })),
        h('div.plate-label', h('span', '0⁰ Lab'), h('span', '3D · AR · VR')))),

    h('section.how', { 'aria-label': t('home.how') },
      [['01', 'how1'], ['02', 'how2'], ['03', 'how3']].map(([n, k]) =>
        h('div', h('span.n', n), h('h3', t(`home.${k}`)), h('p', t(`home.${k}_sub`))))),

    recent.length ? h('section',
      h('p.eyebrow', t('home.continue')),
      h('div.row', recent.map((s) => h('a.chip-card', { href: `#/t/${s!.slug}` },
        ring(topicFraction(s!.slug, s!.cards, s!.checks), 34),
        h('span', h('strong', L(s!.title)), h('small', mapping(s!)?.level ?? '')))))) : null,

    h('section',
      h('div.section-head',
        h('p.eyebrow', { style: { margin: '0' } }, t('home.start_here')),
        h('a.arrow-link', { href: '#/s/physics' }, t('home.all_topics', { n: physics.length }))),
      h('div.cards-grid.three', featured.map((s) => topicCard(s!)))),

    moon.length ? h('section',
      h('a.band', { href: '#/s/moon' },
        h('div.band-copy',
          h('p.eyebrow', { style: { margin: '0' } }, t('subject.experience')),
          h('h2', t('home.moon_title')),
          h('p', t('home.moon_sub')),
          h('span.btn', t('home.open'))),
        h('img', { src: '/img/gen/hammer-and-feather-0.webp', alt: '', loading: 'lazy' }))) : null,

    h('section',
      h('p.eyebrow', t('home.subjects')),
      h('div.subjects',
        h('a.subject', { href: '#/s/physics' }, h('strong', t('home.physics')), h('span', t('home.topics', { n: physics.length }))),
        ['chemistry', 'biology', 'maths'].map((k) => h('div.subject.soon', h('strong', t(`home.${k}`)), h('span', t('home.soon')))))),

    h('section.curricula',
      h('p.eyebrow', t('app.works_with')),
      h('p', content.boards.map((b) => b.name).join('  ·  ')),
      h('a.arrow-link', { href: '#/settings' }, `${t('subject.curriculum')}: ${board().name}`)));
  return { el };
}
