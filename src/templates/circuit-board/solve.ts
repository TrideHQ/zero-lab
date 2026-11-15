// Circuit maths, free of any 3D or UI code (so tests and scripts can use it directly).
export const RHEOSTAT_MAX = 20;
export const RES = { V: 0.1, I: 0.02 };

export interface Solved { I: number; V: number; V1: number; V2: number; I1: number; I2: number; Req: number }

/** Solve the three circuits. `rheo` is the rheostat fraction 0..1 (ohm preset only). */
export function solve(preset: string, on: boolean, emf: number, R1: number, R2: number, rheo: number): Solved {
  const z: Solved = { I: 0, V: 0, V1: 0, V2: 0, I1: 0, I2: 0, Req: 0 };
  if (preset === 'series') {
    z.Req = R1 + R2;
    if (on) { z.I = emf / z.Req; z.V1 = z.I * R1; z.V2 = z.I * R2; z.V = emf; }
  } else if (preset === 'parallel') {
    z.Req = (R1 * R2) / (R1 + R2);
    if (on) { z.I1 = emf / R1; z.I2 = emf / R2; z.I = z.I1 + z.I2; z.V = emf; }
  } else {
    z.Req = R1 + rheo * RHEOSTAT_MAX;
    if (on) { z.I = emf / z.Req; z.V = z.I * R1; }
  }
  return z;
}

/** Small deterministic PRNG so meter noise is repeatable in tests. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

