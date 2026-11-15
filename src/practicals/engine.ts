// Practical engine: holds the student's readings, derives the table, fits the
// graph, detects issues and produces the stats the mark sheet is computed from.
// No DOM and no 3D in here, so it runs the same in the browser, tests and scripts.
import type { Practical } from '../types.ts';
import { leastSquares, outlier, type Fit } from './fit.ts';
import { LOGIC, applyFormula, type Logic, type Meta, type Values } from './modules/logic.ts';
import type { Stats } from './marks.ts';
import type { PartnerContext } from '../partner/schema.ts';

export interface Row { values: Values; meta: Meta; issues: string[]; quality: number }
export interface Analysis { x: string; y: string; formula: string; unit: string; precautions: string[]; conclusion: number }

export class PracticalEngine {
  readonly practical: Practical;
  readonly variant: string;
  readonly accepted: number;
  readonly logic: Logic;
  rows: Row[] = [];
  phase: 'readings' | 'analysis' | 'done' = 'readings';
  analysis: Analysis = { x: '', y: '', formula: '', unit: '', precautions: [], conclusion: -1 };

  constructor(practical: Practical, variant?: string) {
    this.practical = practical;
    this.variant = variant && practical.variants[variant] ? variant : Object.keys(practical.variants)[0];
    this.accepted = practical.variants[this.variant].accepted;
    this.logic = LOGIC[practical.slug];
    if (!this.logic) throw new Error(`No logic for practical ${practical.slug}`);
  }

  get target(): number {
    return this.practical.readings.target;
  }

  /** Record one reading exactly as the student took it. */
  add(measured: Values, meta: Meta = {}): Row {
    const p = this.practical;
    const truth = this.logic.truth(measured, meta, this.accepted, p);
    const issues = this.logic.issues(measured, truth, meta, p);
    const ind = this.logic.independent;
    const span = this.logic.range[1] - this.logic.range[0];
    if (this.rows.some((r) => Math.abs(r.values[ind] - measured[ind]) < span * 0.02)) issues.push('duplicate_reading');
    const err = this.logic.error(measured, truth);
    const quality = Math.min(1, Math.max(0, 1 - (err / p.tolerance.reading - 1) / 2));
    const row: Row = { values: { ...measured, ...this.logic.derive(measured, p) }, meta, issues, quality };
    this.rows.push(row);
    return row;
  }

  removeLast() {
    this.rows.pop();
  }

  column(id: string): number[] {
    return this.rows.map((r) => r.values[id]);
  }

  /** Best-fit line for the axes the student chose (or the given ones). */
  fit(x = this.analysis.x, y = this.analysis.y): Fit | null {
    if (!x || !y || x === y) return null;
    return leastSquares(this.column(x), this.column(y));
  }

  axesCorrect(): boolean {
    return this.analysis.x === this.practical.graph.x && this.analysis.y === this.practical.graph.y;
  }

  /** The student's final value: their chosen formula applied to the slope of their own graph. */
  answer(): number {
    const f = this.fit();
    const opt = this.practical.formula.options.find((o) => o.id === this.analysis.formula);
    if (!f || !opt) return NaN;
    return applyFormula(opt.calc, f.slope);
  }

  pctError(): number {
    const a = this.answer();
    return Number.isFinite(a) ? (Math.abs(a - this.accepted) / this.accepted) * 100 : Infinity;
  }

  rangeFrac(): number {
    const xs = this.column(this.logic.independent);
    if (xs.length < 2) return 0;
    return Math.min(1, (Math.max(...xs) - Math.min(...xs)) / (this.logic.range[1] - this.logic.range[0]));
  }

  /** Issues about the experiment as a whole (as opposed to one reading). */
  globalIssues(): string[] {
    const out: string[] = [];
    const a = this.analysis, p = this.practical;
    if (this.rows.length < this.target) out.push('too_few_readings');
    if (this.rows.length >= 3 && this.rangeFrac() < 0.5) out.push('narrow_range');
    if (this.phase !== 'readings') {
      if (a.x && a.y && !this.axesCorrect()) out.push('wrong_axis');
      if (a.formula && !p.formula.options.find((o) => o.id === a.formula)?.correct) out.push('wrong_formula');
      if (a.unit !== p.expected.unit && (a.unit || this.phase === 'done')) out.push('unit_missing');
      const f = this.fit(p.graph.x, p.graph.y);
      if (f && outlier(this.column(p.graph.x), this.column(p.graph.y), f) >= 0) out.push('outlier');
    }
    return out;
  }

  /** 1-based index of the reading that sits furthest off the expected line, or 0. */
  outlierIndex(): number {
    const p = this.practical;
    const f = this.fit(p.graph.x, p.graph.y);
    return f ? outlier(this.column(p.graph.x), this.column(p.graph.y), f) + 1 : 0;
  }

  stats(): Stats {
    const p = this.practical, a = this.analysis;
    const f = this.fit();
    const picked = p.precautions.filter((x) => a.precautions.includes(x.id));
    return {
      n: this.rows.length,
      target: this.target,
      quality: this.rows.length ? this.rows.reduce((s, r) => s + r.quality, 0) / this.rows.length : 0,
      rangeFrac: this.rangeFrac(),
      duplicates: this.rows.filter((r) => r.issues.includes('duplicate_reading')).length,
      axesCorrect: this.axesCorrect(),
      axesChosen: !!(a.x && a.y),
      r2: f?.r2 ?? 0,
      formulaCorrect: !!p.formula.options.find((o) => o.id === a.formula)?.correct,
      unitCorrect: a.unit === p.expected.unit,
      answerError: this.pctError() / 100,
      tolAnswer: p.tolerance.answer,
      precautionsRight: picked.filter((x) => x.correct).length,
      precautionsWrong: picked.filter((x) => !x.correct).length,
      conclusionCorrect: !!p.conclusions[a.conclusion]?.correct,
    };
  }

  /** What the lab partner is told. Numbers only: no names, no free text from the student. */
  context(event: PartnerContext['event'], board: string, locale: string, issue = 'none', reading = 0, mark: { got: number; max: number } | null = null): PartnerContext {
    const f = this.fit();
    const ans = this.answer();
    const round = (v: number, dp = 3) => Number(v.toFixed(dp));
    return {
      practical: this.practical.slug,
      variant: this.variant,
      board,
      locale,
      event,
      n: this.rows.length,
      target: this.target,
      readings: this.rows.map((r) => Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, round(v)]))),
      stats: {
        slope: f ? round(f.slope) : null,
        r2: f ? round(f.r2) : null,
        answer: Number.isFinite(ans) ? round(ans) : null,
        pctError: Number.isFinite(this.pctError()) ? round(this.pctError(), 1) : null,
        unit: this.analysis.unit,
      },
      issues: [...new Set([...this.rows.flatMap((r) => r.issues), ...this.globalIssues()])],
      issue,
      reading,
      mark,
    };
  }
}
