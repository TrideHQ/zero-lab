#!/usr/bin/env bash
# Optional narration: renders one audio clip per card with Kokoro TTS into
# public/vo/<slug>-<card>.wav and writes public/vo/manifest.json.
# Not run as part of the build. Needs: npm i -D kokoro-js   (downloads the model on first use)
set -euo pipefail
cd "$(dirname "$0")/.."
VOICE="${VOICE:-af_heart}"
node --input-type=module - "$VOICE" <<'JS'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';
const voice = process.argv[2];
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8' });
mkdirSync('public/vo', { recursive: true });
const manifest = {};
for (const dir of ['physics', 'moon']) {
  for (const f of readdirSync(`content/${dir}`).filter((f) => f.endsWith('.json'))) {
    const t = JSON.parse(readFileSync(`content/${dir}/${f}`, 'utf8'));
    for (let i = 0; i < t.cards.length; i++) {
      const audio = await tts.generate(`${t.cards[i].title.en}. ${t.cards[i].text.en}`, { voice });
      const name = `${t.slug}-${i}.wav`;
      await audio.save(`public/vo/${name}`);
      manifest[`${t.slug}-${i}`] = name;
      console.log(name);
    }
  }
}
writeFileSync('public/vo/manifest.json', JSON.stringify(manifest));
JS
