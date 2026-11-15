import { h } from '../dom.ts';
import { t } from '../../i18n/index.ts';
import { content } from '../../topics/loader.ts';
import { saveSettings, settings } from '../../store/settings.ts';

/** Board list as plain-text radio buttons (no exam-board logos). */
export function boardList(onPick: (id: string) => void, selected = settings().board): HTMLElement {
  const list = h('div.board-list', { role: 'radiogroup', 'aria-label': t('settings.curriculum') });
  for (const b of content.boards) {
    const btn = h('button.board', { role: 'radio', 'aria-checked': String(b.id === selected), 'data-board': b.id, onclick: () => {
      list.querySelectorAll('.board').forEach((x) => x.setAttribute('aria-checked', String(x === btn)));
      onPick(b.id);
    } }, h('span.board-name', b.name), h('span.board-hint', b.hint));
    list.append(btn);
  }
  return list;
}

/** First-run curriculum picker. International is preselected. */
export function firstRunPicker(done: () => void) {
  let pick = settings().board;
  const close = () => {
    saveSettings({ board: pick, picked: true });
    overlay.remove();
    done();
  };
  const overlay = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('picker.title') },
    h('div.modal-card',
      h('h2', t('picker.title')),
      h('p.muted', t('picker.sub')),
      boardList((id) => (pick = id), pick),
      h('button.btn.primary.wide', { id: 'picker-go', onclick: close }, t('picker.go'))));
  document.body.append(overlay);
}
