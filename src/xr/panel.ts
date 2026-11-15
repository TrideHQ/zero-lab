// In-headset panels: a PanelSpec drawn to a canvas texture, with large pinch /
// poke targets. Used only in VR (the browser and phone AR use the HTML UI).
import * as THREE from 'three';
import type { PanelButton, PanelSpec } from './panel-spec.ts';

const FONT = 'Inter, system-ui, sans-serif';

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (g.measureText(next).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

interface Hit { x: number; y: number; w: number; h: number; b: PanelButton }

export class Panel {
  mesh: THREE.Mesh;
  hover = -1;
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private hits: Hit[] = [];
  private spec: PanelSpec | null = null;
  private image: CanvasImageSource | null = null;
  readonly pw: number;
  readonly ph: number;

  constructor(widthM: number, heightM: number, pxPerM = 2000) {
    this.pw = this.canvas.width = Math.round(widthM * pxPerM);
    this.ph = this.canvas.height = Math.round(heightM * pxPerM);
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = 5;
  }

  set(spec: PanelSpec | null, image: CanvasImageSource | null = null) {
    this.spec = spec;
    this.image = image;
    this.redraw();
  }

  setHover(i: number) {
    if (i === this.hover) return;
    this.hover = i;
    this.redraw();
  }

  /** Button index under a uv coordinate (origin bottom-left), or -1. */
  hit(u: number, v: number): number {
    const x = u * this.pw, y = (1 - v) * this.ph;
    return this.hits.findIndex((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h && !h.b.disabled);
  }

  press(i: number) {
    const h = this.hits[i];
    if (h && !h.b.disabled) h.b.on();
  }

  buttonCount() { return this.hits.length; }
  buttonIds() { return this.hits.map((h) => h.b.id); }
  /** Centre of a button in uv space (for tests and the demo). */
  buttonUv(id: string): [number, number] | null {
    const h = this.hits.find((x) => x.b.id === id);
    return h ? [(h.x + h.w / 2) / this.pw, 1 - (h.y + h.h / 2) / this.ph] : null;
  }

  private redraw() {
    const g = this.g, W = this.pw, H = this.ph, pad = 28;
    g.clearRect(0, 0, W, H);
    this.hits = [];
    g.fillStyle = 'rgba(10,18,48,0.93)';
    g.strokeStyle = '#36e3ff';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(2, 2, W - 4, H - 4, 26);
    g.fill();
    g.stroke();
    const s = this.spec;
    if (this.image && !s?.table) {
      try {
        const iw = (this.image as HTMLImageElement).naturalWidth || (this.image as HTMLCanvasElement).width, ih = (this.image as HTMLImageElement).naturalHeight || (this.image as HTMLCanvasElement).height;
        const k = Math.min((W - 2 * pad) / iw, (H - 2 * pad) / ih);
        g.drawImage(this.image, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
      } catch { /* image not ready */ }
    }
    if (!s) {
      this.tex.needsUpdate = true;
      return;
    }
    // buttons: laid out from the bottom up so they are always fully visible
    const bh = 84, gap = 14;
    g.font = `600 30px ${FONT}`;
    const rows: { b: PanelButton; w: number; lines: string[] }[][] = [[]];
    let rowW = 0;
    for (const b of s.buttons) {
      const lines = wrap(g, b.label, W - 2 * pad - 48).slice(0, 2);
      const w = Math.min(W - 2 * pad, Math.max(170, Math.max(...lines.map((l) => g.measureText(l).width)) + 48));
      if (rowW + w > W - 2 * pad && rows[rows.length - 1].length) {
        rows.push([]);
        rowW = 0;
      }
      rows[rows.length - 1].push({ b, w, lines });
      rowW += w + gap;
    }
    const used = s.buttons.length ? rows.length * (bh + gap) : 0;
    const bare = !s.title && !s.body.length && !s.table; // a buttons-only panel fills from the top
    let y = bare ? pad : H - pad - used + gap - (s.footer ? 34 : 0);
    const bodyBottom = y - 10;
    for (const row of rows) {
      const extra = (W - 2 * pad - row.reduce((a, r) => a + r.w, 0) - gap * (row.length - 1)) / (row.length || 1);
      let x = pad;
      for (const r of row) {
        const w = r.w + Math.max(0, Math.min(extra, 240));
        const idx = this.hits.length;
        this.hits.push({ x, y, w, h: bh, b: r.b });
        const hot = idx === this.hover && !r.b.disabled;
        g.globalAlpha = r.b.disabled ? 0.4 : 1;
        g.fillStyle = r.b.primary ? '#ffb347' : r.b.pressed ? 'rgba(54,227,255,0.38)' : 'rgba(54,227,255,0.12)';
        g.strokeStyle = hot ? '#ffffff' : r.b.primary ? '#ffb347' : '#36e3ff';
        g.lineWidth = hot ? 5 : 2;
        g.beginPath();
        g.roundRect(x, y, w, bh, 18);
        g.fill();
        g.stroke();
        g.fillStyle = r.b.primary ? '#2a1600' : '#e8f7ff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        r.lines.forEach((l, i) => g.fillText(l, x + w / 2, y + bh / 2 + (i - (r.lines.length - 1) / 2) * 34));
        g.globalAlpha = 1;
        x += w + gap;
      }
      y += bh + gap;
    }
    if (s.footer) {
      g.font = `500 24px ${FONT}`;
      g.fillStyle = '#9db6d8';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.fillText(s.footer, W / 2, H - pad + 4);
    }
    // header and body
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    let ty = pad + 40;
    g.font = `700 42px ${FONT}`;
    g.fillStyle = '#ffffff';
    for (const l of wrap(g, s.title, W - 2 * pad).slice(0, 2)) { g.fillText(l, pad, ty); ty += 48; }
    if (s.badge) {
      g.font = `600 22px ${FONT}`;
      g.fillStyle = '#ffd9a3';
      g.fillText(s.badge, pad, ty - 8);
      ty += 26;
    }
    g.font = `400 32px ${FONT}`;
    g.fillStyle = '#e8f7ff';
    for (const para of s.body.filter(Boolean)) {
      for (const l of wrap(g, para, W - 2 * pad)) {
        if (ty > bodyBottom - 4) break;
        g.fillText(l, pad, ty);
        ty += 40;
      }
      ty += 10;
    }
    if (s.equation && ty + 50 < bodyBottom) {
      g.font = `500 36px ${FONT}`;
      g.fillStyle = '#8fe9ff';
      g.textAlign = 'center';
      g.fillText(s.equation, W / 2, ty + 30);
      g.textAlign = 'left';
      ty += 60;
    }
    if (s.table) {
      const cols = s.table.head.length;
      const cw = (W - 2 * pad) / cols;
      g.font = `600 24px ${FONT}`;
      const rowH = Math.min(40, (bodyBottom - ty) / (s.table.rows.length + 1.2));
      g.fillStyle = '#8fe9ff';
      s.table.head.forEach((c, i) => g.fillText(c, pad + i * cw + 4, ty + rowH * 0.7, cw - 8));
      ty += rowH;
      g.font = `400 26px ${FONT}`;
      s.table.rows.forEach((r, ri) => {
        if (s.table!.flags?.includes(ri)) {
          g.fillStyle = 'rgba(255,179,71,0.22)';
          g.fillRect(pad, ty + 2, W - 2 * pad, rowH - 2);
        }
        g.fillStyle = '#e8f7ff';
        r.forEach((c, i) => g.fillText(c, pad + i * cw + 4, ty + rowH * 0.72, cw - 8));
        ty += rowH;
      });
    }
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
