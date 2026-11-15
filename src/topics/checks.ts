// Quick checks at the end of a topic: multiple choice, or "point at" a named
// part of the 3D model (tap in the browser, point + pinch in XR).
import type { Check } from '../types.ts';

export interface CheckRun {
  index: number;
  check: Check;
  passed: boolean[];
  /** Returns true when the answer is right. */
  answer(value: number | string | null): boolean;
  next(): boolean;
  done(): boolean;
}

export function startChecks(checks: Check[], already: number[] = []): CheckRun {
  const passed = checks.map((_, i) => already.includes(i));
  const firstOpen = passed.indexOf(false);
  const run: CheckRun = {
    index: firstOpen < 0 ? 0 : firstOpen,
    get check() {
      return checks[run.index];
    },
    passed,
    answer(value) {
      const c = checks[run.index];
      const ok = c.type === 'choice' ? value === c.answer : value === c.target;
      if (ok) passed[run.index] = true;
      return ok;
    },
    next() {
      const n = passed.findIndex((p, i) => !p && i > run.index);
      const m = n >= 0 ? n : passed.indexOf(false);
      if (m < 0) return false;
      run.index = m;
      return true;
    },
    done: () => passed.every(Boolean),
  };
  return run;
}
