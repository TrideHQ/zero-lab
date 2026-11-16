// Records the demo clips (browser, curriculum switching, practical, Moon, VR
// and AR in the emulator) with Playwright, then joins them with ffmpeg.
//   API_TARGET=https://managerx.xyz npm run dev     (so the lab partner is the live AI)
//   node scripts/record-demo.mjs [outDir]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'demo';
const base = process.env.BASE ?? 'http://localhost:5173';
if (!process.env.ONLY) rmSync(`${out}/raw`, { recursive: true, force: true });
mkdirSync(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const size = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
async function clip(name, url, run, viewport = size) {
  if (only.length && !only.some((o) => name.startsWith(o))) return;
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: `${out}/raw`, size: viewport } });
  const page = await ctx.newPage();
  await page.goto(base + url);
  await page.addStyleTag({ content: '#cap{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;background:#ffb347;color:#2a1600;font:700 22px Inter,system-ui,sans-serif;padding:10px 22px;border-radius:999px;box-shadow:0 6px 30px rgba(0,0,0,.5);max-width:92%;text-align:center;pointer-events:none}#cap:empty{display:none}' });
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'cap'; document.body.append(d); });
  if (viewport.height > 720) await page.addStyleTag({ content: '#cap{bottom:auto;top:' + (name === '5-vr' ? 348 : 70) + 'px}' }); // keep the caption inside the cropped headset view
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
  await p.click('.hero a.btn.primary');
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

// The headset clip is rendered offline, one frame at a time on a virtual clock, so it plays at
// true speed however slowly the software renderer runs here.
const VIRTUAL_CLOCK = `(() => { let now = 0, auto = true, id = 0; const q = new Map(); const real = window.requestAnimationFrame.bind(window);
  const run = (ms) => { now += ms; const cbs = [...q.values()]; q.clear(); for (const cb of cbs) { try { cb(now); } catch (e) { console.error(e); } } };
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); return id; }; window.cancelAnimationFrame = (i) => q.delete(i);
  performance.now = () => now;
  const pump = () => { if (auto) run(16.7); real(pump); }; real(pump);
  window.__vt = { step: run, auto: (v) => { auto = v; } }; })();`;
if (!only.length || only.some((o) => '5-vr'.startsWith(o))) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const p = await ctx.newPage();
  await p.addInitScript(VIRTUAL_CLOCK);
  await p.goto(base + '/?board=international&partner=rules&iwer=glasses#/t/refraction');
  await p.addStyleTag({ content: '#cap{position:fixed;left:50%;top:348px;transform:translateX(-50%);z-index:99999;background:#ffb347;color:#2a1600;font:700 22px Inter,system-ui,sans-serif;padding:10px 22px;border-radius:999px;max-width:92%;text-align:center;pointer-events:none}#cap:empty{display:none}' });
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'cap'; document.body.append(d); });
  const cap = (t) => p.evaluate((t) => { document.getElementById('cap').textContent = t; }, t);
  await p.waitForSelector('#enter-vr'); await p.click('#enter-vr');
  await p.waitForFunction(() => window.__xrc?.state().placed, null, { polling: 200, timeout: 30000 });
  await p.evaluate(() => {
    window.__vt.auto(false);
    window.__demo = { target: null, pinch: 0, head: [0, 0, 0, 1] };
    window.__demoAct = () => {
      const d = window.__demo, dev = window.__xr, hand = dev.hands.right, c = window.__xrc;
      if (d.target) { const q = c.hands[1].pinchPos; hand.position.x += (d.target[0] - q.x) * 0.3; hand.position.y += (d.target[1] - q.y) * 0.3; hand.position.z += (d.target[2] - q.z) * 0.3; }
      if (Math.abs(hand.pinchValue - d.pinch) > 0.01) hand.setPinchValueImmediate(d.pinch);
      const h = dev.quaternion, k = 0.12;
      h.set(h.x + (d.head[0] - h.x) * k, h.y + (d.head[1] - h.y) * k, h.z + (d.head[2] - h.z) * k, h.w + (d.head[3] - h.w) * k).normalize();
    };
  });
  const dir = `${out}/raw/vrframes`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  let n = 0;
  const frames = async (count) => { for (let i = 0; i < count; i++) { await p.evaluate(() => { window.__demoAct(); window.__vt.step(1000 / 30); }); await p.screenshot({ path: `${dir}/${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88, clip: { x: 0, y: 335, width: 1280, height: 720 } }); } };
  const set = (patch) => p.evaluate((patch) => Object.assign(window.__demo, patch), patch);
  const aimPoint = (expr) => p.evaluate((expr) => { const c = window.__xrc, st = c.state(); const w = new Function('c', 'return ' + expr)(c); if (!w) return null; const sh = [st.head[0] + 0.17, st.head[1] - 0.22, st.head[2]], d = w.map((v, i) => v - sh[i]), len = Math.hypot(...d); return sh.map((v, i) => v + (d[i] / len) * 0.36); }, expr);
  const pinchButton = async (id, lead = 26, after = 20) => { const t = await aimPoint(`c.buttonWorld(${JSON.stringify(id)})`); if (!t) return; await set({ target: t, pinch: 0 }); await frames(lead); await set({ pinch: 1 }); await frames(5); await set({ pinch: 0 }); await frames(after); };
  await cap('Meta VR Glasses profile: seated, hands only, everything inside the field of view');
  await frames(50);
  await pinchButton('next', 30, 34);
  await cap('Point and pinch the panels. Pinch and drag the apparatus.');
  const grab = await aimPoint('(() => { const t = window.__stage.template, w = t.group.localToWorld(t.handles()[0].pos.clone()); return [w.x, w.y, w.z]; })()');
  await set({ target: grab, pinch: 0 }); await frames(30);
  await set({ pinch: 1 }); await frames(8);
  for (let i = 1; i <= 45; i++) { await set({ target: [grab[0] - 0.055 * (i / 45), grab[1] - 0.035 * (i / 45), grab[2]] }); await frames(1); }
  for (let i = 1; i <= 40; i++) { await set({ target: [grab[0] - 0.055 + 0.085 * (i / 40), grab[1] - 0.035 + 0.045 * (i / 40), grab[2]] }); await frames(1); }
  await set({ pinch: 0 }); await frames(16);
  await cap('Or just look at a button and pinch.');
  const look = await p.evaluate(() => { const c = window.__xrc, st = c.state(), w = c.buttonWorld('next'); const d = [w[0] - st.head[0], w[1] - st.head[1], w[2] - st.head[2]]; const yaw = Math.atan2(-d[0], -d[2]), pitch = Math.atan2(d[1], Math.hypot(d[0], d[2])); const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2); return [cy * sp, sy * cp, -sy * sp, cy * cp]; });
  await set({ target: [0.3, 1.0, -0.26], pinch: 0 }); await frames(14);
  await set({ head: look }); await frames(40);
  await set({ pinch: 1 }); await frames(6); await set({ pinch: 0 }); await frames(26);
  await set({ head: [0, 0, 0, 1] }); await frames(30);
  await cap('The whole practical works from the headset panels too.');
  await p.evaluate(() => { window.__vt.auto(true); location.hash = '#/p/ohms-law'; });
  await p.waitForFunction(() => window.__xrc.state().buttons.includes('place-next'), null, { polling: 200, timeout: 30000 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__vt.auto(false));
  await frames(24);
  for (let i = 0; i < 6; i++) await pinchButton('place-next', i === 0 ? 24 : 12, 8);
  await frames(10);
  await pinchButton('switch', 22, 16);
  await pinchButton('record', 22, 45);
  await ctx.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', `${out}/raw/5-vr.mp4`]);
  console.log('clip 5-vr', n, 'frames rendered offline =', (n / 30).toFixed(1), 's at true speed');
}

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
// Normalise the screen-recorded clips to 1280x720 30 fps at real speed, lay each section's narration
// over it (the picture holds on its last frame if the voice runs longer), join, then add the music
// bed, ducked under the voice.
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const names = ['1-home', '2-topic', '3-practical', '4-moon', '5-vr', '6-ar'];
const vo = process.env.VO ?? `${out}/vo`, music = process.env.MUSIC ?? `${out}/music.wav`;
for (const name of names) {
  if (name !== '5-vr') execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/raw/${name}.webm`, '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0a1230,fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-an', `${out}/raw/${name}.mp4`]);
  const v = dur(`${out}/raw/${name}.mp4`), a = dur(`${vo}/${name}.wav`) + 0.9;
  const total = Math.max(v, a);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/raw/${name}.mp4`, '-i', `${vo}/${name}.wav`, '-filter_complex', `[0:v]tpad=stop_mode=clone:stop_duration=${Math.max(0, total - v).toFixed(2)}[v];[1:a]adelay=500|500,apad,aresample=44100,pan=stereo|c0=c0|c1=c0[a]`, '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', `${out}/raw/${name}-av.mp4`]);
  console.log(name, 'video', v.toFixed(1), 's, voice', (a - 0.9).toFixed(1), 's');
}
writeFileSync(`${out}/raw/list.txt`, names.map((n) => `file '${n}-av.mp4'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${out}/raw/list.txt`, '-c', 'copy', `${out}/raw/joined.mp4`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/raw/joined.mp4`, '-i', music, '-filter_complex', '[0:a]asplit=2[voice][key];[1:a]volume=0.8[m];[m][key]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=500[duck];[voice][duck]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${out}/zero-lab-demo.mp4`]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '36', '-i', `${out}/zero-lab-demo.mp4`, '-frames:v', '1', '-q:v', '3', `${out}/zero-lab-thumb.jpg`]);
console.log(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name', '-of', 'default=nw=1', `${out}/zero-lab-demo.mp4`]).toString());
