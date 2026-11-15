import { h } from './dom.ts';
import { ring } from './components/ring.ts';
import { boardList } from './components/picker.ts';
import { L, t } from '../i18n/index.ts';
import { board, grouped, mapping } from '../topics/loader.ts';
import { topicFraction } from '../store/progress.ts';
import { saveSettings } from '../store/settings.ts';
import type { Screen } from '../router.ts';

export default async function subject(params: string[]): Promise<Screen> {
  const subjectId = params[0] === 'moon' ? 'moon' : 'physics';
  const el = h('div.page.subject');

  const draw = () => {
    const b = board();
    const groups = grouped(subjectId);
    const switcher = h('details.board-switch', h('summary', h('span.muted', t('subject.curriculum') + ': '), h('strong', { id: 'board-name' }, b.name), h('span.link', t('subject.change'))),
      boardList((id) => { saveSettings({ board: id, picked: true }); draw(); }));
    el.replaceChildren(
      h('header.page-head',
        h('a.back', { href: '#/', 'aria-label': t('app.back') }, '←'),
        h('h1', t(`subject.title_${subjectId}`))),
      switcher,
      ...groups.map((g) => h('section.unit',
        h('h2', g.inSyllabus ? g.unit : t('subject.beyond')),
        g.inSyllabus ? null : h('p.muted', t('subject.beyond_sub')),
        h('div.topic-list', g.topics.map((s) => {
          const m = mapping(s);
          const boardLabel = m && b.id !== 'international' && m.topic.toLowerCase() !== L(s.title).toLowerCase() ? m.topic : null;
          return h('a.topic-row', { href: `#/t/${s.slug}`, 'data-slug': s.slug },
            ring(topicFraction(s.slug, s.cards, s.checks)),
            h('span.topic-main',
              h('strong', L(s.title)),
              boardLabel ? h('small.board-topic', `${b.name}: ${boardLabel}`) : h('small', L(s.summary)),
              h('span.tags',
                m ? h('span.tag.level', m.level) : null,
                s.practical ? h('span.tag.practical', t('subject.practical')) : null,
                !s.reviewed ? h('span.tag.draft', t('topic.draft')) : null,
                m && !m.verified && import.meta.env.DEV ? h('span.tag.dev', t('subject.unverified')) : null)));
        })))));
  };
  draw();
  return { el };
}
