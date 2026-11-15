// Runs each practical end to end in a real browser, the way a student would:
// operate the apparatus, record readings, analyse, get a mark. Also takes one
// deliberately bad reading per practical and checks that it is flagged.
//   node scripts/practical-check.mjs [pendulum-g|refraction-glass-block|ohms-law|moon] [--shots=dir] [--board=waec]
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const flag = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const only = args.find((a) => !a.startsWith('--'));
const base = process.env.BASE ?? 'http://localhost:5173';
const board = flag('board', 'international');
const shots = flag('shots', '');
const DEG = Math.PI / 180;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

async function open(slug, variant = '') {
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  page.on('pageerror', (e) => { console.log('  pageerror:', e.message); failed++; });
  await page.goto(`${base}/?board=${board}#/p/${slug}?fast=8${variant ? `&v=${variant}` : ''}`);
  await page.waitForFunction(() => window.__bench?.driver, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return page;
}
const rows = (page) => page.evaluate(() => window.__bench.engine.rows.map((r) => ({ ...r.values, issues: r.issues })));
const partner = async (page) => { await page.waitForFunction(() => window.__bench.say() !== '…', null, { timeout: 6000 }); return page.evaluate(() => ({ say: window.__bench.say(), source: window.__bench.source() })); };

async function analyse(page, a, name) {
  await page.click('#analyse');
  await page.selectOption('#axis-y', a.y);
  await page.selectOption('#axis-x', a.x);
  await page.check(`input[name=formula][value=${a.formula}]`);
  await page.selectOption('#unit', a.unit);
  for (const p of a.precautions) await page.check(`input[type=checkbox][value=${p}]`);
  await page.check(`input[name=conclusion][value="${a.conclusion}"]`);
  if (shots) await page.screenshot({ path: `${shots}/${name}-analysis.png` });
  await page.click('#finish');
  await page.waitForSelector('#marksheet');
  const final = await partner(page);
  const out = await page.evaluate(() => ({ total: document.querySelector('#total').textContent, answer: window.__bench.engine.answer(), pct: window.__bench.engine.pctError(), sheet: window.__bench.sheet() }));
  if (shots) await page.screenshot({ path: `${shots}/${name}-marks.png` });
  return { ...out, final };
}

async function pendulum(variant) {
  console.log(`pendulum-g (${variant})`);
  const page = await open('pendulum-g', variant);
  // time N swings by watching the bob pass the centre, as a student does
  const timeSwings = (L, n, amp = 8) => page.evaluate(async ([L, n, amp]) => {
    const d = window.__bench.driver.bot;
    d.setLength(L); d.pull(amp); d.release();
    const until = (f) => new Promise((res) => { const tick = () => (f() ? res() : requestAnimationFrame(tick)); tick(); });
    const s0 = d.swings();
    await until(() => d.swings() > s0);
    d.toggle();
    const s1 = d.swings();
    await until(() => d.swings() >= s1 + n);
    d.toggle();
  }, [L, n, amp]);
  await timeSwings(0.5, 19);
  await page.click('#record');
  const bad = await partner(page);
  check((await rows(page))[0].issues.includes('miscount'), `19 swings flagged as miscount; partner (${bad.source}): "${bad.say}"`);
  if (shots) await page.screenshot({ path: `${shots}/pendulum-${variant}-flag.png` });
  await page.click('#undo');
  for (const L of [0.3, 0.45, 0.6, 0.8, 1.0]) {
    await timeSwings(L, 20);
    await page.click('#record');
    await partner(page);
  }
  const r = await rows(page);
  check(r.length === 5 && r.every((x) => x.issues.length === 0), `5 clean readings: ${r.map((x) => `${x.L}m ${x.t}s`).join(', ')}`);
  if (shots) await page.screenshot({ path: `${shots}/pendulum-${variant}-readings.png` });
  const out = await analyse(page, { y: 'T2', x: 'L', formula: 'a', unit: 'm/s²', precautions: ['small_angle', 'count_zero'], conclusion: 0 }, `pendulum-${variant}`);
  check(out.pct < 5, `g = ${out.answer.toFixed(3)} (${out.pct.toFixed(2)}% error), mark ${out.total}; partner (${out.final.source}): "${out.final.say}"`);
  await page.close();
}

async function refraction() {
  console.log('refraction-glass-block');
  const page = await open('refraction-glass-block');
  const top = 1.05, bottom = 0.45, ex = -0.3, n = 1.52;
  let seed = 5;
  const jit = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5) * 0.012;
  const reading = async (iDeg, yaw = 0) => {
    const i = iDeg * DEG, r = Math.asin(Math.sin(i) / n);
    const xx = ex + Math.tan(r) * (top - bottom);
    const pins = [[ex - Math.sin(i) * 0.25, top + Math.cos(i) * 0.25], [ex - Math.sin(i) * 0.65, top + Math.cos(i) * 0.65], [xx + Math.sin(i) * 0.15, bottom - Math.cos(i) * 0.15], [xx + Math.sin(i) * 0.5, bottom - Math.cos(i) * 0.5]].map(([x, y]) => [x + jit(), y + jit()]);
    await page.evaluate(([a, pins, yaw]) => { const d = window.__bench.driver.bot; d.angle(a); for (const [x, y] of pins) d.pin(x, y); window.__bench.stage.orbit.yaw = yaw; window.__bench.stage.orbit.pitch = 0; }, [iDeg, pins, yaw]);
    await page.waitForTimeout(250);
    if (shots && iDeg === 40) await page.screenshot({ path: `${shots}/refraction-pins.png` });
    await page.click('#record');
    return partner(page);
  };
  const bad = await reading(45, 0.9);
  check((await rows(page))[0].issues.includes('parallax'), `side-on reading flagged as parallax; partner (${bad.source}): "${bad.say}"`);
  await page.click('#undo');
  for (const a of [15, 30, 40, 55, 70]) await reading(a);
  const r = await rows(page);
  check(r.length === 5 && r.every((x) => x.issues.length === 0), `5 clean readings: ${r.map((x) => `i=${x.i} r=${x.r}`).join(', ')}`);
  const out = await analyse(page, { y: 'sini', x: 'sinr', formula: 'a', unit: '(no unit)', precautions: ['eye_level', 'pins_apart'], conclusion: 0 }, 'refraction');
  check(out.pct < 5, `n = ${out.answer.toFixed(3)} (${out.pct.toFixed(2)}% error), mark ${out.total}; partner (${out.final.source}): "${out.final.say}"`);
  await page.close();
}

async function ohm() {
  console.log('ohms-law');
  const page = await open('ohms-law');
  if (shots) await page.screenshot({ path: `${shots}/ohm-tray.png` });
  // drag one component from the tray to its place with the mouse, then place the rest
  await page.evaluate(() => window.__bench.driver.bot.placeAll());
  await page.waitForTimeout(300);
  await page.click('#record');
  const bad = await partner(page);
  check((await rows(page))[0].issues.includes('switch_open'), `open-switch reading flagged; partner (${bad.source}): "${bad.say}"`);
  await page.click('#undo');
  await page.evaluate(() => window.__bench.driver.bot.setSwitch(1));
  for (const v of [0.96, 0.7, 0.5, 0.32, 0.16, 0.04]) {
    await page.evaluate((v) => window.__bench.driver.bot.rheostat(v), v);
    await page.waitForTimeout(150);
    await page.click('#record');
    await partner(page);
  }
  const r = await rows(page);
  check(r.length === 6 && r.every((x) => x.issues.length === 0), `6 clean readings: ${r.map((x) => `${x.V.toFixed(1)}V ${x.I.toFixed(2)}A`).join(', ')}`);
  if (shots) await page.screenshot({ path: `${shots}/ohm-readings.png` });
  const out = await analyse(page, { y: 'V', x: 'I', formula: 'a', unit: 'Ω', precautions: ['open_switch', 'tight'], conclusion: 0 }, 'ohm');
  check(out.pct < 5, `R = ${out.answer.toFixed(3)} (${out.pct.toFixed(2)}% error), mark ${out.total}; partner (${out.final.source}): "${out.final.say}"`);
  await page.close();
}

if (!only || only === 'pendulum-g') await pendulum('earth');
if (!only || only === 'moon') await pendulum('moon');
if (!only || only === 'refraction-glass-block') await refraction();
if (!only || only === 'ohms-law') await ohm();
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll practical checks passed');
process.exit(failed ? 1 : 0);
