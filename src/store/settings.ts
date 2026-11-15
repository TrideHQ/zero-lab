// Device-local settings. No account, nothing leaves the browser.
export interface Settings {
  board: string;
  locale: string;
  lite: 'auto' | 'on' | 'off';
  text: number;
  sound: boolean;
  narration: boolean;
  picked: boolean;
}

const KEY = 'zero-lab:settings:v1';
const DEFAULTS: Settings = { board: 'international', locale: 'en', lite: 'auto', text: 1, sound: true, narration: false, picked: false };

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export function settings(): Settings {
  if (cache) return cache;
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    saved = {};
  }
  cache = { ...DEFAULTS, ...saved };
  // URL overrides (testing, demos, shared links): ?board=ap&lang=fr&lite=1
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('board')) { cache.board = q.get('board')!; cache.picked = true; }
    if (q.get('lang')) cache.locale = q.get('lang')!;
    if (q.get('lite')) cache.lite = q.get('lite') === '1' ? 'on' : 'off';
  } catch { /* no location */ }
  return cache;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  cache = { ...settings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch { /* private mode: keep in memory */ }
  listeners.forEach((f) => f(cache!));
  return cache;
}

export function onSettings(f: (s: Settings) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Lite mode: diagrams first, 3D on tap, no bloom. Auto-on for low-memory devices and slow links. */
export function isLite(): boolean {
  const s = settings();
  if (s.lite !== 'auto') return s.lite === 'on';
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return true;
  if (nav.connection?.saveData) return true;
  if (nav.connection?.effectiveType && /(^|-)2g|3g/.test(nav.connection.effectiveType)) return true;
  return false;
}
