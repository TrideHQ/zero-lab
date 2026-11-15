import { h } from './dom.ts';
import { boardList } from './components/picker.ts';
import { LOCALES, setLocale, t } from '../i18n/index.ts';
import { saveSettings, settings, isLite } from '../store/settings.ts';
import { render, type Screen } from '../router.ts';
import { applySettings } from '../main.ts';

export default async function settingsPage(): Promise<Screen> {
  const s = settings();
  const seg = (name: string, options: [string, string][], value: string, onPick: (v: string) => void) =>
    h('div.seg', { role: 'radiogroup', 'aria-label': name }, options.map(([v, label]) =>
      h('button', { role: 'radio', 'aria-checked': String(v === value), onclick: () => onPick(v) }, label)));
  const redraw = () => { applySettings(); void render(); };

  const el = h('div.page.settings',
    h('header.page-head', h('a.back', { href: '#/', 'aria-label': t('app.back') }, '←'), h('h1', t('settings.title'))),
    h('section', h('h2', t('settings.curriculum')), boardList((id) => saveSettings({ board: id, picked: true }))),
    h('section', h('h2', t('settings.language')),
      h('div.seg.wrap', { role: 'radiogroup' }, LOCALES.map((l) => h('button', { role: 'radio', lang: l.id, 'aria-checked': String(l.id === s.locale), onclick: async () => { saveSettings({ locale: l.id }); await setLocale(l.id); redraw(); } }, l.name))),
      s.locale !== 'en' ? h('p.muted', t('settings.draft_locale')) : null),
    h('section', h('h2', t('settings.lite')),
      seg(t('settings.lite'), [['auto', `${t('settings.lite_auto')} (${isLiteAuto() ? t('settings.lite_on') : t('settings.lite_off')})`], ['on', t('settings.lite_on')], ['off', t('settings.lite_off')]], s.lite, (v) => { saveSettings({ lite: v as 'auto' }); redraw(); }),
      h('p.muted', t('settings.lite_sub'))),
    h('section', h('h2', t('settings.text')),
      seg(t('settings.text'), [['0.9', 'A−'], ['1', 'A'], ['1.15', 'A+'], ['1.3', 'A++']], String(s.text), (v) => { saveSettings({ text: Number(v) }); redraw(); })),
    h('section', h('h2', t('settings.sound')),
      seg(t('settings.sound'), [['1', t('controls.on')], ['0', t('controls.off')]], s.sound ? '1' : '0', (v) => { saveSettings({ sound: v === '1' }); redraw(); }),
      h('h2', t('settings.narration')),
      seg(t('settings.narration'), [['1', t('controls.on')], ['0', t('controls.off')]], s.narration ? '1' : '0', (v) => { saveSettings({ narration: v === '1' }); redraw(); })),
    h('p.muted.privacy', t('settings.privacy')));
  return { el };
}

function isLiteAuto(): boolean {
  const keep = settings().lite;
  settings().lite = 'auto';
  const v = isLite();
  settings().lite = keep;
  return v;
}
