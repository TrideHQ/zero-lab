// The contract between the app and the AI lab partner. Shared by the client,
// the server and the tests. The model may only phrase feedback: it picks no
// marks, and any number it writes must already be in the context it was given.
export const ISSUES = [
  'late_start', 'miscount', 'large_angle', 'parallax', 'pins_too_close', 'misread_scale', 'switch_open',
  'duplicate_reading', 'narrow_range', 'too_few_readings', 'wrong_axis', 'unit_missing', 'wrong_formula', 'outlier', 'none',
];
export const TIPS = [
  'count_from_zero', 'small_angle', 'eye_level', 'space_pins', 'read_nearest_division', 'close_switch',
  'change_setting', 'spread_readings', 'take_more_readings', 'swap_axes', 'add_unit', 'check_formula', 'repeat_reading', 'keep_going', 'none',
];
export const ISSUE_TIP: Record<string, string> = {
  late_start: 'count_from_zero', miscount: 'count_from_zero', large_angle: 'small_angle', parallax: 'eye_level',
  pins_too_close: 'space_pins', misread_scale: 'read_nearest_division', switch_open: 'close_switch',
  duplicate_reading: 'change_setting', narrow_range: 'spread_readings', too_few_readings: 'take_more_readings',
  wrong_axis: 'swap_axes', unit_missing: 'add_unit', wrong_formula: 'check_formula', outlier: 'repeat_reading', none: 'keep_going',
};
export const PRACTICALS = ['pendulum-g', 'refraction-glass-block', 'ohms-law'];
export const EVENTS = ['hello', 'reading', 'analysis', 'final'];
export const LOCALE_NAMES: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese', ar: 'Arabic', hi: 'Hindi', sw: 'Swahili', zh: 'Chinese' };

export interface PartnerContext {
  practical: string;
  variant: string;
  board: string;
  locale: string;
  event: 'hello' | 'reading' | 'analysis' | 'final';
  n: number;
  target: number;
  readings: Record<string, number>[];
  stats: { slope: number | null; r2: number | null; answer: number | null; pctError: number | null; unit: string };
  issues: string[];
  /** The one issue to talk about now ('none' when the last step went well). */
  issue: string;
  /** 1-based index of the reading that issue is about, or 0. */
  reading: number;
  mark: { got: number; max: number } | null;
}

export interface PartnerSay { say: string; highlight: string | null; tip: string; mark: null }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown) => (isNum(v) ? v : null);
const word = (v: unknown, max = 40) => (typeof v === 'string' && /^[\w\-()\/²°Ω ]{0,40}$/.test(v) ? v.slice(0, max) : '');

/** Server-side whitelist: anything not listed here never reaches the model. */
export function sanitizeContext(raw: unknown): PartnerContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!PRACTICALS.includes(r.practical as string) || !EVENTS.includes(r.event as string)) return null;
  const readings = Array.isArray(r.readings) ? r.readings.slice(0, 12) : [];
  const stats = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
  const mark = r.mark && typeof r.mark === 'object' ? (r.mark as Record<string, unknown>) : null;
  return {
    practical: r.practical as string,
    variant: word(r.variant, 20),
    board: word(r.board, 20),
    locale: typeof r.locale === 'string' && r.locale in LOCALE_NAMES ? r.locale : 'en',
    event: r.event as PartnerContext['event'],
    n: isNum(r.n) ? Math.max(0, Math.min(20, Math.round(r.n))) : 0,
    target: isNum(r.target) ? Math.max(1, Math.min(20, Math.round(r.target))) : 5,
    readings: readings.map((row) => {
      const out: Record<string, number> = {};
      if (row && typeof row === 'object') {
        for (const [k, v] of Object.entries(row as Record<string, unknown>).slice(0, 8)) if (/^\w{1,6}$/.test(k) && isNum(v)) out[k] = v;
      }
      return out;
    }),
    stats: { slope: numOrNull(stats.slope), r2: numOrNull(stats.r2), answer: numOrNull(stats.answer), pctError: numOrNull(stats.pctError), unit: word(stats.unit, 12) },
    issues: Array.isArray(r.issues) ? r.issues.filter((i): i is string => ISSUES.includes(i as string)).slice(0, 10) : [],
    issue: ISSUES.includes(r.issue as string) ? (r.issue as string) : 'none',
    reading: isNum(r.reading) ? Math.max(0, Math.min(20, Math.round(r.reading))) : 0,
    mark: mark && isNum(mark.got) && isNum(mark.max) ? { got: mark.got, max: mark.max } : null,
  };
}

/** Every number the model is allowed to repeat. */
export function allowedNumbers(ctx: PartnerContext): number[] {
  const out: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 90, 100, ctx.n, ctx.target, ctx.reading];
  for (const row of ctx.readings) out.push(...Object.values(row));
  for (const v of [ctx.stats.slope, ctx.stats.r2, ctx.stats.answer, ctx.stats.pctError]) if (v !== null) out.push(v);
  if (ctx.mark) out.push(ctx.mark.got, ctx.mark.max);
  return out;
}

/** Validate the model's reply. Returns null (use the rule-based fallback) on any doubt. */
export function validateSay(raw: unknown, ctx: PartnerContext): PartnerSay | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.say !== 'string') return null;
  const say = r.say.replace(/\s+/g, ' ').trim();
  if (say.length < 2 || say.length > 240) return null;
  if (/[<>{}\[\]]|https?:|www\./i.test(say)) return null;
  if (r.mark !== null && r.mark !== undefined) return null; // marks are never the model's to give
  const tip = typeof r.tip === 'string' && TIPS.includes(r.tip) ? r.tip : ISSUE_TIP[ctx.issue] ?? 'none';
  let highlight: string | null = null;
  if (typeof r.highlight === 'string') {
    const m = r.highlight.match(/^reading_(\d+)$/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= ctx.n) highlight = r.highlight;
  }
  const ok = allowedNumbers(ctx);
  for (const tok of say.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const v = Number(tok.replace(',', '.'));
    if (!ok.some((a) => Math.abs(a - v) <= Math.max(0.006, Math.abs(a) * 0.006) || Math.abs(Number(a.toFixed(1)) - v) < 1e-9 || Math.abs(Number(a.toFixed(2)) - v) < 1e-9 || Math.abs(Math.round(a) - v) < 1e-9)) return null;
  }
  return { say, highlight, tip, mark: null };
}

/** Pull the first JSON object out of a model reply (handles code fences and stray prose). */
export function parseModelJson(text: string): unknown {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
}

export const SYSTEM_PROMPT = `You are the lab partner in a school physics practical. The student is a teenager working at a lab bench.
Reply with ONE JSON object and nothing else: {"say": string, "highlight": string|null, "tip": string, "mark": null}

Rules:
- "say": at most 30 words, warm, plain and specific, written in the language named in "language". Speak as a classmate at the bench, not a teacher.
- Talk only about the issue code in "issue". If it is "none", give brief encouragement about progress.
- NEVER calculate. NEVER state a number unless that exact number appears in the context. Never give a mark, score or grade. "mark" is always null.
- "highlight": "reading_N" for the reading the issue is about (N from "reading"), otherwise null.
- "tip": exactly one of: ${TIPS.join(', ')}.
- Never ask for or mention names, ages, schools or any personal detail. No links, no emoji, no markdown.

What the issue codes mean:
late_start: the timing is short or long; the stopwatch was started or stopped at the wrong moment.
miscount: the time is about one whole swing out; they miscounted the swings.
large_angle: the swing was too big; keep it under about 10 degrees.
parallax: they read the protractor from the side instead of straight on.
pins_too_close: the two pins of a pair were close together, so the traced line is inaccurate.
misread_scale: a meter reading does not match the setting.
switch_open: the switch was open so no current flowed.
duplicate_reading: same setting as an earlier reading.
narrow_range: the readings are bunched over a small range.
too_few_readings: more readings are needed.
wrong_axis: the quantities are on the wrong axes of the graph.
unit_missing: the unit of the final answer is missing or wrong.
wrong_formula: the formula linking the slope to the answer is wrong.
outlier: one point is far from the line of best fit.`;

export function userPrompt(ctx: PartnerContext): string {
  return JSON.stringify({ language: LOCALE_NAMES[ctx.locale] ?? 'English', ...ctx });
}
