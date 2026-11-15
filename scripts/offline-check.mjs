// Offline test against a production build: open 6 topics, go offline, reload.
// The last 5 must still open (text, diagrams and 3D); the oldest one must have been dropped.
import { chromium } from 'playwright';
const base = process.env.BASE ?? 'https://managerx.xyz';
const topics = ['reflection', 'refraction', 'lenses', 'ohms-law', 'simple-pendulum', 'hammer-and-feather'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
await page.goto(`${base}/?board=international`);
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 }).catch(() => {});
check(await page.evaluate(() => !!navigator.serviceWorker?.controller), 'service worker is in control of the page');
for (const t of topics) {
  await page.goto(`${base}/?board=international#/t/${t}`);
  await page.waitForSelector('.card-body h2');
  await page.waitForFunction(() => window.__stage?.template, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(9000); // let the worker finish storing files
const cached = await page.evaluate(async () => { const c = await caches.open('zero-lab-topics-v1'); return (await c.keys()).map((r) => new URL(r.url).pathname).filter((p) => p.startsWith('/content/')); });
check(cached.length === 5 && !cached.some((p) => p.includes('/reflection.json')), `topic cache holds the last 5 topics and dropped the oldest: ${cached.map((p) => p.split('/').pop().replace('.json', '')).join(', ')}`);
await ctx.setOffline(true);
for (const t of topics.slice(1)) {
  await page.goto(`${base}/?board=international#/t/${t}`).catch(() => {});
  await page.reload().catch(() => {});
  const ok = await page.waitForSelector('.card-body h2', { timeout: 8000 }).then(() => true).catch(() => false);
  const model = ok && (await page.waitForFunction(() => window.__stage?.template, null, { timeout: 10000 }).then(() => true).catch(() => false));
  const img = ok && (await page.evaluate(() => [...document.querySelectorAll('.figure img')].every((i) => i.complete && i.naturalWidth > 0)));
  check(ok && model && img, `offline reload of "${t}": text ${ok ? 'yes' : 'NO'}, 3D ${model ? 'yes' : 'NO'}, diagrams ${img ? 'yes' : 'NO'}`);
}
await page.goto(`${base}/?board=international#/t/reflection`).catch(() => {});
await page.reload().catch(() => {});
await page.waitForTimeout(2500);
const old = await page.evaluate(() => document.querySelector('#outlet')?.textContent ?? '');
check(old.includes('Could not load'), 'a topic that was never cached shows the "could not load" message instead of a blank page');
await page.screenshot({ path: process.argv[2] ?? '/tmp/offline.png' });
await browser.close();
console.log(failed ? `\n${failed} offline check(s) failed` : '\nOffline checks passed');
process.exit(failed ? 1 : 0);
