// Calls the live lab-partner API N times with realistic contexts and reports
// how often the client would have fallen back to the rules, and why.
//   BASE=https://managerx.xyz node scripts/partner-bench.mjs [30]
const base = process.env.BASE ?? 'http://127.0.0.1:8011';
const N = Number(process.argv[2] ?? 30);
const pend = [{ L: 0.3, t: 21.98, T: 1.099, T2: 1.208 }, { L: 0.45, t: 26.9, T: 1.345, T2: 1.809 }, { L: 0.6, t: 31.1, T: 1.555, T2: 2.418 }, { L: 0.8, t: 34.1, T: 1.705, T2: 2.907 }, { L: 1, t: 40.2, T: 2.01, T2: 4.04 }];
const refr = [{ i: 15, r: 10, sini: 0.259, sinr: 0.174 }, { i: 29.5, r: 20, sini: 0.492, sinr: 0.342 }, { i: 43.5, r: 23, sini: 0.688, sinr: 0.391 }, { i: 55, r: 32.5, sini: 0.819, sinr: 0.537 }, { i: 70, r: 38.5, sini: 0.94, sinr: 0.623 }];
const ohm = [{ V: 0, I: 0 }, { V: 1.5, I: 0.32 }, { V: 1.9, I: 0.4 }, { V: 2.6, I: 0.54 }, { V: 3.6, I: 0.76 }, { V: 5.1, I: 1.08 }];
const none = { slope: null, r2: null, answer: null, pctError: null, unit: '' };
const mk = (practical, event, readings, n, issue, reading, stats = none, mark = null, target = 5) => ({ practical, variant: '', board: 'waec', locale: 'en', event, n, target, readings: readings.slice(0, n), stats, issues: issue === 'none' ? [] : [issue], issue, reading, mark });
const cases = [
  mk('pendulum-g', 'reading', pend, 1, 'none', 0), mk('pendulum-g', 'reading', pend, 4, 'miscount', 4), mk('pendulum-g', 'reading', pend, 3, 'large_angle', 3),
  mk('pendulum-g', 'reading', pend, 5, 'none', 0), mk('pendulum-g', 'reading', pend, 2, 'late_start', 2),
  mk('pendulum-g', 'final', pend, 5, 'none', 0, { slope: 4.02, r2: 0.998, answer: 9.82, pctError: 0.1, unit: 'm/s²' }, { got: 20, max: 20 }),
  mk('pendulum-g', 'final', pend, 5, 'outlier', 4, { slope: 3.71, r2: 0.96, answer: 10.64, pctError: 8.5, unit: 'm/s²' }, { got: 15.5, max: 20 }),
  mk('refraction-glass-block', 'reading', refr, 3, 'parallax', 3), mk('refraction-glass-block', 'reading', refr, 2, 'pins_too_close', 2), mk('refraction-glass-block', 'reading', refr, 4, 'none', 0),
  mk('refraction-glass-block', 'final', refr, 5, 'unit_missing', 0, { slope: 1.539, r2: 0.998, answer: 1.539, pctError: 1.3, unit: '°' }, { got: 88, max: 100 }),
  mk('refraction-glass-block', 'final', refr, 5, 'wrong_axis', 0, { slope: 0.648, r2: 0.998, answer: 0.648, pctError: 57.4, unit: '(no unit)' }, { got: 3, max: 5 }),
  mk('ohms-law', 'reading', ohm, 1, 'switch_open', 1, none, null, 6), mk('ohms-law', 'reading', ohm, 3, 'duplicate_reading', 3, none, null, 6), mk('ohms-law', 'reading', ohm, 6, 'none', 0, none, null, 6),
  mk('ohms-law', 'final', ohm.slice(1), 5, 'none', 0, { slope: 4.748, r2: 0.999, answer: 4.748, pctError: 1, unit: 'Ω' }, { got: 12, max: 12 }, 6),
];
// only the calls the app really makes: a reading with an issue, or the final comment
const sent = cases.filter((c) => c.event === 'final' || c.issue !== 'none');
const out = [];
for (let k = 0; k < N; k++) {
  const ctx = sent[k % sent.length];
  const t0 = Date.now();
  let status = 0, body = {};
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2500); // the same budget the app gives it
    const r = await fetch(base + '/api/partner', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ctx), signal: ac.signal });
    clearTimeout(timer);
    status = r.status;
    body = await r.json();
  } catch (e) {
    body = { reason: 'client_timeout' };
  }
  out.push({ k, event: ctx.event, issue: ctx.issue, status, ms: Date.now() - t0, reason: status === 200 ? 'ok' : body.reason ?? body.error, say: body.say });
  await new Promise((r) => setTimeout(r, Number(process.env.GAP ?? 2000)));
}
const ok = out.filter((o) => o.status === 200);
const ms = ok.map((o) => o.ms).sort((a, b) => a - b);
const reasons = {};
for (const o of out) reasons[o.reason] = (reasons[o.reason] ?? 0) + 1;
console.log(JSON.stringify({ calls: N, ai: ok.length, fallback: N - ok.length, fallbackRate: `${(((N - ok.length) / N) * 100).toFixed(1)}%`, reasons, latencyMs: { median: ms[Math.floor(ms.length / 2)], p90: ms[Math.floor(ms.length * 0.9)], max: ms[ms.length - 1] } }, null, 1));
for (const o of out.filter((o) => o.status !== 200)) console.log('  fallback:', o.event, o.issue, o.status, o.reason, o.ms + 'ms');
console.log('  samples:', ok.slice(0, 3).map((o) => `[${o.event}/${o.issue}] ${o.say}`).join('\n           '));
