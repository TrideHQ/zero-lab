import '@fontsource-variable/inter/index.css';
import './style.css';
import { h } from './ui/dom.ts';
import { logo } from './ui/components/logo.ts';
import { firstRunPicker } from './ui/components/picker.ts';
import { route, startRouter, render } from './router.ts';
import { setLocale, t } from './i18n/index.ts';
import { settings, isLite, onSettings } from './store/settings.ts';
import { board } from './topics/loader.ts';

let chip: HTMLElement;

/** Push settings that affect the whole document (text size, lite class, board chip). */
export function applySettings() {
  const s = settings();
  document.documentElement.style.setProperty('--text-scale', String(s.text));
  document.documentElement.classList.toggle('lite', isLite());
  if (chip) chip.textContent = board().name;
  const nav = document.querySelector('.nav');
  if (nav) {
    nav.querySelector('[data-k=home]')!.textContent = t('app.home');
    nav.querySelector('[data-k=progress]')!.textContent = t('app.progress');
    nav.querySelector('[data-k=settings]')!.textContent = t('app.settings');
  }
}

async function boot() {
  const emu = new URLSearchParams(location.search).get('iwer');
  if (import.meta.env.DEV && emu) (await import('./xr/emulator.ts')).installEmulator(emu);
  const s = settings();
  await setLocale(s.locale);
  const app = document.getElementById('app')!;
  chip = h('a.board-chip', { href: '#/settings', id: 'board-chip', title: t('subject.curriculum') }, board().name);
  const main = h('main', { id: 'outlet' });
  app.replaceChildren(
    h('header.topbar',
      h('a.brand', { href: '#/', 'aria-label': '0⁰ Lab' }, logo(22)),
      chip,
      h('nav.nav',
        h('a', { href: '#/', 'data-k': 'home' }, t('app.home')),
        h('a', { href: '#/progress', 'data-k': 'progress' }, t('app.progress')),
        h('a', { href: '#/settings', 'data-k': 'settings' }, t('app.settings')))),
    main);
  applySettings();
  onSettings(applySettings);

  route(/^\/$/, async () => (await import('./ui/home.ts')).default());
  route(/^\/s\/([\w-]+)$/, async (p) => (await import('./ui/subject.ts')).default(p));
  route(/^\/t\/([\w-]+)$/, async (p, q) => (await import('./ui/topic.ts')).default(p, q));
  route(/^\/p\/([\w-]+)$/, async (p, q) => (await import('./ui/bench.ts')).default(p, q));
  route(/^\/progress$/, async () => (await import('./ui/progress.ts')).default());
  route(/^\/settings$/, async () => (await import('./ui/settings.ts')).default());
  startRouter(main);

  if (!s.picked) firstRunPicker(() => void render());

  window.addEventListener('offline', () => document.documentElement.classList.add('offline'));
  window.addEventListener('online', () => document.documentElement.classList.remove('offline'));
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline cache is optional */ });
  }
}

void boot();
