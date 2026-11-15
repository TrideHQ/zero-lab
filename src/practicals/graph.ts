// Tiny graph: points, axes with units, and the least-squares line. Canvas 2D,
// no charting library. The same canvas feeds the VR side panel and the
// revision summary.
import { num } from '../i18n/index.ts';
import { ticks } from './fit.ts';
import type { PracticalEngine } from './engine.ts';

export function drawGraph(canvas: HTMLCanvasElement, e: PracticalEngine, xId: string, yId: string, w = 420, hgt = 300): void {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0a1230';
  g.fillRect(0, 0, w, hgt);
  const cols = e.practical.table.columns;
  const cx = cols.find((c) => c.id === xId), cy = cols.find((c) => c.id === yId);
  g.font = '13px Inter, system-ui, sans-serif';
  if (!cx || !cy || xId === yId) {
    g.fillStyle = '#9db6d8';
    g.textAlign = 'center';
    g.fillText('—', w / 2, hgt / 2);
    return;
  }
  const xs = e.column(xId), ys = e.column(yId);
  const L = 56, R = 14, T = 14, B = 44;
  const xt = ticks(0, Math.max(...xs, 1e-9) * 1.08), yt = ticks(0, Math.max(...ys, 1e-9) * 1.08);
  const x0 = xt[0], x1 = xt[xt.length - 1], y0 = yt[0], y1 = yt[yt.length - 1];
  const px = (v: number) => L + ((v - x0) / (x1 - x0)) * (w - L - R);
  const py = (v: number) => hgt - B - ((v - y0) / (y1 - y0)) * (hgt - T - B);
  g.strokeStyle = 'rgba(54,227,255,0.16)';
  g.fillStyle = '#9db6d8';
  g.lineWidth = 1;
  g.textAlign = 'center';
  for (const v of xt) {
    g.beginPath(); g.moveTo(px(v), T); g.lineTo(px(v), hgt - B); g.stroke();
    g.fillText(num(v), px(v), hgt - B + 16);
  }
  g.textAlign = 'right';
  for (const v of yt) {
    g.beginPath(); g.moveTo(L, py(v)); g.lineTo(w - R, py(v)); g.stroke();
    g.fillText(num(v), L - 6, py(v) + 4);
  }
  g.strokeStyle = '#36e3ff';
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(L, T); g.lineTo(L, hgt - B); g.lineTo(w - R, hgt - B); g.stroke();
  g.fillStyle = '#e8f7ff';
  g.textAlign = 'center';
  g.font = '600 13px Inter, system-ui, sans-serif';
  g.fillText(cx.unit ? `${cx.label} / ${cx.unit}` : cx.label, (L + w - R) / 2, hgt - 8);
  g.save();
  g.translate(14, (T + hgt - B) / 2);
  g.rotate(-Math.PI / 2);
  g.fillText(cy.unit ? `${cy.label} / ${cy.unit}` : cy.label, 0, 0);
  g.restore();
  const f = e.fit(xId, yId);
  if (f) {
    g.strokeStyle = '#ffb347';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px(x0), py(f.slope * x0 + f.intercept));
    g.lineTo(px(x1), py(f.slope * x1 + f.intercept));
    g.save();
    g.beginPath(); g.rect(L, T, w - L - R, hgt - T - B); g.clip();
    g.beginPath();
    g.moveTo(px(x0), py(f.slope * x0 + f.intercept));
    g.lineTo(px(x1), py(f.slope * x1 + f.intercept));
    g.stroke();
    g.restore();
  }
  xs.forEach((x, i) => {
    const flagged = e.rows[i].issues.some((k) => k !== 'none' && k !== 'duplicate_reading');
    g.strokeStyle = flagged ? '#ffb347' : '#e8f7ff';
    g.lineWidth = 2;
    const X = px(x), Y = py(ys[i]);
    g.beginPath(); g.moveTo(X - 5, Y - 5); g.lineTo(X + 5, Y + 5); g.moveTo(X - 5, Y + 5); g.lineTo(X + 5, Y - 5); g.stroke();
  });
}
