// Least-squares line of best fit. Pure maths: used by the app, the tests and the server.
export interface Fit { slope: number; intercept: number; r2: number; n: number }

export function leastSquares(xs: number[], ys: number[]): Fit | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i];
  }
  const dx = n * sxx - sx * sx;
  if (Math.abs(dx) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / dx;
  const intercept = (sy - slope * sx) / n;
  const dy = n * syy - sy * sy;
  const r = dy < 1e-12 ? 1 : (n * sxy - sx * sy) / Math.sqrt(dx * dy);
  return { slope, intercept, r2: r * r, n };
}

/** Index of the point furthest from the line, if it stands well clear of the rest; else -1. */
export function outlier(xs: number[], ys: number[], fit: Fit): number {
  if (xs.length < 4) return -1;
  const res = xs.map((x, i) => Math.abs(ys[i] - (fit.slope * x + fit.intercept)));
  const worst = res.indexOf(Math.max(...res));
  const others = res.filter((_, i) => i !== worst);
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  const span = Math.max(...ys) - Math.min(...ys) || 1;
  return res[worst] > Math.max(4 * mean, 0.06 * span) ? worst : -1;
}

/** "Nice" axis ticks covering [min, max]. */
export function ticks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.501; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}
