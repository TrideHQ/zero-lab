// The holographic protractor: turns the student's four pins into traced rays,
// then reads the angles off to the nearest degree, with parallax if they are
// not looking straight on.
import type { P3, Seg } from '../render/beams.ts';

const DEG = Math.PI / 180;
export interface Pin { x: number; y: number }
export interface Trace { entry: Pin; exit: Pin; i: number; r: number; pinGap: number }

/** Trace rays from two pins above the block (y > top) and two below it (y < bottom). */
export function tracePins(above: Pin[], below: Pin[], top: number, bottom: number): Trace | null {
  if (above.length < 2 || below.length < 2) return null;
  const [a, b] = above, [c, d] = below;
  if (Math.abs(a.y - b.y) < 1e-4 || Math.abs(c.y - d.y) < 1e-4) return null;
  const xAt = (p: Pin, q: Pin, y: number) => p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y);
  const entry = { x: xAt(a, b, top), y: top };
  const exit = { x: xAt(c, d, bottom), y: bottom };
  const i = Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / DEG;
  const r = Math.atan2(Math.abs(exit.x - entry.x), top - bottom) / DEG;
  const pinGap = Math.min(Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(c.x - d.x, c.y - d.y));
  return { entry, exit, i, r, pinGap };
}

/** Parallax error in degrees for a viewing direction `oblique` radians off straight-on. */
export const parallax = (oblique: number) => Math.max(0, Math.sin(oblique) - Math.sin(0.12)) * 4;

/** What the protractor reads: nearest degree, shifted by parallax. `sign` is +1 or -1. */
export function readAngles(tr: Trace, oblique: number, sign: number): { i: number; r: number } {
  const e = parallax(oblique) * sign;
  return { i: Math.round(tr.i + e), r: Math.round(tr.r - e * 0.6) };
}

/** Protractor scale around a centre: ticks every 10°, longer every 30°. */
export function protractorSegs(cx: number, cy: number, radius: number, color: number): Seg[] {
  const out: Seg[] = [];
  for (let a = 0; a < 360; a += 10) {
    const len = a % 30 === 0 ? 0.05 : 0.025;
    const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
    const p: P3 = [cx + c * radius, cy + s * radius, 0.005], q: P3 = [cx + c * (radius - len), cy + s * (radius - len), 0.005];
    out.push({ a: p, b: q, c: color, w: 0.006, alpha: 0.8 });
    const a2 = (a + 10) * DEG;
    out.push({ a: p, b: [cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius, 0.005], c: color, w: 0.005, alpha: 0.6 });
  }
  return out;
}
