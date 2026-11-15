import { h } from './dom.ts';
import { boardList } from './components/picker.ts';
import { topicCard } from './components/card.ts';
import { t } from '../i18n/index.ts';
import { board, grouped } from '../topics/loader.ts';
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
        h('div.unit-head',
          h('h2', g.inSyllabus ? g.unit : t('subject.beyond')),
          g.inSyllabus ? h('span', t('home.topics', { n: g.topics.length })) : h('span', t('subject.beyond_sub'))),
        h('div.cards-grid', g.topics.map((s) => topicCard(s))))));
  };
  draw();
  return { el };
}
