// The physics behind each practical, free of any UI: what a perfect reading
// would be, how readings are derived into table columns, which issue codes a
// reading earns, and how the final answer follows from the slope.
import type { Practical } from '../../types.ts';

const DEG = Math.PI / 180;
export type Values = Record<string, number>;
/** Facts about how a reading was taken (not shown in the table). */
export type Meta = Record<string, number | boolean>;

export interface Logic {
  /** The column the student varies. */
  independent: string;
  /** Sensible span of the independent variable. */
  range: [number, number];
  derive(m: Values, p: Practical): Values;
  /** What the measured columns should have been for this setting. */
  truth(m: Values, meta: Meta, accepted: number, p: Practical): Values;
  /** Size of the reading error, in the units of tolerance.reading (relative or absolute). */
  error(m: Values, truth: Values): number;
  issues(m: Values, truth: Values, meta: Meta, p: Practical): string[];
}

export function pendulumPeriod(L: number, g: number, ampDeg = 0): number {
  const a = ampDeg * DEG;
  return 2 * Math.PI * Math.sqrt(L / g) * (1 + (a * a) / 16 + (11 * a ** 4) / 3072);
}
export const refractAngle = (iDeg: number, n: number) => Math.asin(Math.min(1, Math.sin(iDeg * DEG) / n)) / DEG;

const pendulum: Logic = {
  independent: 'L',
  range: [0.2, 1.0],
  derive(m, p) {
    const T = m.t / (p.oscillations ?? 20);
    return { T, T2: T * T };
  },
  truth(m, meta, g, p) {
    return { t: (p.oscillations ?? 20) * pendulumPeriod(m.L, g, Number(meta.amp ?? 0)) };
  },
  error: (m, tr) => Math.abs(m.t - tr.t) / tr.t,
  issues(m, tr, meta, p) {
    const out: string[] = [];
    const N = p.oscillations ?? 20;
    const period = tr.t / N;
    const diff = m.t - tr.t;
    if (Math.abs(diff) / tr.t > p.tolerance.reading) {
      const swingsOut = Math.abs(diff) / period;
      out.push(swingsOut > 0.6 && Math.abs(swingsOut - Math.round(swingsOut)) < 0.3 ? 'miscount' : 'late_start');
    }
    if (Math.abs(Number(meta.amp ?? 0)) > 15) out.push('large_angle');
    return out;
  },
};

const refraction: Logic = {
  independent: 'i',
  range: [10, 70],
  derive: (m) => ({ sini: Math.sin(m.i * DEG), sinr: Math.sin(m.r * DEG) }),
  truth: (m, meta, n) => ({ i: Number(meta.trueI ?? m.i), r: refractAngle(Number(meta.trueI ?? m.i), n) }),
  error: (m, tr) => Math.max(Math.abs(m.r - tr.r), Math.abs(m.i - tr.i)),
  issues(m, tr, meta, p) {
    const out: string[] = [];
    const off = Math.max(Math.abs(m.r - tr.r), Math.abs(m.i - tr.i)) > p.tolerance.reading;
    const oblique = Number(meta.oblique ?? 0) > 0.3;
    const close = Number(meta.pinGap ?? 1) < 0.16;
    if (oblique && (off || Number(meta.oblique) > 0.5)) out.push('parallax');
    if (close) out.push('pins_too_close');
    if (off && !out.length) out.push('outlier');
    return out;
  },
};

const ohm: Logic = {
  independent: 'I',
  range: [0.25, 1.25],
  derive: () => ({}),
  truth: (_m, meta) => ({ V: Number(meta.trueV ?? 0), I: Number(meta.trueI ?? 0) }),
  error: (m, tr) => (tr.I > 0 && tr.V > 0 ? Math.max(Math.abs(m.V - tr.V) / tr.V, Math.abs(m.I - tr.I) / tr.I) : 1),
  issues(m, tr, meta, p) {
    if (!meta.switchOn || m.I === 0) return ['switch_open'];
    return this.error(m, tr) > p.tolerance.reading ? ['misread_scale'] : [];
  },
};

export const LOGIC: Record<string, Logic> = {
  'pendulum-g': pendulum,
  'refraction-glass-block': refraction,
  'ohms-law': ohm,
};

/** Evaluate a formula option's calculation from the slope. NaN when the formula does not use the slope. */
export function applyFormula(calc: string, slope: number): number {
  const k = 4 * Math.PI * Math.PI;
  switch (calc) {
    case 'slope': return slope;
    case '1/slope': return 1 / slope;
    case '4pi2/slope': return k / slope;
    case '4pi2*slope': return k * slope;
    case 'slope/4pi2': return slope / k;
    default: return NaN;
  }
}
