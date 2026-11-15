// Results table, built live from the readings the student has taken.
import { h } from '../ui/dom.ts';
import { num } from '../i18n/index.ts';
import type { PracticalEngine } from './engine.ts';

export function tableSpec(e: PracticalEngine): { head: string[]; rows: string[][]; flags: number[] } {
  const cols = e.practical.table.columns;
  return {
    head: ['#', ...cols.map((c) => (c.unit ? `${c.label} / ${c.unit}` : c.label))],
    rows: e.rows.map((r, i) => [String(i + 1), ...cols.map((c) => num(r.values[c.id], c.dp))]),
    flags: e.rows.map((r, i) => (r.issues.some((x) => x !== 'none') ? i : -1)).filter((i) => i >= 0),
  };
}

export function renderTable(e: PracticalEngine, highlight = 0): HTMLElement {
  const cols = e.practical.table.columns;
  const spec = tableSpec(e);
  const body = spec.rows.map((cells, i) =>
    h('tr', { class: i + 1 === highlight || spec.flags.includes(i) ? 'flag' : '', 'data-row': i + 1 },
      cells.map((c, k) => h('td', { class: k > 0 && cols[k - 1].source === 'derived' ? 'derived' : '' }, c))));
  for (let i = spec.rows.length; i < e.target; i++) body.push(h('tr', h('td', String(i + 1)), cols.map(() => h('td', ' '))));
  return h('table.results', { id: 'results' }, h('thead', h('tr', spec.head.map((x) => h('th', x)))), h('tbody', body));
}
