// Pre-renders every "generated" diagram to public/img/gen/<slug>-<n>.webp using
// the real 3D templates in a headless browser, so the image panel (and Lite
// mode) can show diagrams without loading the 3D engine.
//   1. start the dev server:  npm run dev
//   2. node scripts/render-diagrams.ts            (BASE=http://localhost:5173 by default)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { buildContent } from './content.ts';

const base = process.env.BASE ?? 'http://localhost:5173';
const out = join(process.cwd(), 'public/img/gen');
mkdirSync(out, { recursive: true });
const built = buildContent();
if (built.errors.length) {
  console.error(built.errors.join('\n'));
  process.exit(1);
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto(`${base}/?board=international`);
await page.waitForSelector('.home');
let n = 0, bytes = 0;
for (const [path, body] of Object.entries(built.files)) {
  if (!path.startsWith('content/')) continue;
  const topic = JSON.parse(body);
  for (let i = 0; i < topic.images.length; i++) {
    const im = topic.images[i];
    if (im.type !== 'generated') continue;
    const spec = { template: im.template ?? topic.model.template, preset: im.preset ?? topic.model.preset, params: topic.model.params, state: im.state };
    const url: string = await page.evaluate(async (spec) => {
      const m = await import('/src/templates/diagram.ts' as string);
      return m.renderDiagram(spec);
    }, spec);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    writeFileSync(join(out, `${topic.slug}-${i}.webp`), buf);
    n++;
    bytes += buf.length;
  }
}
await browser.close();
console.log(`Rendered ${n} diagrams to public/img/gen (${Math.round(bytes / 1024)} KB in total).`);
