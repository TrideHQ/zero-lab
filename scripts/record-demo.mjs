// Records the demo clips (browser, curriculum switching, practical, Moon, VR
// and AR in the emulator) with Playwright, then joins them with ffmpeg.
//   API_TARGET=https://managerx.xyz npm run dev     (so the lab partner is the live AI)
//   node scripts/record-demo.mjs [outDir]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'demo';
const base = process.env.BASE ?? 'http://localhost:5173';
rmSync(`${out}/raw`, { recursive: true, force: true });
mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const size = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clip(name, url, run, viewport = size) {
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: `${out}/raw`, size: viewport } });
  const page = await ctx.newPage();
  await page.goto(base + url);
  await page.addStyleTag({ content: '#cap{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;background:#ffb347;color:#2a1600;font:700 22px Inter,system-ui,sans-serif;padding:10px 22px;border-radius:999px;box-shadow:0 6px 30px rgba(0,0,0,.5);max-width:92%;text-align:center;pointer-events:none}#cap:empty{display:none}' });
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'cap'; document.body.append(d); });
  page.cap = (text) => page.evaluate((t) => { document.getElementById('cap').textContent = t; }, text);
  await run(page);
  const video = page.video();
  await ctx.close();
  renameSync(await video.path(), `${out}/raw/${name}.webm`);
  console.log('clip', name);
}
const slide = async (page, sel, to, steps = 24, ms = 60) => {
  const from = Number(await page.$eval(sel, (e) => e.value));
  for (let i = 1; i <= steps; i++) {
    await page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, from + ((to - from) * i) / steps);
    await sleep(ms);
  }
};

await clip('1-home', '/?board=international', async (p) => {
  await p.cap('0⁰ Lab: every science topic, in 3D — for students everywhere');
  await sleep(4500);
  await p.click('a[href="#/s/physics"] >> nth=0');
  await sleep(1500);
  await p.cap('One library, twelve curricula. Names, levels and grouping change; the physics does not.');
  await p.click('.board-switch summary');
  for (const b of ['ap', 'igcse', 'waec']) {
    await sleep(1400);
    await p.click(`.board-switch [data-board="${b}"]`);
    await p.evaluate(() => document.querySelector('.board-switch').removeAttribute('open'));
    await sleep(2600);
    if (b !== 'waec') await p.click('.board-switch summary');
  }
  await sleep(800);
});

await clip('2-topic', '/?board=waec#/t/refraction', async (p) => {
  await p.cap('Cards drive the hologram. Drag the ray, change the glass, slow the light down.');
  await p.waitForSelector('[data-key="angle"]');
  await sleep(3000);
  await p.click('#next'); await sleep(2200);
  await p.click('#next'); await sleep(1500);
  await slide(p, '[data-key="angle"]', 72); await slide(p, '[data-key="angle"]', 25);
  await p.click('#next'); await sleep(3500);
  await p.cap('Quick checks: point at the part on the model.');
  await p.click('#next'); await sleep(2500);
  await p.evaluate(() => { location.hash = '#/t/lenses?c=2'; });
  await p.waitForSelector('[data-key="u"]');
  await p.cap('Lenses: move the object, then slice the lens open.');
  await sleep(1500);
  await slide(p, '[data-key="u"]', 0.3, 30); await sleep(800);
  await slide(p, '[data-key="u"]', 0.95, 20);
  await p.click('[data-key="slice"]'); await sleep(2800);
});

await clip('3-practical', '/?board=waec#/p/ohms-law', async (p) => {
  await p.waitForFunction(() => window.__bench?.driver);
  await p.cap('The practical: build the circuit, take your own readings.');
  await sleep(2500);
  for (let i = 0; i < 6; i++) { await p.click('[data-action="place-next"]'); await sleep(450); }
  await sleep(600);
  await p.cap('An AI lab partner watches your readings. It never sets the mark.');
  await p.click('#record');
  await p.waitForFunction(() => window.__bench.say() !== '…'); await sleep(3800);
  await p.click('#undo');
  await p.click('[data-action="switch"]'); await sleep(900);
  for (const v of [0.94, 0.7, 0.5, 0.32, 0.16, 0.04]) {
    await slide(p, '[data-action="rheo"] input', v, 8, 40);
    await p.click('#record');
    await p.waitForFunction(() => window.__bench.say() !== '…'); await sleep(1300);
  }
  await p.cap('Table and graph build live. Slope by least squares, marked like an exam practical.');
  await p.click('#analyse'); await sleep(600);
  await p.selectOption('#axis-y', 'V'); await sleep(500); await p.selectOption('#axis-x', 'I'); await sleep(1800);
  await p.evaluate(() => document.querySelector('#analysis').scrollIntoView({ behavior: 'smooth' })); await sleep(900);
  await p.check('input[name=formula][value=a]'); await p.selectOption('#unit', 'Ω');
  await p.check('input[value=open_switch]'); await p.check('input[value=tight]'); await p.check('input[name=conclusion][value="0"]');
  await sleep(1200);
  await p.click('#finish'); await p.waitForSelector('#marksheet');
  await p.evaluate(() => document.querySelector('#marksheet').scrollIntoView({ behavior: 'smooth' }));
  await p.cap('WAEC-style mark out of 20. Switch board and the rubric changes with it.');
  await sleep(5500);
});

await clip('4-moon', '/?board=international#/t/hammer-and-feather', async (p) => {
  await p.waitForSelector('[data-key="drop"]');
  await p.cap('Moon & Astronauts: on Earth the feather drifts…');
  await p.click('[data-key="drop"]'); await sleep(3800);
  await p.cap('…on the Moon, hammer and feather land together.');
  await p.click('[data-key="gravity"][data-value="moon"]'); await sleep(700);
  await p.click('[data-key="drop"]'); await sleep(3600);
  await p.evaluate(() => { location.hash = '#/t/laser-to-the-moon?c=2'; });
  await p.waitForSelector('[data-key="fire"]');
  await p.cap('Fire a laser at the Moon: 2.56 s there and back.');
  await sleep(1200); await p.click('[data-key="fire"]'); await sleep(4600);
  await p.evaluate(() => { location.hash = '#/t/phases-of-the-moon'; });
  await p.waitForSelector('[data-key="phase"]');
  await p.cap('Phases of the Moon: move it round its orbit.');
  await sleep(800); await slide(p, '[data-key="phase"]', 330, 60, 70); await sleep(600);
});

await clip('5-vr', '/?board=international&partner=rules&iwer=glasses#/t/refraction', async (p) => {
  await p.waitForSelector('#enter-vr');
  await p.cap('Meta VR Glasses (emulator): seated, hands only, everything inside the field of view');
  await p.click('#enter-vr');
  await p.waitForFunction(() => window.__xrc?.state().placed);
  await sleep(2500);
  const pinchAt = (id) => p.evaluate(async (id) => {
    const c = window.__xrc, hand = window.__xr.hands.right, st = c.state();
    const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); f(); });
    const w = c.buttonWorld(id); if (!w) return;
    const sh = [st.head[0] + 0.17, st.head[1] - 0.22, st.head[2]], d = w.map((v, i) => v - sh[i]), len = Math.hypot(...d);
    const at = sh.map((v, i) => v + (d[i] / len) * 0.36);
    for (let i = 0; i < 14; i++) { await frames(2); const q = c.hands[1].pinchPos; hand.position.x += (at[0] - q.x) * 0.45; hand.position.y += (at[1] - q.y) * 0.45; hand.position.z += (at[2] - q.z) * 0.45; }
    await frames(10); hand.setPinchValueImmediate(1); await frames(8); hand.setPinchValueImmediate(0); await frames(6);
  }, id);
  await pinchAt('next'); await sleep(2200);
  await p.cap('Point and pinch the panel; pinch and drag the apparatus.');
  await pinchAt('next'); await sleep(2200);
  await p.evaluate(async () => {
    const c = window.__xrc, hand = window.__xr.hands.right, st = c.state(), t = window.__stage.template;
    const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); f(); });
    const hw = t.group.localToWorld(t.handles()[0].pos.clone());
    const sh = [st.head[0] + 0.17, st.head[1] - 0.22, st.head[2]], d = [hw.x - sh[0], hw.y - sh[1], hw.z - sh[2]], len = Math.hypot(...d);
    const at = sh.map((v, i) => v + (d[i] / len) * 0.36);
    for (let i = 0; i < 14; i++) { await frames(2); const q = c.hands[1].pinchPos; hand.position.x += (at[0] - q.x) * 0.45; hand.position.y += (at[1] - q.y) * 0.45; hand.position.z += (at[2] - q.z) * 0.45; }
    await frames(8); hand.setPinchValueImmediate(1); await frames(6);
    for (let i = 0; i < 40; i++) { hand.position.x -= 0.0016; hand.position.y -= 0.0012; await frames(2); }
    for (let i = 0; i < 40; i++) { hand.position.x += 0.002; hand.position.y += 0.0005; await frames(2); }
    hand.setPinchValueImmediate(0); await frames(6);
  });
  await sleep(1500);
  await p.cap('The whole practical works from the headset panels too.');
  await p.evaluate(() => { location.hash = '#/p/ohms-law'; });
  await p.waitForFunction(() => window.__xrc.state().buttons.includes('place-next'));
  for (let i = 0; i < 6; i++) { await pinchAt('place-next'); }
  await p.waitForFunction(() => window.__xrc.state().buttons.includes('switch'));
  await pinchAt('switch'); await pinchAt('record'); await sleep(2500);
}, { width: 1280, height: 1200 });

await clip('6-ar', '/?board=international&iwer=phone#/t/simple-pendulum', async (p) => {
  await p.waitForSelector('#enter-ar');
  await p.cap('Phone AR (emulated here, no camera): tap a surface to place the lab on your desk');
  await p.click('#enter-ar');
  await p.waitForFunction(() => window.__xrc?.state().phoneAR);
  await sleep(2500);
  await p.evaluate(() => window.__stage.renderer.domElement.click());
  await sleep(4500);
  await p.cap('0⁰ Lab · managerx.xyz');
  await sleep(2500);
}, { width: 1280, height: 1200 });

await browser.close();
// normalise every clip to 1280x720 30 fps (headset clips are cropped to the field of view and sped up:
// software rendering in the emulator runs slower than a real headset), then join
const SPEED = { '1-home': 1.2, '2-topic': 1.3, '3-practical': 1.4, '4-moon': 1.25, '5-vr': 2.6, '6-ar': 1.3 };
const files = readdirSync(`${out}/raw`).filter((f) => f.endsWith('.webm')).sort();
for (const f of files) {
  const name = f.replace('.webm', '');
  const tall = name === '5-vr' || name === '6-ar';
  const vf = `${tall ? 'crop=1280:720:0:390,' : ''}scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0a1230,setpts=PTS/${SPEED[name] ?? 1},fps=30`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/raw/${f}`, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-an', `${out}/raw/${name}.mp4`]);
}
writeFileSync(`${out}/raw/list.txt`, files.map((f) => `file '${f.replace('.webm', '.mp4')}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${out}/raw/list.txt`, '-c', 'copy', '-movflags', '+faststart', `${out}/zero-lab-demo.mp4`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '30', '-i', `${out}/zero-lab-demo.mp4`, '-frames:v', '1', '-q:v', '3', `${out}/zero-lab-thumb.jpg`]);
console.log(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=nw=1', `${out}/zero-lab-demo.mp4`]).toString());
