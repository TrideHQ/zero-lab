// Generates the demo's music bed: a soft four-chord pad with a slow arpeggio.
// Synthesised here from sine partials, so it is original work, released CC0.
//   node scripts/demo/music.mjs out.wav [seconds]
import { writeFileSync } from 'node:fs';
const [out = 'music.wav', secs = '180'] = process.argv.slice(2);
const SR = 44100, N = Math.floor(Number(secs) * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]]; // Am7, Fmaj7, C, G
const BAR = 6.4;
for (let i = 0; i < N; i++) {
  const t = i / SR, bar = Math.floor(t / BAR), u = (t % BAR) / BAR;
  const ch = chords[bar % 4];
  const env = Math.min(1, u / 0.25) * Math.min(1, (1 - u) / 0.2); // slow swell in and out of each bar
  let l = 0, r = 0;
  ch.forEach((m, k) => {
    const f = hz(m), det = 1 + 0.0015 * (k - 1.5);
    const a = Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * det * t) * 0.35 + Math.sin(2 * Math.PI * f * 2 * t) * 0.07;
    const pan = k / 3;
    l += a * (1 - pan * 0.6);
    r += a * (0.4 + pan * 0.6);
  });
  l += Math.sin(2 * Math.PI * hz(ch[0] - 12) * t) * 0.9; // bass
  r += Math.sin(2 * Math.PI * hz(ch[0] - 12) * t) * 0.9;
  // arpeggio: one soft bell per half second
  const step = Math.floor(t / 0.8), su = (t % 0.8), note = hz(ch[step % 4] + 12);
  const bell = Math.sin(2 * Math.PI * note * t) * Math.exp(-su * 4.5) * 0.55;
  l += bell * (step % 2 ? 0.4 : 1);
  r += bell * (step % 2 ? 1 : 0.4);
  const trem = 0.9 + 0.1 * Math.sin(2 * Math.PI * 0.15 * t);
  const fade = Math.min(1, t / 3) * Math.min(1, (Number(secs) - t) / 4);
  L[i] = l * env * trem * fade * 0.085;
  R[i] = r * env * trem * fade * 0.085;
}
// simple feedback delay for a little space
const D = Math.floor(0.31 * SR);
for (let i = D; i < N; i++) { L[i] += R[i - D] * 0.28; R[i] += L[i - D] * 0.28; }
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-1, Math.min(1, L[i])) * 32767, 44 + i * 4);
  buf.writeInt16LE(Math.max(-1, Math.min(1, R[i])) * 32767, 46 + i * 4);
}
writeFileSync(out, buf);
console.log(`music bed: ${out}, ${secs} s`);
