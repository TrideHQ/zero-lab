// Deterministic marking. Every number on the mark sheet comes from here;
// the AI lab partner never sets or changes a mark.
import type { Rubric, Text } from '../types.ts';

export interface Stats {
  n: number;
  target: number;
  /** Mean reading quality 0..1 (1 = every reading inside tolerance). */
  quality: number;
  /** Fraction of the sensible range the readings span, 0..1. */
  rangeFrac: number;
  duplicates: number;
  axesCorrect: boolean;
  axesChosen: boolean;
  r2: number;
  formulaCorrect: boolean;
  unitCorrect: boolean;
  /** |answer - accepted| / accepted, or Infinity when there is no answer. */
  answerError: number;
  tolAnswer: number;
  precautionsRight: number;
  precautionsWrong: number;
  conclusionCorrect: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Each function returns the fraction of a criterion earned, 0..1. */
export const SCORE: Record<string, (s: Stats) => number> = {
  procedure: (s) => clamp01(s.n / s.target),
  readings: (s) => clamp01(s.quality * Math.min(1, s.n / s.target)),
  range: (s) => (s.n < 2 ? 0 : clamp01(s.rangeFrac / 0.6)),
  table: (s) => clamp01((s.n - s.duplicates) / s.target),
  graph: (s) => (s.n < 3 || !s.axesChosen ? 0 : (s.axesCorrect ? 0.5 : 0) + 0.5 * clamp01((s.r2 - 0.8) / 0.18)),
  calculation: (s) => (s.formulaCorrect ? 0.4 : 0) + (s.unitCorrect ? 0.2 : 0) + 0.4 * clamp01(1 - (s.answerError / s.tolAnswer - 1) / 2),
  precautions: (s) => clamp01((s.precautionsRight - s.precautionsWrong) / 2),
  conclusion: (s) => (s.conclusionCorrect ? 1 : 0),
};

export interface MarkRow { id: string; label: Text; max: number; got: number; met: boolean; fraction: number }
export interface MarkSheet { rubric: string; name: Text; type: Rubric['type']; rows: MarkRow[]; total: number; max: number }

export function mark(rubricId: string, rubric: Rubric, stats: Stats): MarkSheet {
  const rows = rubric.criteria.map((c): MarkRow => {
    const parts = c.score.map((id) => (SCORE[id] ? SCORE[id](stats) : 0));
    const fraction = parts.reduce((a, b) => a + b, 0) / (parts.length || 1);
    let got: number;
    if (rubric.type === 'competency') got = fraction >= (rubric.threshold ?? 0.7) ? 1 : 0;
    else if (rubric.type === 'percent') got = Math.round(fraction * c.max);
    else got = Math.round(fraction * c.max * 2) / 2; // marks in halves
    return { id: c.id, label: c.label, max: c.max, got, met: fraction >= (rubric.threshold ?? 0.7), fraction };
  });
  return { rubric: rubricId, name: rubric.name, type: rubric.type, rows, total: rows.reduce((a, r) => a + r.got, 0), max: rubric.total };
}
