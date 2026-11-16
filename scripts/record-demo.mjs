// Records the demo (v3): a full-screen hologram opening, the AP curriculum as the case study, a
// practical in the browser, the Moon module, a hands-only headset practical and phone AR. Clips are
// 1920x1080. The headset clip is rendered frame by frame on a virtual clock so it plays at true speed.
//   API_TARGET=<live site> npm run dev        (so the lab partner is the live AI)
//   GPU=1 VO=<narration dir> MUSIC=<music.wav> node scripts/record-demo.mjs [outDir]     ONLY=5 re-records one clip
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'demo';
const base = process.env.BASE ?? 'http://localhost:5173';
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const want = (name) => !only.length || only.some((o) => name.startsWith(o));
if (!only.length) rmSync(`${out}/raw`, { recursive: true, force: true });
mkdirSync(`${out}/raw`, { recursive: true });
// GPU=1: headless Chrome through ANGLE on Vulkan (on a bare CUDA image: apt install libgl1 libglx0 libegl1
// libx11-6 libxext6 and VK_ICD_FILENAMES=/etc/vulkan/icd.d/nvidia_icd.json). Otherwise software rendering.
const GPU = process.env.GPU === '1';
const browser = await chromium.launch(GPU
  ? { args: ['--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--no-sandbox'] }
  : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
{
  const probe = await browser.newPage();
  console.log('WebGL renderer:', await probe.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }));
  await probe.close();
}
const W = 1920, H = 1080;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CAP = (top) => `#cap{position:fixed;left:50%;${top ? `top:${top}px` : 'bottom:34px'};transform:translateX(-50%);z-index:99999;background:#1c2233;color:#fff;font:650 30px Inter,system-ui,sans-serif;padding:14px 30px;border-radius:999px;box-shadow:0 10px 40px rgba(0,0,0,.35);max-width:88%;text-align:center;pointer-events:none;border:2px solid #f5a53a}#cap:empty{display:none}`;

async function clip(name, url, run) {
  if (!want(name)) return;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: `${out}/raw`, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  await page.goto(base + url);
  await page.addStyleTag({ content: CAP(0) });
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'cap'; document.body.append(d); });
  page.cap = (text) => page.evaluate((t) => { document.getElementById('cap').textContent = t; }, text);
  await run(page);
  const video = page.video();
  await ctx.close();
  renameSync(await video.path(), `${out}/raw/${name}.webm`);
  console.log('clip', name);
}
const slide = async (page, sel, to, steps = 24, ms = 55) => {
  const from = Number(await page.$eval(sel, (e) => e.value));
  for (let i = 1; i <= steps; i++) {
    await page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, from + ((to - from) * i) / steps);
    await sleep(ms);
  }
};
// swing the camera around the model (browser clips)
const orbit = (page, from, to, ms) => page.evaluate(async ([from, to, ms]) => {
  const st = window.__stage, t0 = performance.now();
  await new Promise((res) => { const f = () => { const k = Math.min(1, (performance.now() - t0) / ms), e = k * k * (3 - 2 * k); st.orbit.yaw = from + (to - from) * e; k < 1 ? requestAnimationFrame(f) : res(); }; f(); });
}, [from, to, ms]);

await clip('0-intro', '/?board=ap#/t/refraction?c=3', async (p) => {
  // the 3D stage fills the screen for the opening
  await p.addStyleTag({ content: '.viewport{position:fixed!important;inset:0!important;z-index:500!important;height:auto!important;border:0!important;border-radius:0!important}.viewport::before,.viewport::after,.hint{display:none!important}#title{position:fixed;inset:0;z-index:600;display:grid;place-items:center;pointer-events:none;text-align:center;color:#fff;font-family:Inter,system-ui,sans-serif;transition:opacity 1.2s}#title h1{font-size:150px;margin:0;letter-spacing:-.04em;text-shadow:0 8px 60px rgba(0,0,0,.6)}#title p{font-size:38px;margin:14px 0 0;color:#cfe6ff}#title sup{color:#36e3ff;font-size:.5em}' });
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'title'; d.innerHTML = '<div><h1>0<sup>0</sup> Lab</h1><p>Every science topic, in 3D</p></div>'; document.body.append(d); });
  await p.waitForFunction(() => window.__stage?.template);
  await p.evaluate(() => { window.__stage.orbit.zoom = 0.72; });
  void orbit(p, -0.7, 0.5, 4200);
  await sleep(2600);
  await p.evaluate(() => { document.getElementById('title').style.opacity = '0'; });
  await sleep(1700);
  for (const [hash, zoom] of [['#/t/lenses?c=4', 0.7], ['#/t/ohms-law?c=3', 0.78], ['#/t/phases-of-the-moon?c=1', 0.8]]) {
    await p.evaluate((h) => { window.__stage.setTemplate(null); location.hash = h; }, hash);
    await p.waitForFunction(() => window.__stage?.template, null, { timeout: 15000 });
    await p.evaluate((z) => { window.__stage.orbit.zoom = z; }, zoom);
    await orbit(p, -0.5, 0.45, 2600);
  }
});

await clip('1-home', '/?board=international', async (p) => {
  await p.cap('Pick the curriculum you actually study');
  await sleep(4200);
  await p.click('.hero a.btn.primary');
  await sleep(1800);
  await p.click('.board-switch summary');
  await sleep(1500);
  await p.click('.board-switch [data-board="ap"]');
  await p.evaluate(() => document.querySelector('.board-switch').removeAttribute('open'));
  await p.cap('AP Physics 1 and 2: same physics, organised your way');
  await sleep(2600);
  await p.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' })); await sleep(2600);
  await p.evaluate(() => window.scrollTo({ top: 1250, behavior: 'smooth' })); await sleep(2800);
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(1400);
});

await clip('2-topic', '/?board=ap#/t/refraction', async (p) => {
  await p.cap('Short cards drive a live hologram');
  await p.waitForSelector('[data-key="angle"]');
  await sleep(2600);
  await p.click('#next'); await sleep(2000);
  await p.click('#next'); await sleep(1200);
  await slide(p, '[data-key="angle"]', 72); await slide(p, '[data-key="angle"]', 28);
  await p.cap('Slow the light down to see why it bends');
  await p.click('#next'); await sleep(900);
  void orbit(p, 0.22, -0.35, 2600); await sleep(3200);
  await p.evaluate(() => { location.hash = '#/t/lenses?c=2'; });
  await p.waitForSelector('[data-key="u"]');
  await p.cap('Move the object, then slice the lens open');
  await sleep(1200);
  await slide(p, '[data-key="u"]', 0.3, 30); await sleep(600);
  await slide(p, '[data-key="u"]', 0.95, 20);
  await p.click('[data-key="slice"]'); void orbit(p, 0.22, 0.7, 2400); await sleep(3000);
});

await clip('3-practical', '/?board=ap#/p/ohms-law', async (p) => {
  await p.waitForFunction(() => window.__bench?.driver);
  await p.cap('Do the practical yourself');
  await sleep(2200);
  for (let i = 0; i < 6; i++) { await p.click('[data-action="place-next"]'); await sleep(420); }
  await sleep(500);
  await p.click('#record');
  await p.cap('The lab partner spots the slip. It never sets the score.');
  await p.waitForFunction(() => window.__bench.say() !== '…'); await sleep(4200);
  await p.click('#undo');
  await p.click('[data-action="switch"]'); await sleep(900);
  await p.cap('Your readings build the table and the graph');
  for (const v of [0.94, 0.7, 0.5, 0.32, 0.16, 0.04]) {
    await slide(p, '[data-action="rheo"] input', v, 8, 40);
    await p.click('#record');
    await p.waitForFunction(() => window.__bench.say() !== '…'); await sleep(1100);
  }
  await p.click('#analyse'); await sleep(600);
  await p.selectOption('#axis-y', 'V'); await sleep(500); await p.selectOption('#axis-x', 'I'); await sleep(1800);
  await p.evaluate(() => document.querySelector('#analysis').scrollIntoView({ behavior: 'smooth' })); await sleep(900);
  await p.check('input[name=formula][value=a]'); await p.selectOption('#unit', 'Ω');
  await p.check('input[value=open_switch]'); await p.check('input[value=tight]'); await p.check('input[name=conclusion][value="0"]');
  await sleep(1100);
  await p.click('#finish'); await p.waitForSelector('#marksheet');
  await p.evaluate(() => document.querySelector('#marksheet').scrollIntoView({ behavior: 'smooth' }));
  await p.cap('Scored on lab skills, the AP way. Computed in code.');
  await sleep(5600);
});

await clip('4-moon', '/?board=ap#/t/hammer-and-feather', async (p) => {
  await p.waitForSelector('[data-key="drop"]');
  await p.cap('On Earth, the feather takes its time…');
  await p.click('[data-key="drop"]'); await sleep(3600);
  await p.cap('…on the Moon, they land together');
  await p.click('[data-key="gravity"][data-value="moon"]'); await sleep(700);
  await p.click('[data-key="drop"]'); void orbit(p, 0.25, -0.3, 3000); await sleep(3500);
  await p.evaluate(() => { location.hash = '#/t/laser-to-the-moon?c=2'; });
  await p.waitForSelector('[data-key="fire"]');
  await p.cap('Bounce a laser off the Moon: 2.56 seconds there and back');
  await sleep(1100); await p.click('[data-key="fire"]'); await sleep(4400);
  await p.evaluate(() => { location.hash = '#/t/phases-of-the-moon'; });
  await p.waitForSelector('[data-key="phase"]');
  await p.cap('');
  await sleep(600); await slide(p, '[data-key="phase"]', 300, 50, 60); await sleep(400);
});

// ---- headset clip: offline, one frame at a time on a virtual clock ----
const VIRTUAL_CLOCK = `(() => { let now = 0, auto = true, id = 0; const q = new Map(); const real = window.requestAnimationFrame.bind(window);
  const run = (ms) => { now += ms; const cbs = [...q.values()]; q.clear(); for (const cb of cbs) { try { cb(now); } catch (e) { console.error(e); } } };
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); return id; }; window.cancelAnimationFrame = (i) => q.delete(i);
  performance.now = () => now;
  const pump = () => { if (auto) run(16.7); real(pump); }; real(pump);
  window.__vt = { step: run, auto: (v) => { auto = v; } }; })();`;
if (want('5-vr')) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1800 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('vr pageerror:', e.message));
  await p.addInitScript(VIRTUAL_CLOCK);
  await p.goto(base + '/?board=ap&partner=rules&iwer=glasses#/t/refraction?c=2');
  await p.addStyleTag({ content: CAP(522) });
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'cap'; document.body.append(d); });
  const cap = (t) => p.evaluate((t) => { document.getElementById('cap').textContent = t; }, t);
  await p.waitForSelector('#enter-vr'); await p.click('#enter-vr');
  await p.waitForFunction(() => window.__xrc?.state().placed, null, { polling: 200, timeout: 30000 });
  await p.evaluate(() => {
    window.__vt.auto(false);
    window.__demo = { target: null, pinch: 0, gain: 0.26 };
    window.__demoAct = () => {
      const d = window.__demo, hand = window.__xr.hands.right, c = window.__xrc;
      if (d.target) { const q = c.hands[1].pinchPos; hand.position.x += (d.target[0] - q.x) * d.gain; hand.position.y += (d.target[1] - q.y) * d.gain; hand.position.z += (d.target[2] - q.z) * d.gain; }
      if (Math.abs(hand.pinchValue - d.pinch) > 0.01) hand.setPinchValueImmediate(d.pinch);
    };
    // world position of a point on the model's plane, or of a named handle
    window.__w = (x, y) => { const st = window.__stage, v = st.root.position.clone().set(x, y, 0); const w = st.template.group.localToWorld(v); return [w.x, w.y, w.z]; };
    window.__hw = (name) => { const st = window.__stage, hd = [...st.template.handles(), ...st.extraHandles].find((x) => x.name === name); if (!hd) return null; const w = st.template.group.localToWorld(hd.pos.clone()); return [w.x, w.y, w.z + 0.01]; };
    window.__xr.hands.left.position.set(-0.24, 0.92, -0.32); // the other hand rests in view
  });
  const dir = `${out}/raw/vrframes`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  let n = 0;
  const frames = async (count) => { for (let i = 0; i < count; i++) { await p.evaluate(() => { window.__demoAct(); window.__vt.step(1000 / 30); }); await p.screenshot({ path: `${dir}/${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90, clip: { x: 0, y: 502, width: 1920, height: 1080 } }); } };
  const set = (patch) => p.evaluate((patch) => Object.assign(window.__demo, patch), patch);
  const world = (expr) => p.evaluate((expr) => new Function('return ' + expr)(), expr);
  const glide = async (from, to, count) => { for (let i = 1; i <= count; i++) { const k = i / count, e = k * k * (3 - 2 * k); await set({ target: from.map((v, j) => v + (to[j] - v) * e) }); await frames(1); } };
  const rayAim = (expr) => p.evaluate((expr) => { const c = window.__xrc, st = c.state(); const w = new Function('c', 'return ' + expr)(c); if (!w) return null; const sh = [st.head[0] + 0.17, st.head[1] - 0.22, st.head[2]], d = w.map((v, i) => v - sh[i]), len = Math.hypot(...d); return sh.map((v, i) => v + (d[i] / len) * 0.36); }, expr);
  const pinchButton = async (id, lead = 24, after = 18) => { const t = await rayAim(`c.buttonWorld(${JSON.stringify(id)})`); if (!t) return; await set({ target: t, pinch: 0 }); await frames(lead); await set({ pinch: 1 }); await frames(5); await set({ pinch: 0 }); await frames(after); };
  let at = [0.2, 1.0, -0.3];
  const reach = async (to, count = 20) => { await glide(at, to, count); at = to; };

  await cap('Hands only. No controllers.');
  await set({ target: at }); await frames(40);
  // grab the ray box itself and swing it round
  const box = await world('__hw("source")');
  await reach(box, 24); await frames(6);
  await set({ pinch: 1 }); await frames(8);
  const up = await world('__w(-0.62, 1.78)'), low = await world('__w(-1.05, 1.32)');
  await glide(box, up, 34); await glide(up, low, 44); at = low;
  await set({ pinch: 0 }); await frames(14);
  await cap('Now build the circuit with your own hands');
  await p.evaluate(() => { window.__vt.auto(true); location.hash = '#/p/ohms-law'; });
  await p.waitForFunction(() => window.__xrc.state().buttons.includes('place-next') && window.__stage.template?.name === 'circuit-board', null, { polling: 200, timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__vt.auto(false));
  await frames(20);
  const slots = { battery: [-1.1, 1.0], switch: [-0.5, 1.45], rheostat: [0.45, 1.45], resistor: [0, 0.55], ammeter: [1.1, 1.0], voltmeter: [0, 0.17] };
  for (const [name, slot] of Object.entries(slots)) {
    const from = await world(`__hw(${JSON.stringify(name)})`);
    if (!from) continue;
    const to = await world(`__w(${slot[0]}, ${slot[1]})`);
    await reach(from, 16); await frames(3);
    await set({ pinch: 1 }); await frames(6);
    await glide(from, to, 24); at = to;
    await set({ pinch: 0 }); await frames(7);
  }
  await cap('Flip the switch, slide the rheostat, take the reading');
  const sw = await world('__hw("switch")');
  if (sw) { await reach(sw, 18); await set({ pinch: 1 }); await frames(6); await set({ pinch: 0 }); await frames(12); }
  for (let k = 0; k < 2; k++) {
    const knob = await world('__hw("rheostat")');
    if (knob) {
      await reach(knob, 16); await set({ pinch: 1 }); await frames(6);
      const to = [knob[0] - 0.016, knob[1], knob[2]];
      await glide(knob, to, 22); at = to;
      await set({ pinch: 0 }); await frames(8);
    }
    await pinchButton('record', 22, 34);
    at = await p.evaluate(() => window.__demo.target);
  }
  await frames(30);
  console.log('vr end state:', JSON.stringify(await p.evaluate(() => ({ placed: window.__bench?.driver.bot.placed(), rows: window.__bench?.engine.rows.length, angle: 0 }))));
  await ctx.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', `${out}/raw/5-vr.mp4`]);
  console.log('clip 5-vr', n, 'frames rendered offline =', (n / 30).toFixed(1), 's at true speed');
}

if (want('6-ar')) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1800 }, recordVideo: { dir: `${out}/raw`, size: { width: 1920, height: 1800 } } });
  const p = await ctx.newPage();
  await p.goto(base + '/?board=ap&iwer=phone#/t/simple-pendulum');
  await p.addStyleTag({ content: CAP(90) });
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'cap'; document.body.append(d); });
  const cap = (t) => p.evaluate((t) => { document.getElementById('cap').textContent = t; }, t);
  await p.waitForSelector('#enter-ar');
  await cap('Phone AR (emulated here, no camera): tap a surface to place the lab');
  await p.click('#enter-ar');
  await p.waitForFunction(() => window.__xrc?.state().phoneAR);
  await sleep(2200);
  await p.evaluate(() => window.__stage.renderer.domElement.click());
  await sleep(4200);
  await cap('0⁰ Lab · zero-lab.vercel.app');
  await sleep(3200);
  const video = p.video();
  await ctx.close();
  renameSync(await video.path(), `${out}/raw/6-ar.webm`);
  console.log('clip 6-ar');
}
await browser.close();

// ---- edit: real speed, narration per section, music ducked under the voice ----
if (process.env.NO_EDIT !== '1') {
  const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
  const names = ['0-intro', '1-home', '2-topic', '3-practical', '4-moon', '5-vr', '6-ar'];
  const vo = process.env.VO ?? `${out}/vo`;
  for (const name of names) {
    if (name !== '5-vr') execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/raw/${name}.webm`, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xf6f0e2,fps=30`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-an', `${out}/raw/${name}.mp4`]);
    const v = dur(`${out}/raw/${name}.mp4`), a = dur(`${vo}/${name}.wav`) + 0.9;
    const total = Math.max(v, a);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/raw/${name}.mp4`, '-i', `${vo}/${name}.wav`, '-filter_complex', `[0:v]tpad=stop_mode=clone:stop_duration=${Math.max(0, total - v).toFixed(2)}[v];[1:a]adelay=500|500,apad,aresample=44100,pan=stereo|c0=c0|c1=c0[a]`, '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', `${out}/raw/${name}-av.mp4`]);
    console.log(name, 'video', v.toFixed(1), 's, voice', (a - 0.9).toFixed(1), 's');
  }
  writeFileSync(`${out}/raw/list.txt`, names.map((n) => `file '${n}-av.mp4'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${out}/raw/list.txt`, '-c', 'copy', `${out}/raw/joined.mp4`]);
  console.log('joined', dur(`${out}/raw/joined.mp4`).toFixed(1), 's (the music bed is mixed in by scripts/demo/mix.sh)');
}
