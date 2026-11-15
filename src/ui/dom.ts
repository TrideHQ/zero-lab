type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown>;

/** Minimal hyperscript: h('button.btn', { onclick }, 'Label') */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | string, attrs?: Attrs | Child, ...children: Child[]): HTMLElement {
  const [tag, ...classes] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const [k, v] of Object.entries(attrs as Attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className += (el.className ? ' ' : '') + String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && k !== 'list') (el as unknown as Attrs)[k] = v;
      else el.setAttribute(k, String(v));
    }
  } else if (attrs !== undefined) {
    children.unshift(attrs as Child);
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, kids: Child[]) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : String(k));
  }
}

export const clear = (el: HTMLElement) => el.replaceChildren();
