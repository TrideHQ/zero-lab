// Optional pre-rendered narration per card (public/vo/<slug>-<card>.ogg, listed
// in public/vo/manifest.json). The card text is always on screen, so audio is
// never the only way to get the content.
let manifest: Record<string, string> | null | undefined;
let audio: HTMLAudioElement | null = null;

async function load(): Promise<Record<string, string> | null> {
  if (manifest !== undefined) return manifest;
  try {
    const r = await fetch('/vo/manifest.json');
    manifest = r.ok ? await r.json() : null;
  } catch {
    manifest = null;
  }
  return manifest ?? null;
}

export async function narrate(slug: string, card: number) {
  stopNarration();
  const m = await load();
  const file = m?.[`${slug}-${card}`];
  if (!file) return;
  audio = new Audio('/vo/' + file);
  audio.play().catch(() => { /* autoplay blocked until the first tap */ });
}

export function stopNarration() {
  audio?.pause();
  audio = null;
}
