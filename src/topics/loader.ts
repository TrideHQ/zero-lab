// Topic and practical loading. The index ships in the bundle; each topic is a
// small JSON fetched on demand (and cached by the service worker when present).
import index from 'virtual:content-index';
import type { Board, ContentIndex, Mapping, Practical, RubricFile, Topic, TopicSummary } from '../types.ts';
import { settings } from '../store/settings.ts';
import { L } from '../i18n/index.ts';

export const content: ContentIndex = index;
const mem = new Map<string, unknown>();

async function getJson<T>(url: string): Promise<T> {
  if (mem.has(url)) return mem.get(url) as T;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const j = (await r.json()) as T;
  mem.set(url, j);
  return j;
}

export const summary = (slug: string): TopicSummary | undefined => content.topics.find((t) => t.slug === slug);

export function loadTopic(slug: string): Promise<Topic> {
  const s = summary(slug);
  if (!s) return Promise.reject(new Error(`Unknown topic ${slug}`));
  return getJson<Topic>(`/content/${s.subject}/${slug}.json`);
}
export const loadPractical = (slug: string) => getJson<Practical>(`/practicals/${slug}.json`);
export const loadRubrics = () => getJson<RubricFile>('/practicals/rubric.json');

export function board(id = settings().board): Board {
  return content.boards.find((b) => b.id === id) ?? content.boards[0];
}

export const mapping = (t: { curricula: Record<string, Mapping | null> }, boardId = settings().board): Mapping | null =>
  t.curricula[boardId] ?? null;

export interface Group { unit: string; inSyllabus: boolean; topics: TopicSummary[] }

/** Topics of a subject grouped the way the chosen board groups them. Topics the
 *  board does not list are kept, in a final "beyond this syllabus" group. */
export function grouped(subject: string, boardId = settings().board): Group[] {
  const b = board(boardId);
  const groups: Group[] = [];
  const extra: TopicSummary[] = [];
  for (const t of content.topics.filter((t) => t.subject === subject)) {
    const m = mapping(t, b.id);
    if (!m) {
      extra.push(t);
      continue;
    }
    const unit = m.unit ?? L(t.unit);
    let g = groups.find((g) => g.unit === unit);
    if (!g) groups.push((g = { unit, inSyllabus: true, topics: [] }));
    g.topics.push(t);
  }
  const rank = (t: TopicSummary) => {
    const i = b.levels.indexOf(mapping(t, b.id)?.level ?? '');
    return i < 0 ? 99 : i;
  };
  groups.forEach((g) => g.topics.sort((a, c) => rank(a) - rank(c)));
  if (extra.length) groups.push({ unit: '', inSyllabus: false, topics: extra });
  return groups;
}
