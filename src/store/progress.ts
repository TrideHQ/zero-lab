// Learning progress, kept in localStorage only (no accounts in the MVP).
export interface TopicProgress { card: number; checks: number[]; done: boolean; at: number }
export interface PracticalResult {
  slug: string;
  variant: string;
  board: string;
  rubric: string;
  score: number;
  total: number;
  type: string;
  symbol: string;
  answer: number;
  unit: string;
  pctError: number;
  graph: string;
  at: number;
}
export interface Progress { topics: Record<string, TopicProgress>; practicals: Record<string, PracticalResult>; recent: string[] }

const KEY = 'zero-lab:progress:v1';
let cache: Progress | null = null;

export function progress(): Progress {
  if (cache) return cache;
  try {
    cache = { topics: {}, practicals: {}, recent: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    cache = { topics: {}, practicals: {}, recent: [] };
  }
  return cache!;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch { /* storage unavailable: progress lasts for this visit only */ }
}

export function visitTopic(slug: string, card: number) {
  const p = progress();
  const tp = (p.topics[slug] ??= { card: 0, checks: [], done: false, at: 0 });
  tp.card = Math.max(tp.card, card);
  tp.at = Date.now();
  p.recent = [slug, ...p.recent.filter((s) => s !== slug)].slice(0, 5);
  save();
}

export function passCheck(slug: string, index: number, totalChecks: number) {
  const p = progress();
  const tp = (p.topics[slug] ??= { card: 0, checks: [], done: false, at: Date.now() });
  if (!tp.checks.includes(index)) tp.checks.push(index);
  if (tp.checks.length >= totalChecks) tp.done = true;
  save();
}

export function savePractical(key: string, r: PracticalResult) {
  progress().practicals[key] = r;
  save();
}

/** 0..1 for the progress ring: cards seen count half, checks passed the other half. */
export function topicFraction(slug: string, cards: number, checks: number): number {
  const tp = progress().topics[slug];
  if (!tp) return 0;
  const c = cards > 0 ? Math.min(1, (tp.card + 1) / cards) : 1;
  const k = checks > 0 ? Math.min(1, tp.checks.length / checks) : 1;
  return 0.5 * c + 0.5 * k;
}

export function resetProgress() {
  cache = { topics: {}, practicals: {}, recent: [] };
  save();
}
