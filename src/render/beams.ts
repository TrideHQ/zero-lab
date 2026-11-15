// Glowing ribbons: every line in a template (rays, wires, strings, arrows) is a
// segment in one mesh, so a whole diagram costs a single draw call.
import * as THREE from 'three';
import { lineMaterial } from './hologram-shader.ts';

export type P3 = [number, number, number];
export interface Seg { a: P3; b: P3; c: number; w?: number; alpha?: number; dash?: number }

const col = new THREE.Color();

export class Beams {
  mesh: THREE.Mesh;
  private pos: Float32Array;
  private rgba: Float32Array;
  private geo = new THREE.BufferGeometry();
  private max: number;

  constructor(maxQuads = 900) {
    this.max = maxQuads;
    this.pos = new Float32Array(maxQuads * 18);
    this.rgba = new Float32Array(maxQuads * 24);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, lineMaterial());
    this.mesh.frustumCulled = false;
  }

  set(segs: Seg[]) {
    let q = 0;
    const quad = (a: P3, b: P3, ox: number, oy: number, oz: number, r: number, g: number, bl: number, al: number) => {
      if (q >= this.max) return;
      const p = this.pos, c = this.rgba, i = q * 18, j = q * 24;
      const v = [
        a[0] - ox, a[1] - oy, a[2] - oz, a[0] + ox, a[1] + oy, a[2] + oz, b[0] + ox, b[1] + oy, b[2] + oz,
        a[0] - ox, a[1] - oy, a[2] - oz, b[0] + ox, b[1] + oy, b[2] + oz, b[0] - ox, b[1] - oy, b[2] - oz,
      ];
      for (let k = 0; k < 18; k++) p[i + k] = v[k];
      for (let k = 0; k < 6; k++) { c[j + k * 4] = r; c[j + k * 4 + 1] = g; c[j + k * 4 + 2] = bl; c[j + k * 4 + 3] = al; }
      q++;
    };
    for (const s of segs) {
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], dz = s.b[2] - s.a[2];
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-6) continue;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      // two perpendicular ribbons so the line is visible from any side
      let px = -uy, py = ux, pz = 0;
      let pl = Math.hypot(px, py);
      if (pl < 1e-4) { px = 1; py = 0; pl = 1; }
      px /= pl; py /= pl;
      const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
      const w = (s.w ?? 0.014) / 2;
      col.setHex(s.c);
      const al = s.alpha ?? 1;
      const pieces = s.dash ? Math.max(1, Math.round(len / (s.dash * 2))) : 1;
      for (let k = 0; k < pieces; k++) {
        const t0 = k / pieces, t1 = s.dash ? (k + 0.5) / pieces : 1;
        const a: P3 = [s.a[0] + dx * t0, s.a[1] + dy * t0, s.a[2] + dz * t0];
        const b: P3 = [s.a[0] + dx * t1, s.a[1] + dy * t1, s.a[2] + dz * t1];
        quad(a, b, px * w, py * w, pz * w, col.r, col.g, col.b, al);
        quad(a, b, qx * w, qy * w, qz * w, col.r, col.g, col.b, al);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.setDrawRange(0, q * 6);
  }

  dispose() {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Arrow as beam segments (shaft + two barbs), lying in the plane with normal +Z. */
export function arrow(a: P3, b: P3, c: number, w = 0.02, head = 0.09): Seg[] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return [];
  const ux = dx / len, uy = dy / len;
  const hd = Math.min(head, len * 0.6);
  const l: P3 = [b[0] - ux * hd - uy * hd * 0.55, b[1] - uy * hd + ux * hd * 0.55, b[2]];
  const r: P3 = [b[0] - ux * hd + uy * hd * 0.55, b[1] - uy * hd - ux * hd * 0.55, b[2]];
  return [{ a, b, c, w }, { a: l, b, c, w }, { a: r, b, c, w }];
}

/** Circular arc in the XY plane, as segments. Angles in radians, measured from +X. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, c: number, w = 0.01, z = 0): Seg[] {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.18));
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    out.push({ a: [cx + Math.cos(t0) * r, cy + Math.sin(t0) * r, z], b: [cx + Math.cos(t1) * r, cy + Math.sin(t1) * r, z], c, w });
  }
  return out;
}
