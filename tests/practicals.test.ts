import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leastSquares, outlier, ticks } from '../src/practicals/fit.ts';
import { PracticalEngine } from '../src/practicals/engine.ts';
import { mark } from '../src/practicals/marks.ts';
import { pendulumPeriod, refractAngle, applyFormula } from '../src/practicals/modules/logic.ts';
import { tracePins, readAngles, parallax } from '../src/practicals/protractor.ts';
import type { Practical, RubricFile } from '../src/types.ts';

const load = (f: string) => JSON.parse(readFileSync(new URL(`../practicals/${f}`, import.meta.url), 'utf8'));
const rubrics: RubricFile = load('rubric.json');
const P = (slug: string): Practical => load(`${slug}.json`);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('least squares recovers a known line', () => {
  const f = leastSquares([1, 2, 3, 4], [5, 7, 9, 11])!;
  assert.ok(Math.abs(f.slope - 2) < 1e-12);
  assert.ok(Math.abs(f.intercept - 3) < 1e-12);
  assert.ok(Math.abs(f.r2 - 1) < 1e-12);
  assert.equal(leastSquares([1], [1]), null);
  assert.equal(leastSquares([2, 2, 2], [1, 2, 3]), null);
});

test('outlier finds the stray point and nice ticks cover the range', () => {
  const xs = [1, 2, 3, 4, 5, 6], ys = [2, 4, 6, 12, 10, 12];
  assert.equal(outlier(xs, ys, leastSquares(xs, ys)!), 3);
  assert.equal(outlier([1, 2, 3, 4], [2, 4, 6, 8], leastSquares([1, 2, 3, 4], [2, 4, 6, 8])!), -1);
  const tk = ticks(0, 0.93);
  assert.equal(tk[0], 0);
  assert.ok(tk[tk.length - 1] >= 0.93);
});

function pendulumRun(variant: 'earth' | 'moon', seed = 1) {
  const p = P('pendulum-g');
  const e = new PracticalEngine(p, variant);
  const r = rng(seed);
  for (const L of [0.3, 0.45, 0.6, 0.8, 1.0]) {
    const reaction = (0.1 + r() * 0.2) - (0.1 + r() * 0.2); // late start, late stop: 0.1 to 0.3 s each
    e.add({ L, t: Math.round((20 * pendulumPeriod(L, e.accepted, 8) + reaction) * 100) / 100 }, { amp: 8 });
  }
  e.phase = 'analysis';
  e.analysis = { x: 'L', y: 'T2', formula: 'a', unit: 'm/s²', precautions: ['small_angle', 'count_zero'], conclusion: 0 };
  return e;
}

test('pendulum: simulated readings give g within tolerance on Earth and on the Moon', () => {
  for (const [variant, g] of [['earth', 9.81], ['moon', 1.62]] as const) {
    for (let seed = 1; seed <= 20; seed++) {
      const e = pendulumRun(variant, seed);
      assert.ok(Math.abs(e.answer() - g) / g < e.practical.tolerance.answer, `${variant} seed ${seed}: g = ${e.answer()}`);
      assert.deepEqual(e.rows.flatMap((r) => r.issues), []);
    }
  }
});

test('pendulum: a miscounted swing, a late start and a big swing are flagged', () => {
  const p = P('pendulum-g');
  const e = new PracticalEngine(p, 'earth');
  const T = pendulumPeriod(0.6, 9.81, 8);
  assert.deepEqual(e.add({ L: 0.6, t: 19 * T }, { amp: 8 }).issues, ['miscount']);
  assert.deepEqual(e.add({ L: 0.8, t: 20 * pendulumPeriod(0.8, 9.81, 8) - 1.3 * 0.5 * pendulumPeriod(0.8, 9.81, 8) }, { amp: 8 }).issues, ['late_start']);
  assert.deepEqual(e.add({ L: 0.4, t: 20 * pendulumPeriod(0.4, 9.81, 40) }, { amp: 40 }).issues, ['large_angle']);
  assert.ok(e.add({ L: 0.4, t: 20 * pendulumPeriod(0.4, 9.81, 5) }, { amp: 5 }).issues.includes('duplicate_reading'));
});

test('refraction: pins traced with human error give n within tolerance; parallax is flagged', () => {
  const p = P('refraction-glass-block');
  const top = 1.05, bottom = 0.45;
  for (let seed = 1; seed <= 20; seed++) {
    const e = new PracticalEngine(p);
    const r = rng(seed);
    const jit = () => (r() - 0.5) * 0.012; // a few millimetres of pin placement error
    for (const iDeg of [20, 30, 40, 50, 60]) {
      const i = (iDeg * Math.PI) / 180, rr = (refractAngle(iDeg, 1.52) * Math.PI) / 180;
      const ex = -0.3, xx = ex + Math.tan(rr) * (top - bottom);
      const above = [0.25, 0.65].map((d) => ({ x: ex - Math.sin(i) * d + jit(), y: top + Math.cos(i) * d + jit() }));
      const below = [0.15, 0.5].map((d) => ({ x: xx + Math.sin(i) * d + jit(), y: bottom - Math.cos(i) * d + jit() }));
      const tr = tracePins(above, below, top, bottom)!;
      const a = readAngles(tr, 0.05, 1);
      e.add({ i: a.i, r: a.r }, { oblique: 0.05, pinGap: tr.pinGap, trueI: iDeg });
    }
    e.phase = 'analysis';
    e.analysis = { x: 'sinr', y: 'sini', formula: 'a', unit: '(no unit)', precautions: ['eye_level', 'pins_apart'], conclusion: 0 };
    assert.ok(Math.abs(e.answer() - 1.52) / 1.52 < p.tolerance.answer, `seed ${seed}: n = ${e.answer()}`);
  }
  const e = new PracticalEngine(p);
  assert.ok(parallax(0.05) === 0 && parallax(0.8) > 2);
  const bad = e.add({ i: 43.5, r: 23 }, { oblique: 0.8, pinGap: 0.4, trueI: 40 });
  assert.deepEqual(bad.issues, ['parallax']);
  assert.ok(e.add({ i: 30, r: 19 }, { oblique: 0.05, pinGap: 0.08, trueI: 30 }).issues.includes('pins_too_close'));
});

test("Ohm's law: meter readings give R within tolerance; an open switch is flagged", async () => {
  const { solve, RES } = await import('../src/templates/circuit-board/index.ts');
  const p = P('ohms-law');
  const e = new PracticalEngine(p);
  for (const rheo of [0.95, 0.7, 0.5, 0.32, 0.16, 0.04]) {
    const s = solve('ohm', true, 6, 4.7, 0, rheo);
    const V = Math.round((s.V * 1.006) / RES.V) * RES.V, I = Math.round((s.I * 0.995) / RES.I) * RES.I;
    e.add({ V, I }, { switchOn: true, trueV: s.V, trueI: s.I });
  }
  e.phase = 'analysis';
  e.analysis = { x: 'I', y: 'V', formula: 'a', unit: 'Ω', precautions: ['open_switch', 'tight'], conclusion: 0 };
  assert.ok(Math.abs(e.answer() - 4.7) / 4.7 < p.tolerance.answer, `R = ${e.answer()}`);
  assert.deepEqual(new PracticalEngine(p).add({ V: 0, I: 0 }, { switchOn: false, trueV: 0, trueI: 0 }).issues, ['switch_open']);
});

test('marks are deterministic and the rubric changes with the board', () => {
  const e = pendulumRun('earth', 3);
  const sheets = Object.keys(rubrics.rubrics).map((id) => mark(id, rubrics.rubrics[id], e.stats()));
  const again = Object.keys(rubrics.rubrics).map((id) => mark(id, rubrics.rubrics[id], pendulumRun('earth', 3).stats()));
  assert.deepEqual(sheets, again);
  const by = Object.fromEntries(sheets.map((s) => [s.rubric, s]));
  assert.equal(by.generic.total, 100);
  assert.equal(by.waec.total, 20);
  assert.equal(by.waec.max, 20);
  assert.equal(by['igcse-atp'].total, 12);
  assert.equal(by['alevel-cpac'].total, 5);
  assert.equal(by['ap-lab'].total, 16);
  for (const s of sheets) assert.equal(s.rows.reduce((a, r) => a + r.max, 0), s.max, `${s.rubric} criteria add up`);
});

test('careless work loses marks in the right places', () => {
  const e = pendulumRun('earth', 3);
  // (formula 'b' with these swapped axes would, by luck, still give g; 'c' does not)
  e.analysis = { x: 'T2', y: 'L', formula: 'c', unit: '', precautions: ['big_push', 'one_swing'], conclusion: 1 };
  const s = mark('waec', rubrics.rubrics.waec, e.stats());
  const row = (id: string) => s.rows.find((r) => r.id === id)!;
  assert.equal(row('precautions').got, 0);
  assert.equal(row('conclusion').got, 0);
  assert.ok(row('graph').got < row('graph').max);
  assert.equal(row('calculation').got, 0);
  assert.ok(row('readings').got === row('readings').max);
  assert.deepEqual(e.globalIssues().sort(), ['unit_missing', 'wrong_axis', 'wrong_formula']);
  assert.ok(Number.isNaN(applyFormula('none', 2)));
});
