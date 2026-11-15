// Progress and the revision summary: a printable page (print or save as PDF)
// plus a Copy button for places where downloads and printing are blocked.
import { h } from './dom.ts';
import { ring } from './components/ring.ts';
import { texToText } from './components/katex.ts';
import { L, num, t } from '../i18n/index.ts';
import { content, loadTopic, mapping } from '../topics/loader.ts';
import { progress, resetProgress, topicFraction } from '../store/progress.ts';
import { render, type Screen } from '../router.ts';

export default async function progressPage(): Promise<Screen> {
  const p = progress();
  const seen = content.topics.filter((s) => p.topics[s.slug]);
  const checks = Object.values(p.topics).reduce((a, x) => a + x.checks.length, 0);
  const practicals = Object.values(p.practicals);
  const score = (r: (typeof practicals)[number]) => (r.type === 'percent' ? `${num(r.score)}%` : `${num(r.score)} / ${num(r.total)}`);
  const title = (slug: string) => L(content.practicals.find((x) => x.slug === slug)?.title);

  const sheet = h('div.summary-sheet', { id: 'summary' });
  const lines: string[] = [];
  const el = h('div.page.progress',
    h('header.page-head.no-print', h('a.back', { href: '#/', 'aria-label': t('app.back') }, '←'), h('h1', t('progress.title'))),
    h('div.stats.no-print',
      h('div.stat', h('b', { id: 'stat-topics' }, String(seen.length)), t('progress.explored')),
      h('div.stat', h('b', { id: 'stat-checks' }, String(checks)), t('progress.checks')),
      h('div.stat', h('b', { id: 'stat-practicals' }, String(practicals.length)), t('progress.practicals'))),
    !seen.length && !practicals.length ? h('p.muted', t('progress.none')) : null,
    seen.length ? h('section.no-print', h('div.topic-list', seen.map((s) => h('a.topic-row', { href: `#/t/${s.slug}` },
      ring(topicFraction(s.slug, s.cards, s.checks)), h('span.topic-main', h('strong', L(s.title)), h('small', mapping(s)?.level ?? '')))))) : null,
    practicals.length ? h('section.no-print', h('h2', t('progress.your_practicals')), h('div.topic-list', practicals.map((r) =>
      h('a.topic-row', { href: `#/p/${r.slug}?v=${r.variant}` }, h('span.topic-main', h('strong', title(r.slug)), h('small', `${r.symbol} = ${num(r.answer, 2)} ${r.unit} · ${t('bench.error')} ${num(r.pctError, 1)}%`)), h('span.tag.practical', score(r)))))) : null,
    seen.length || practicals.length ? h('section',
      h('div.no-print', h('h2', t('progress.summary')), h('p.muted', t('progress.summary_sub')),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' } },
          h('button.btn.primary', { id: 'print', onclick: () => window.print() }, t('progress.print')),
          h('button.btn', { id: 'copy', onclick: async (e: Event) => {
            const btn = e.currentTarget as HTMLElement;
            const text = lines.join('\n');
            try {
              await navigator.clipboard.writeText(text);
            } catch { // clipboard blocked: select the summary so it can be copied by hand
              const r = document.createRange();
              r.selectNodeContents(sheet);
              getSelection()?.removeAllRanges();
              getSelection()?.addRange(r);
            }
            btn.textContent = t('progress.copied');
          } }, t('progress.copy')))),
      sheet) : null,
    h('p.no-print', { style: { marginTop: '28px' } }, h('button.btn.small', { id: 'reset', onclick: () => { if (confirm(t('progress.reset_confirm'))) { resetProgress(); void render(); } } }, t('progress.reset'))));

  // build the summary from the topics actually explored
  sheet.append(h('h2', `0⁰ Lab · ${t('progress.summary')}`), h('small', new Date().toLocaleDateString()));
  lines.push(`0⁰ Lab · ${t('progress.summary')}`, '');
  void (async () => {
    for (const s of seen) {
      try {
        const topic = await loadTopic(s.slug);
        sheet.append(h('h3', L(topic.title)), h('p.muted', L(topic.summary)),
          h('ul', topic.cards.map((c) => h('li', h('strong', L(c.title) + ': '), L(c.text), c.equation ? h('em', '  ' + texToText(c.equation)) : null))));
        lines.push(L(topic.title).toUpperCase(), L(topic.summary), ...topic.cards.map((c) => `- ${L(c.title)}: ${L(c.text)}${c.equation ? '  [' + texToText(c.equation) + ']' : ''}`), '');
      } catch { /* offline and not cached: skip this topic */ }
    }
    if (practicals.length) {
      sheet.append(h('h2', t('progress.your_practicals')));
      lines.push(t('progress.your_practicals').toUpperCase());
      for (const r of practicals) {
        const line = `${title(r.slug)}: ${r.symbol} = ${num(r.answer, 2)} ${r.unit} (${t('bench.error')} ${num(r.pctError, 1)}%), ${score(r)}`;
        sheet.append(h('h3', title(r.slug)), h('p', line.slice(title(r.slug).length + 2)));
        if (r.graph) sheet.append(h('img', { src: r.graph, alt: t('bench.graph') }));
        lines.push('- ' + line);
      }
    }
    sheet.dataset.ready = '1';
  })();
  return { el };
}
