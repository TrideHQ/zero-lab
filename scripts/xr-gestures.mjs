// Reliability of the three hands-free-of-aiming inputs, in the IWER emulator:
// gaze + pinch, palm-up menu, palm swipe. Each is tried TRIES times per profile.
import { chromium } from 'playwright';
const base = process.env.BASE ?? 'http://localhost:5173';
const TRIES = Number(process.argv[2] ?? 5);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = {};
for (const profile of ['glasses', 'quest3']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${base}/?board=international&partner=rules&iwer=${profile}#/t/refraction`);
  await page.waitForSelector('#enter-vr'); await page.click('#enter-vr');
  await page.waitForFunction(() => window.__xrc?.state().placed, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const r = (results[profile] = { gaze: 0, palmUp: 0, swipe: 0, notes: [] });
  const card = () => page.evaluate(() => document.querySelector('.count').textContent);

  // --- gaze + pinch: look at "Next", pinch with the hand resting off to the side ---
  for (let k = 0; k < TRIES; k++) {
    const before = await card();
    await page.evaluate(async (k) => {
      const c = window.__xrc, d = window.__xr, hand = d.hands.right;
      const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); f(); });
      const id = k % 2 === 0 ? 'next' : 'prev';
      const w = c.buttonWorld(id), st = c.state();
      const dir = [w[0] - st.head[0], w[1] - st.head[1], w[2] - st.head[2]];
      const yaw = Math.atan2(-dir[0], -dir[2]), pitch = Math.atan2(dir[1], Math.hypot(dir[0], dir[2]));
      // head orientation: yaw then pitch (YXZ)
      const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
      d.quaternion.set(cy * sp, sy * cp, -sy * sp, cy * cp);
      hand.setPinchValueImmediate(0);
      hand.position.set(0.32, 1.02, -0.22); // resting hand, aimed at nothing
      await frames(14);
      window.__g = c.state().gazeHot;
      hand.setPinchValueImmediate(1); await frames(6); hand.setPinchValueImmediate(0); await frames(6);
      d.quaternion.set(0, 0, 0, 1); await frames(4);
    }, k);
    const after = await card();
    if (after !== before) r.gaze++; else r.notes.push(`gaze try ${k}: looked at ${await page.evaluate(() => window.__g)}, card stayed "${after}"`);
  }

  // --- palm-up hold: find the hand rotation that turns the palm up, hold it 1.3 s ---
  const quats = { 'rollZ+90': [0, 0, 0.7071, 0.7071], 'rollZ-90': [0, 0, -0.7071, 0.7071], 'rollZ180': [0, 0, 1, 0], 'pitchX+90': [0.7071, 0, 0, 0.7071], 'pitchX-90': [-0.7071, 0, 0, 0.7071], none: [0, 0, 0, 1] };
  let upQuat = null;
  for (const [name, q] of Object.entries(quats)) {
    const palm = await page.evaluate(async (q) => {
      const hand = window.__xr.hands.right; hand.setPinchValueImmediate(0); hand.position.set(0.25, 1.0, -0.3); hand.quaternion.set(...q);
      await new Promise((res) => setTimeout(res, 250));
      return window.__xrc.state().palm[1];
    }, q);
    r.notes.push(`palm with ${name}: normal ${JSON.stringify(palm.n)} open=${palm.open}`);
    if (palm.up > 0.75 && palm.open && !upQuat) upQuat = q;
  }
  for (let k = 0; k < TRIES && upQuat; k++) {
    const ok = await page.evaluate(async (q) => {
      const hand = window.__xr.hands.right, c = window.__xrc;
      hand.quaternion.set(0, 0, 0, 1); await new Promise((res) => setTimeout(res, 300));
      const before = c.state().menu;
      hand.quaternion.set(...q); await new Promise((res) => setTimeout(res, 1500));
      const after = c.state().menu;
      hand.quaternion.set(0, 0, 0, 1); await new Promise((res) => setTimeout(res, 200));
      return before !== after;
    }, upQuat);
    if (ok) r.palmUp++;
  }
  await page.evaluate(() => { if (window.__xrc.state().menu) window.__xrc.pressButton('menu'); });

  // --- palm swipe: open hand, palm sideways, sweep 35 cm at about 1.4 m/s ---
  for (let k = 0; k < TRIES; k++) {
    const before = await card();
    await page.evaluate(async (k) => {
      const hand = window.__xr.hands.right;
      hand.quaternion.set(0, 0, 0.7071, 0.7071); hand.setPinchValueImmediate(0); // palm facing sideways, as when turning a page
      const dirn = k % 2 === 0 ? -1 : 1, x0 = dirn < 0 ? 0.3 : -0.05;
      hand.position.set(x0, 1.05, -0.35);
      await new Promise((res) => setTimeout(res, 400));
      const t0 = performance.now();
      await new Promise((res) => { const f = () => { const s = (performance.now() - t0) / 1000; hand.position.x = x0 + dirn * Math.min(0.35, s * 1.4); s < 0.3 ? requestAnimationFrame(f) : res(); }; f(); });
      await new Promise((res) => setTimeout(res, 900));
    }, k);
    const after = await card();
    if (after !== before) r.swipe++;
  }
  r.stats = await page.evaluate(() => window.__xrc.state().stats);
  r.fps = await page.evaluate(() => Math.round(window.__stage.fps));
  await page.close();
}
await browser.close();
for (const [p, r] of Object.entries(results)) {
  console.log(`${p}: gaze+pinch ${r.gaze}/${TRIES}, palm-up menu ${r.palmUp}/${TRIES}, palm swipe ${r.swipe}/${TRIES}  (emulator at ~${r.fps} fps; counters ${JSON.stringify(r.stats)})`);
  for (const n of r.notes) console.log('   ', n);
}
