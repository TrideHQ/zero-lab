// Screenshot helper: node scripts/snap.mjs <out.png> <url-or-hash> [--mobile] [--wait=ms] [--click=sel,sel] [--eval=js]
import { chromium, devices } from 'playwright';
const [out, target, ...flags] = process.argv.slice(2);
const flag = (n) => flags.find((f) => f.startsWith(`--${n}`))?.split('=').slice(1).join('=');
const base = process.env.BASE ?? 'http://localhost:5173';
const url = target.startsWith('http') ? target : base + '/' + (target.startsWith('?') ? target : '?board=international' + target);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(flags.includes('--mobile') ? { ...devices['Pixel 7'] } : { viewport: { width: 1366, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(flag('wait') ?? 2500));
for (const sel of (flag('click') ?? '').split(',').filter(Boolean)) {
  await page.click(sel, { timeout: 5000 }).catch((e) => errors.push(`click ${sel}: ${e.message.split('\n')[0]}`));
  await page.waitForTimeout(900);
}
if (flag('eval')) console.log('eval:', JSON.stringify(await page.evaluate(flag('eval')).catch((e) => 'ERR ' + e.message)));
await page.screenshot({ path: out, fullPage: flags.includes('--full') });
console.log(out, errors.length ? '\n' + errors.join('\n') : 'no errors');
await browser.close();
