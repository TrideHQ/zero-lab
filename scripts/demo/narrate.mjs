// Narration for the demo, one clip per section, with Kokoro TTS (English).
//   npm i --no-save kokoro-js && node scripts/demo/narrate.mjs outDir
import { mkdirSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';
export const LINES = {
  '1-home': 'This is Zero Degrees Lab. Every science topic, in 3D, for students everywhere. One library works with twelve curricula. Switch from International to A P, I G C S E, or WAEC, and the topic names, levels and grouping change. The physics stays the same.',
  '2-topic': 'Each topic is a set of short cards that drive a live hologram. Change the angle, and the refracted ray follows Snell\'s law. Slow the light down to see why it bends. With lenses, move the object, then slice the lens open.',
  '3-practical': 'Then do the practical with your own hands. Build the circuit, and take your own readings. An A I lab partner watches for slips, like reading the meters with the switch open. The table and the graph build live. The slope comes from a least squares fit, and the mark is computed in code. Here it is out of twenty, in the West African style.',
  '4-moon': 'In Moon and Astronauts, drop a hammer and a feather. On Earth, the feather drifts. On the Moon, they land together. Fire a laser at a reflector on the Moon and time the echo. Then watch the phases change.',
  '5-vr': 'In a headset, it is seated and hands only. Point and pinch the panels. Grab the apparatus and drag it. Or just look at a button, and pinch. This is the Meta V R Glasses profile, so everything stays inside the field of view. The whole practical works from here too.',
  '6-ar': 'On an Android phone, the same lab sits on your desk in A R. Zero Degrees Lab.',
};
if (process.argv[1]?.endsWith('narrate.mjs')) {
  const out = process.argv[2] ?? 'demo/vo';
  mkdirSync(out, { recursive: true });
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8' });
  for (const [name, text] of Object.entries(LINES)) {
    const audio = await tts.generate(text, { voice: process.env.VOICE ?? 'af_heart' });
    await audio.save(`${out}/${name}.wav`);
    console.log(name, (audio.audio.length / audio.sampling_rate).toFixed(1) + ' s');
  }
}
