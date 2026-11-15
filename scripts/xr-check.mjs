// Hands-only run-through in the IWER emulator (Meta VR Glasses and Quest 3
// profiles): enter VR, check everything fits the field of view, pinch panel
// buttons, grab a handle, answer a "point at" check, then do a whole practical
// from the headset panels. Also exercises the phone-AR placement path.
//   node scripts/xr-check.mjs [--shots=dir]
import { chromium } from 'playwright';
const shots = process.argv.find((a) => a.startsWith('--shots='))?.split('=')[1] ?? '';
const base = process.env.BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
let HEAD = [0, 1.2, 0];

async function start(profile, hash, mode = 'vr') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  page.on('pageerror', (e) => { console.log('  pageerror:', (e.stack ?? e.message).split('\n').slice(0, 3).join(' | ')); failed++; });
  await page.goto(`${base}/?board=international&partner=rules&iwer=${profile}${hash}`);
  await page.waitForSelector(`#enter-${mode}`, { timeout: 30000 });
  await page.click(`#enter-${mode}`);
  await page.waitForFunction(() => window.__xrc, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  return page;
}
// put the right hand so its pinch point is at `at`
async function handTo(page, at, pinch) {
  await page.evaluate(async ([at, pinch]) => {
    const hand = window.__xr.hands.right;
    const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); f(); });
    for (let i = 0; i < 3; i++) { // converge: measure where the pinch point really is, then correct
      await frames(3);
      const p = window.__xrc.hands[1].pinchPos;
      hand.position.x += at[0] - p.x; hand.position.y += at[1] - p.y; hand.position.z += at[2] - p.z;
    }
    await frames(3);
    if (pinch !== null) { hand.setPinchValueImmediate(pinch); await frames(4); }
  }, [at, pinch]);
}
// aim the pointer ray (shoulder -> pinch point) at a world point, optionally pinch and release
async function aim(page, target, click = true, reach = 0.36) {
  const shoulder = [HEAD[0] + 0.17, HEAD[1] - 0.22, HEAD[2]];
  const d = target.map((v, i) => v - shoulder[i]);
  const len = Math.hypot(...d);
  const at = shoulder.map((v, i) => v + (d[i] / len) * Math.min(reach, len * 0.8));
  await handTo(page, at, 0);
  if (click) { await handTo(page, at, 1); await handTo(page, at, 0); }
  return at;
}
const pinchButton = async (page, id) => { const w = await page.evaluate((id) => window.__xrc.buttonWorld(id), id); if (!w) return false; await aim(page, w); return true; };
const press = (page, id) => page.evaluate((id) => window.__xrc.pressButton(id), id);

for (const profile of ['glasses', 'quest3']) {
  console.log(`VR, ${profile} profile: topic stage`);
  const page = await start(profile, '#/t/refraction');
  const st = await page.evaluate(() => ({ ...window.__xrc.state(), extent: window.__xrc.extent() }));
  HEAD = st.head;
  console.log(`  head at ${HEAD.map((v) => v.toFixed(2))}, yaw ${st.headYaw.toFixed(2)}`);
  check(st.placed && st.hands.every((h) => h.tracked), `session placed, both hands tracked; panel buttons: ${st.buttons.join(', ')}`);
  check(st.extent.h <= 35 && st.extent.v <= 33, `everything within ${st.extent.h.toFixed(1)}° x ${st.extent.v.toFixed(1)}° half-angles (limit 35° x 33°)`);
  if (shots) await page.screenshot({ path: `${shots}/xr-${profile}-topic.png` });
  await pinchButton(page, 'next');
  check(await page.evaluate(() => document.querySelector('.count').textContent.includes('2')), 'pinching "Next" with a hand ray moves to card 2');
  // grab the ray box and drag it
  const before = await page.evaluate(() => window.__stage.template.getState().angle);
  const hw = await page.evaluate(() => { const t = window.__stage.template; const p = t.group.localToWorld(t.handles()[0].pos.clone()); return [p.x, p.y, p.z]; });
  const at = await aim(page, hw, false);
  await handTo(page, at, 1);
  await handTo(page, [at[0] - 0.05, at[1] - 0.03, at[2]], null);
  await handTo(page, [at[0] - 0.05, at[1] - 0.03, at[2]], 0);
  const after = await page.evaluate(() => window.__stage.template.getState().angle);
  check(after !== before, `pinch-dragging the ray box changes the angle (${before}° -> ${after}°)`);
  // point + pinch check
  for (let i = 0; i < 3; i++) await press(page, 'next');
  await page.waitForTimeout(900);
  const nw = await page.evaluate(() => { const t = window.__stage.template; const [a, b] = t.pickTargets().normal; const p = t.group.localToWorld(a.clone().lerp(b, 0.5)); return [p.x, p.y, p.z]; });
  await aim(page, nw);
  await page.waitForTimeout(300);
  const fb = await page.evaluate(() => ({ text: document.querySelector('.feedback')?.textContent, q: document.querySelector('.check-q')?.textContent, last: window.__xrc.state().lastPoint }));
  check(fb.text === 'Correct!', `"${fb.q}" answered by pointing and pinching (pointed at: ${fb.last}; feedback: ${fb.text})`);
  // empty-space pinch rotates; two-hand pull zooms
  const yaw0 = (await page.evaluate(() => window.__xrc.state())).yaw;
  const free = [0.05, 1.42, -0.3];
  await handTo(page, free, 1);
  await handTo(page, [free[0] + 0.08, free[1], free[2]], null);
  await handTo(page, [free[0] + 0.08, free[1], free[2]], 0);
  const yaw1 = (await page.evaluate(() => window.__xrc.state())).yaw;
  check(Math.abs(yaw1 - yaw0) > 0.1, `pinch + drag in empty space turns the model (${(yaw1 - yaw0).toFixed(2)} rad)`);
  if (shots) await page.screenshot({ path: `${shots}/xr-${profile}-check.png` });

  console.log(`VR, ${profile} profile: practical from the headset panels`);
  await page.evaluate(() => { location.hash = '#/p/ohms-law'; });
  await page.waitForFunction(() => window.__bench?.driver && window.__xrc.state().buttons.includes('place-next'), null, { timeout: 20000 });
  check((await page.evaluate(() => window.__xrc.state())).placed, 'the session survives moving from the topic to the practical');
  for (let i = 0; i < 6; i++) { await pinchButton(page, 'place-next'); await page.waitForTimeout(120); }
  await page.waitForFunction(() => window.__xrc.state().buttons.includes('switch'), null, { timeout: 5000 });
  await pinchButton(page, 'switch');
  if (shots) await page.screenshot({ path: `${shots}/xr-${profile}-bench.png` });
  for (let i = 0; i < 6; i++) {
    for (let k = 0; k < (i === 0 ? 0 : 2); k++) await press(page, 'rheo-');
    await page.waitForTimeout(150);
    await pinchButton(page, 'record');
    await page.waitForFunction(() => window.__bench.say() !== '…');
  }
  const rows = await page.evaluate(() => window.__bench.engine.rows.map((r) => [r.values.V, r.values.I, r.issues.join()]));
  check(rows.length === 6 && rows.every((r) => !r[2]), `6 readings recorded by pinching: ${rows.map((r) => `${r[0].toFixed(1)}V/${r[1].toFixed(2)}A${r[2] ? ' [' + r[2] + ']' : ''}`).join(' ')}`);
  await pinchButton(page, 'analyse');
  const pick = async (label) => { const ids = await page.evaluate(() => window.__xrc.state().buttons); const id = ids.find((x) => x === 'w' + label); if (!id) throw new Error(`no option "${label}" in ${ids}`); await pinchButton(page, id); await page.waitForTimeout(150); };
  await pick('V / V'); await pick('I / A'); await pick('R = slope of V against I'); await pick('Ω');
  await pick('I opened the switch between readings so the resistor did not heat up.'); await pick('I made sure the connections were tight.'); await pick('Next →');
  await pick('V is proportional to I at constant temperature, so the resistor obeys Ohm\'s law.');
  await pinchButton(page, 'finish');
  await page.waitForFunction(() => window.__bench.sheet(), null, { timeout: 8000 });
  const out = await page.evaluate(() => ({ total: window.__bench.sheet().total, R: window.__bench.engine.answer(), pct: window.__bench.engine.pctError() }));
  check(out.pct < 5, `whole practical done with hands only: R = ${out.R.toFixed(2)} Ω (${out.pct.toFixed(1)}% error), score ${out.total}`);
  await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/xr-${profile}-marks.png` });
  await page.evaluate(() => window.__xrc.pressButton('nothing'));
  await page.close();
}

console.log('Phone AR path (emulated; no real camera or hit-test)');
{
  const page = await start('phone', '#/t/simple-pendulum', 'ar');
  check(await page.evaluate(() => window.__xrc.state().phoneAR && document.documentElement.classList.contains('ar-active')), 'AR session started with the HTML UI as overlay');
  check(await page.evaluate(() => !window.__stage.root.visible), 'lab is hidden until it is placed');
  await page.evaluate(async () => { const h = window.__xr.hands.right; h.setPinchValueImmediate(1); await new Promise((r) => setTimeout(r, 300)); h.setPinchValueImmediate(0); await new Promise((r) => setTimeout(r, 300)); });
  const placed = await page.evaluate(() => ({ visible: window.__stage.root.visible, scale: window.__stage.root.scale.x, pos: window.__stage.root.position.toArray() }));
  check(placed.visible && placed.scale < 0.5, `select places the lab in front of the camera at scale ${placed.scale} (${placed.pos.map((v) => v.toFixed(2))})`);
  if (shots) await page.screenshot({ path: `${shots}/ar-phone.png` });
  await page.evaluate(() => document.querySelector('#exit-ar').click()); // (the emulator's own canvas covers the page, so click from script)
  await page.waitForTimeout(500);
  check(await page.evaluate(() => !document.documentElement.classList.contains('ar-active') && window.__stage.root.scale.x === 1), 'leaving AR restores the browser view');
  await page.close();
}
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll XR checks passed');
process.exit(failed ? 1 : 0);
