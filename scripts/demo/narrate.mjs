// Narration for the demo, one clip per section, with Kokoro TTS (English). Written the way a person
// would talk a friend through it: contractions, short sentences, a little surprise.
//   npm i --no-save kokoro-js && node scripts/demo/narrate.mjs outDir
import { mkdirSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';
export const LINES = {
  '0-intro': "Okay, picture this. Your physics book, except everything in it is a hologram you can grab.",
  '1-home': "This is Zero Degrees Lab. First, you pick the curriculum you're actually studying. Let's go with A P Physics. And look, the whole library rearranges itself into A P units. Same physics, just organised your way.",
  '2-topic': "Open a topic and you get a few short cards, and a model that really moves. Tilt the ray, and watch it bend. Wondering why? Slow the light right down. And with a lens, you can literally slice it open.",
  '3-practical': "Then comes my favourite part. You do the practical yourself. Drop the parts on the board and take a reading. Oops. I left the switch open, and my lab partner caught it straight away. So, close it, take real readings, and the table and graph fill in as you go. Pick your axes, and you get scored on lab skills, the way A P does it.",
  '4-moon': "There's a Moon module too. Remember the hammer and the feather? On Earth, the feather takes its time. On the Moon, they hit the ground together. You can even bounce a laser off the Moon, and time it.",
  '5-vr': "Now put on a headset, and it gets real. Those are your hands. No controllers. Reach out, grab the ray box, and swing it round. Then build the circuit. Pick up the battery and put it on the board. Then the switch, the resistor, the meters. Flip the switch, slide the rheostat, and take your reading. Honestly, it feels like a real bench.",
  '6-ar': "And on a phone, the lab just sits on your desk. That's Zero Degrees Lab. Go build something.",
};
if (process.argv[1]?.endsWith('narrate.mjs')) {
  const out = process.argv[2] ?? 'demo/vo';
  mkdirSync(out, { recursive: true });
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8' });
  for (const [name, text] of Object.entries(LINES)) {
    const audio = await tts.generate(text, { voice: process.env.VOICE ?? 'af_heart', speed: Number(process.env.SPEED ?? 1.04) });
    await audio.save(`${out}/${name}.wav`);
    console.log(name, (audio.audio.length / audio.sampling_rate).toFixed(1) + ' s');
  }
}
