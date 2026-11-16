// POST /api/partner: structured context in, typed feedback out. Framework-free
// so the same handler runs on Vercel (api/partner.ts) and on the Node server.
//
// The upstream key has a small requests-per-minute quota, so the handler
//  - paces upstream calls to that quota (LLM_RPM, default 5) instead of collecting 429s, and
//  - remembers the model's wording per (practical, event, issue, language). A remembered line
//    is re-validated against the new context before it is reused, so it can never carry a
//    number from someone else's readings.
import { chat, llmConfigured, type LlmEnv } from './llm.ts';
import { SYSTEM_PROMPT, checkSay, parseModelJson, sanitizeContext, userPrompt, type PartnerContext, type PartnerSay } from '../../src/partner/schema.ts';

export interface PartnerResult { status: number; body: Record<string, unknown>; log: Record<string, unknown> }

const calls: number[] = []; // times of recent upstream calls
const phrases = new Map<string, { say: string; tip: string; at: number }[]>();
const PHRASE_TTL = 6 * 3600_000, VARIANTS = 4;
let turn = 0;

// The remembered wording survives restarts when PARTNER_STORE names a file. It holds model phrasing only.
const storePath = typeof process !== 'undefined' ? process.env?.PARTNER_STORE : undefined;
if (storePath) {
  try {
    const { readFileSync } = await import('node:fs');
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(storePath, 'utf8')))) phrases.set(k, v as { say: string; tip: string; at: number }[]);
  } catch { /* first run: nothing remembered yet */ }
}
function persist() {
  if (!storePath) return;
  void import('node:fs').then(({ writeFile }) => writeFile(storePath, JSON.stringify(Object.fromEntries(phrases)), () => {}));
}

const keyOf = (c: PartnerContext) => `${c.practical}|${c.event}|${c.issue}|${c.locale}`;

function recall(ctx: PartnerContext): PartnerSay | null {
  const list = (phrases.get(keyOf(ctx)) ?? []).filter((p) => Date.now() - p.at < PHRASE_TTL);
  for (let i = 0; i < list.length; i++) {
    const p = list[(turn + i) % list.length];
    const res = checkSay({ say: p.say, tip: p.tip, highlight: ctx.reading > 0 ? `reading_${ctx.reading}` : null, mark: null }, ctx);
    if (res.say) {
      turn++;
      return res.say;
    }
  }
  return null;
}

function remember(ctx: PartnerContext, say: PartnerSay) {
  const k = keyOf(ctx);
  const list = phrases.get(k) ?? [];
  // only wording with no numbers in it is reused: a line that names "reading 3" belongs to one student's table
  if (/\d/.test(say.say) || list.some((p) => p.say === say.say)) return;
  list.push({ say: say.say, tip: say.tip, at: Date.now() });
  phrases.set(k, list.slice(-VARIANTS));
  persist();
}

/** `log` holds only codes and timings (practical, event, issue, outcome, ms): never readings or text. */
export async function handlePartner(raw: unknown, env: LlmEnv & { LLM_RPM?: string; PARTNER_ATTEMPTS?: string }): Promise<PartnerResult> {
  const t0 = Date.now();
  const ctx = sanitizeContext(raw);
  if (!ctx) return { status: 400, body: { error: 'bad_request' }, log: { outcome: 'bad_request', ms: 0 } };
  const base = { practical: ctx.practical, event: ctx.event, issue: ctx.issue, locale: ctx.locale, n: ctx.n };
  if (!llmConfigured(env)) return { status: 501, body: { error: 'no_llm' }, log: { ...base, outcome: 'no_llm', ms: 0 } };
  const done = (say: PartnerSay, outcome: string, attempts: number): PartnerResult => ({ status: 200, body: { ...say }, log: { ...base, outcome, attempts, ms: Date.now() - t0 } });

  const rpm = Number(env.LLM_RPM ?? 5);
  const variants = (phrases.get(keyOf(ctx)) ?? []).length;
  while (calls.length && t0 - calls[0] > 60_000) calls.shift();
  const quotaLeft = rpm - calls.length;
  // Enough wording on file, or no quota left this minute: answer from what the model said before.
  // Quota goes first to issues the model has never worded; the last two calls of each minute are kept for those.
  if (variants >= VARIANTS || quotaLeft <= 0 || (variants > 0 && quotaLeft <= 2)) {
    const kept = recall(ctx);
    if (kept) return done(kept, 'ok_remembered', 0);
    if (quotaLeft <= 0) return { status: 503, body: { error: 'upstream_quota', reason: 'upstream_quota' }, log: { ...base, outcome: 'upstream_quota', attempts: 0, ms: Date.now() - t0 } };
  }

  let attempts = 0, reason = '';
  const maxAttempts = Math.min(Number(env.PARTNER_ATTEMPTS ?? 2), quotaLeft);
  while (attempts < maxAttempts && Date.now() - t0 < 1500) {
    attempts++;
    calls.push(Date.now());
    try {
      const text = await chat([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(ctx) }], env, Math.max(500, 2300 - (Date.now() - t0)));
      const res = checkSay(parseModelJson(text), ctx);
      if (res.say) {
        remember(ctx, res.say);
        return done(res.say, 'ok', attempts);
      }
      reason = 'schema:' + res.reason;
    } catch (e) {
      reason = (e as Error).name === 'AbortError' ? 'timeout' : 'llm:' + (e as Error).message.slice(0, 40);
      if (reason !== 'schema') break; // a timeout or upstream error will not be cured by asking again at once
    }
  }
  const kept = recall(ctx);
  if (kept) return done(kept, 'ok_remembered_after_' + reason.split(':')[0], attempts);
  return { status: reason === 'timeout' ? 504 : 502, body: { error: reason.split(':')[0], reason }, log: { ...base, outcome: reason, attempts, ms: Date.now() - t0 } };
}
