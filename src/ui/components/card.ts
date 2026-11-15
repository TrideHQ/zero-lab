import { h } from '../dom.ts';
import { ring } from './ring.ts';
import { L, t } from '../../i18n/index.ts';
import { board, mapping } from '../../topics/loader.ts';
import { topicFraction } from '../../store/progress.ts';
import type { TopicSummary } from '../../types.ts';

/** A topic card: diagram thumbnail (rendered from the topic's own 3D model), title, summary, level. */
export function topicCard(s: TopicSummary): HTMLElement {
  const b = board();
  const m = mapping(s);
  const boardLabel = m && b.id !== 'international' && m.topic.toLowerCase() !== L(s.title).toLowerCase() ? m.topic : null;
  const img = h('img', { src: `/img/gen/${s.slug}-0.webp`, alt: '', loading: 'lazy', decoding: 'async' }) as HTMLImageElement;
  img.onerror = () => img.remove();
  const done = topicFraction(s.slug, s.cards, s.checks);
  return h('a.card', { href: `#/t/${s.slug}`, 'data-slug': s.slug },
    h('div.thumb', img),
    h('div.card-text',
      h('span.meta', m ? m.level : t('subject.beyond')),
      h('strong', L(s.title)),
      h('p', boardLabel ? `${b.name}: ${boardLabel}` : L(s.summary)),
      h('div.card-foot',
        done > 0 ? ring(done, 26) : null,
        h('span.tags',
          s.practical ? h('span.tag.practical', t('subject.practical')) : null,
          !s.reviewed ? h('span.tag.draft', t('topic.draft')) : null,
          m && !m.verified && import.meta.env.DEV ? h('span.tag.dev', t('subject.unverified')) : null))));
}
