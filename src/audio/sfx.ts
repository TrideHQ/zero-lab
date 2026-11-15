// Tiny synthesised UI sounds (no audio files to download).
import { settings } from '../store/settings.ts';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!settings().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, to: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
  const a = ac();
  if (!a || a.state !== 'running') return;
  const o = a.createOscillator(), g = a.createGain();
  const t0 = a.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export type Sfx = 'step' | 'good' | 'bad' | 'hum' | 'tick' | 'record';

export function blip(kind: Sfx) {
  if (kind === 'step') tone(660, 880, 0.08, 0.05);
  else if (kind === 'good') { tone(660, 660, 0.1, 0.06); tone(990, 990, 0.16, 0.06, 'sine', 0.09); }
  else if (kind === 'bad') tone(240, 180, 0.2, 0.06, 'triangle');
  else if (kind === 'hum') tone(90, 220, 0.9, 0.05, 'sawtooth');
  else if (kind === 'tick') tone(1200, 1200, 0.03, 0.04, 'square');
  else if (kind === 'record') tone(520, 780, 0.12, 0.06, 'triangle');
}
