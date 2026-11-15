// All UI strings live in src/locales/<id>.json. English ships in the main
// bundle and is the fallback for any missing key; other locales load on demand.
import en from '../locales/en.json';
import type { Text } from '../types.ts';

type Dict = Record<string, unknown>;
const loaders = import.meta.glob<{ default: Dict }>(['../locales/*.json', '!../locales/en.json']);

export const LOCALES: { id: string; name: string; rtl?: boolean }[] = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'es', name: 'Español' },
  { id: 'pt', name: 'Português' },
  { id: 'ar', name: 'العربية', rtl: true },
  { id: 'hi', name: 'हिन्दी' },
  { id: 'sw', name: 'Kiswahili' },
  { id: 'zh', name: '中文' },
];

let locale = 'en';
let dict: Dict = en as Dict;

const get = (d: Dict, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Dict)[k] : undefined), d);

/** Translate a UI key. Falls back to English, then to the key itself. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = get(dict, key);
  if (typeof s !== 'string') s = get(en as Dict, key);
  if (typeof s !== 'string') return key;
  return (s as string).replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ''));
}

/** Pick the current locale from a content text field, falling back to English. */
export function L(f: Text | undefined | null): string {
  if (!f) return '';
  return f[locale] ?? f.en ?? '';
}

export function getLocale(): string {
  return locale;
}

export async function setLocale(id: string): Promise<void> {
  const meta = LOCALES.find((l) => l.id === id) ?? LOCALES[0];
  locale = meta.id;
  dict = en as Dict;
  const load = loaders[`../locales/${locale}.json`];
  if (locale !== 'en' && load) {
    try {
      dict = (await load()).default;
    } catch {
      dict = en as Dict;
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    document.documentElement.dir = meta.rtl ? 'rtl' : 'ltr';
  }
}

/** Locale-aware number formatting with a fixed number of decimal places. */
export function num(n: number, dp?: number): string {
  if (!Number.isFinite(n)) return '–';
  try {
    return new Intl.NumberFormat(locale, dp === undefined ? { maximumFractionDigits: 3 } : { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
  } catch {
    return dp === undefined ? String(n) : n.toFixed(dp);
  }
}
