// server/api/llm.ts
var llmConfigured = (env) => !!env.LLM_API_KEY;
async function chat(messages, env, timeoutMs = 2200, maxTokens = 260) {
  if (!env.LLM_API_KEY) throw new Error("LLM_API_KEY is not set");
  const base = (env.LLM_BASE_URL ?? "https://api.cerebras.ai/v1").replace(/\/$/, "");
  const model = env.LLM_MODEL ?? "gpt-oss-120b";
  const call = async (extra) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.LLM_API_KEY}` },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_completion_tokens: maxTokens, ...extra }),
        signal: ac.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };
  let r = await call({ reasoning_effort: "low" });
  if (r.status === 400 || r.status === 422) r = await call({});
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

// src/partner/schema.ts
var ISSUES = [
  "late_start",
  "miscount",
  "large_angle",
  "parallax",
  "pins_too_close",
  "misread_scale",
  "switch_open",
  "duplicate_reading",
  "narrow_range",
  "too_few_readings",
  "wrong_axis",
  "unit_missing",
  "wrong_formula",
  "outlier",
  "none"
];
var TIPS = [
  "count_from_zero",
  "small_angle",
  "eye_level",
  "space_pins",
  "read_nearest_division",
  "close_switch",
  "change_setting",
  "spread_readings",
  "take_more_readings",
  "swap_axes",
  "add_unit",
  "check_formula",
  "repeat_reading",
  "keep_going",
  "none"
];
var ISSUE_TIP = {
  late_start: "count_from_zero",
  miscount: "count_from_zero",
  large_angle: "small_angle",
  parallax: "eye_level",
  pins_too_close: "space_pins",
  misread_scale: "read_nearest_division",
  switch_open: "close_switch",
  duplicate_reading: "change_setting",
  narrow_range: "spread_readings",
  too_few_readings: "take_more_readings",
  wrong_axis: "swap_axes",
  unit_missing: "add_unit",
  wrong_formula: "check_formula",
  outlier: "repeat_reading",
  none: "keep_going"
};
var PRACTICALS = ["pendulum-g", "refraction-glass-block", "ohms-law"];
var EVENTS = ["hello", "reading", "analysis", "final"];
var LOCALE_NAMES = { en: "English", fr: "French", es: "Spanish", pt: "Portuguese", ar: "Arabic", hi: "Hindi", sw: "Swahili", zh: "Chinese" };
var isNum = (v) => typeof v === "number" && Number.isFinite(v);
var numOrNull = (v) => isNum(v) ? v : null;
var word = (v, max = 40) => typeof v === "string" && /^[\w\-()\/²°Ω ]{0,40}$/.test(v) ? v.slice(0, max) : "";
function sanitizeContext(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  if (!PRACTICALS.includes(r.practical) || !EVENTS.includes(r.event)) return null;
  const readings = Array.isArray(r.readings) ? r.readings.slice(0, 12) : [];
  const stats = r.stats && typeof r.stats === "object" ? r.stats : {};
  const mark = r.mark && typeof r.mark === "object" ? r.mark : null;
  return {
    practical: r.practical,
    variant: word(r.variant, 20),
    board: word(r.board, 20),
    locale: typeof r.locale === "string" && r.locale in LOCALE_NAMES ? r.locale : "en",
    event: r.event,
    n: isNum(r.n) ? Math.max(0, Math.min(20, Math.round(r.n))) : 0,
    target: isNum(r.target) ? Math.max(1, Math.min(20, Math.round(r.target))) : 5,
    readings: readings.map((row) => {
      const out = {};
      if (row && typeof row === "object") {
        for (const [k, v] of Object.entries(row).slice(0, 8)) if (/^\w{1,6}$/.test(k) && isNum(v)) out[k] = v;
      }
      return out;
    }),
    stats: { slope: numOrNull(stats.slope), r2: numOrNull(stats.r2), answer: numOrNull(stats.answer), pctError: numOrNull(stats.pctError), unit: word(stats.unit, 12) },
    issues: Array.isArray(r.issues) ? r.issues.filter((i) => ISSUES.includes(i)).slice(0, 10) : [],
    issue: ISSUES.includes(r.issue) ? r.issue : "none",
    reading: isNum(r.reading) ? Math.max(0, Math.min(20, Math.round(r.reading))) : 0,
    mark: mark && isNum(mark.got) && isNum(mark.max) ? { got: mark.got, max: mark.max } : null
  };
}
function allowedNumbers(ctx) {
  const out = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 90, 100, ctx.n, ctx.target, ctx.reading];
  for (const row of ctx.readings) out.push(...Object.values(row));
  for (const v of [ctx.stats.slope, ctx.stats.r2, ctx.stats.answer, ctx.stats.pctError]) if (v !== null) out.push(v);
  if (ctx.mark) out.push(ctx.mark.got, ctx.mark.max);
  return out;
}
function checkSay(raw, ctx) {
  const no = (reason) => ({ say: null, reason });
  if (!raw || typeof raw !== "object") return no("not_json");
  const r = raw;
  if (typeof r.say !== "string") return no("no_say");
  const say = r.say.replace(/\s+/g, " ").trim();
  if (say.length < 2) return no("empty");
  if (say.length > 240) return no("too_long");
  if (/[<>{}\[\]]|https?:|www\./i.test(say)) return no("markup");
  if (/\b\d+(?:\.\d+)?\s*(?:\/|out of|of)\s*\d+\b|\b\d+\s*%/.test(say) && ctx.event === "final") return no("quotes_mark");
  const tip = typeof r.tip === "string" && TIPS.includes(r.tip) ? r.tip : ISSUE_TIP[ctx.issue] ?? "none";
  let highlight = null;
  if (typeof r.highlight === "string") {
    const m = r.highlight.match(/^reading_(\d+)$/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= ctx.n) highlight = r.highlight;
  }
  const ok = allowedNumbers(ctx);
  for (const tok of say.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const v = Number(tok.replace(",", "."));
    if (!ok.some((a) => Math.abs(a - v) <= Math.max(6e-3, Math.abs(a) * 6e-3) || Math.abs(Number(a.toFixed(1)) - v) < 1e-9 || Math.abs(Number(a.toFixed(2)) - v) < 1e-9 || Math.abs(Math.round(a) - v) < 1e-9)) return no("number_not_in_context");
  }
  return { say: { say, highlight, tip, mark: null }, reason: "ok" };
}
function parseModelJson(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    return null;
  }
}
var SYSTEM_PROMPT = `You are the lab partner in a school physics practical. The student is a teenager working at a lab bench.
Reply with ONE JSON object and nothing else: {"say": string, "highlight": string|null, "tip": string, "mark": null}

Rules:
- "say": at most 30 words, warm, plain and specific, written in the language named in "language". Speak as a classmate at the bench, not a teacher.
- Talk only about the issue code in "issue". If it is "none", give brief encouragement about progress.
- NEVER calculate. NEVER state a number unless that exact number appears in the context. Never give a mark, score or grade. "mark" is always null.
- "highlight": "reading_N" for the reading the issue is about (N from "reading"), otherwise null.
- "tip": exactly one of: ${TIPS.join(", ")}.
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
function userPrompt(ctx) {
  return JSON.stringify({ language: LOCALE_NAMES[ctx.locale] ?? "English", ...ctx });
}

// server/api/partner-core.ts
var calls = [];
var phrases = /* @__PURE__ */ new Map();
var PHRASE_TTL = 6 * 36e5;
var VARIANTS = 4;
var turn = 0;
var storePath = typeof process !== "undefined" ? process.env?.PARTNER_STORE : void 0;
if (storePath) {
  try {
    const { readFileSync } = await import("node:fs");
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(storePath, "utf8")))) phrases.set(k, v);
  } catch {
  }
}
function persist() {
  if (!storePath) return;
  void import("node:fs").then(({ writeFile }) => writeFile(storePath, JSON.stringify(Object.fromEntries(phrases)), () => {
  }));
}
var keyOf = (c) => `${c.practical}|${c.event}|${c.issue}|${c.locale}`;
function recall(ctx) {
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
function remember(ctx, say) {
  const k = keyOf(ctx);
  const list = phrases.get(k) ?? [];
  if (/\d/.test(say.say) || list.some((p) => p.say === say.say)) return;
  list.push({ say: say.say, tip: say.tip, at: Date.now() });
  phrases.set(k, list.slice(-VARIANTS));
  persist();
}
async function handlePartner(raw, env) {
  const t0 = Date.now();
  const ctx = sanitizeContext(raw);
  if (!ctx) return { status: 400, body: { error: "bad_request" }, log: { outcome: "bad_request", ms: 0 } };
  const base = { practical: ctx.practical, event: ctx.event, issue: ctx.issue, locale: ctx.locale, n: ctx.n };
  if (!llmConfigured(env)) return { status: 501, body: { error: "no_llm" }, log: { ...base, outcome: "no_llm", ms: 0 } };
  const done = (say, outcome, attempts2) => ({ status: 200, body: { ...say }, log: { ...base, outcome, attempts: attempts2, ms: Date.now() - t0 } });
  const rpm = Number(env.LLM_RPM ?? 5);
  const variants = (phrases.get(keyOf(ctx)) ?? []).length;
  while (calls.length && t0 - calls[0] > 6e4) calls.shift();
  const quotaLeft = rpm - calls.length;
  if (variants >= VARIANTS || quotaLeft <= 0 || variants > 0 && quotaLeft <= 2) {
    const kept2 = recall(ctx);
    if (kept2) return done(kept2, "ok_remembered", 0);
    if (quotaLeft <= 0) return { status: 503, body: { error: "upstream_quota", reason: "upstream_quota" }, log: { ...base, outcome: "upstream_quota", attempts: 0, ms: Date.now() - t0 } };
  }
  let attempts = 0, reason = "";
  const maxAttempts = Math.min(Number(env.PARTNER_ATTEMPTS ?? 2), quotaLeft);
  while (attempts < maxAttempts && Date.now() - t0 < 1500) {
    attempts++;
    calls.push(Date.now());
    try {
      const text = await chat([{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt(ctx) }], env, Math.max(500, 2300 - (Date.now() - t0)));
      const res = checkSay(parseModelJson(text), ctx);
      if (res.say) {
        remember(ctx, res.say);
        return done(res.say, "ok", attempts);
      }
      reason = "schema:" + res.reason;
    } catch (e) {
      reason = e.name === "AbortError" ? "timeout" : "llm:" + e.message.slice(0, 40);
      if (reason !== "schema") break;
    }
  }
  const kept = recall(ctx);
  if (kept) return done(kept, "ok_remembered_after_" + reason.split(":")[0], attempts);
  return { status: reason === "timeout" ? 504 : 502, body: { error: reason.split(":")[0], reason }, log: { ...base, outcome: reason, attempts, ms: Date.now() - t0 } };
}

// server/api/partner.ts
async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const out = await handlePartner(body, process.env);
  res.status(out.status).json(out.body);
}
export {
  handler as default
};
