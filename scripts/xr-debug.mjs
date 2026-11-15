import { chromium } from 'playwright';
const base = 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
page.on('console', (m) => console.log('console:', m.text().slice(0, 200)));
await page.goto(`${base}/?board=international&iwer=glasses#/t/refraction`);
await page.waitForSelector('#enter-vr'); await page.click('#enter-vr');
await page.waitForFunction(() => window.__xrc); await page.waitForTimeout(1500);
const out = await page.evaluate(async () => {
  const c = window.__xrc, hand = window.__xr.hands.right;
  const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); f(); });
  const w = c.buttonWorld('next');
  const st0 = c.state();
  const sh = [st0.head[0] + 0.17, st0.head[1] - 0.22, st0.head[2]];
  const d = w.map((v, i) => v - sh[i]); const len = Math.hypot(...d);
  const at = sh.map((v, i) => v + d[i] / len * 0.36);
  const log = [];
  for (let i = 0; i < 4; i++) { await frames(4); const p = c.hands[1].pinchPos; log.push([p.x, p.y, p.z].map((v) => +v.toFixed(3))); hand.position.x += at[0] - p.x; hand.position.y += at[1] - p.y; hand.position.z += at[2] - p.z; }
  await frames(4);
  const s1 = c.state();
  hand.setPinchValueImmediate(1); await frames(5);
  const s2 = c.state();
  return { w, at, log, handPos: [hand.position.x, hand.position.y, hand.position.z], s1: { cursor: s1.cursor, hover: s1.hover, pinch: s1.pinch, hands: s1.hands }, s2: { cursor: s2.cursor, hover: s2.hover, pinch: s2.pinch, hands: s2.hands }, count: document.querySelector('.count').textContent };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
