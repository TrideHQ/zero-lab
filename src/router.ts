import { perfMark } from './ui/debug.ts';
// Tiny hash router. Each route lazy-loads its screen so the first paint stays small.
export interface Screen { el: HTMLElement; destroy?: () => void }
type Loader = (params: string[], query: URLSearchParams) => Promise<Screen>;

const routes: [RegExp, Loader][] = [];
let current: Screen | null = null;
let outlet: HTMLElement;
let token = 0;

export function route(pattern: RegExp, loader: Loader) {
  routes.push([pattern, loader]);
}

export function go(path: string) {
  if (location.hash === '#' + path) void render();
  else location.hash = path;
}

export async function render() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const mine = ++token;
  perfMark('route');
  for (const [re, loader] of routes) {
    const m = path.match(re);
    if (!m) continue;
    let next: Screen;
    try {
      next = await loader(m.slice(1).map(decodeURIComponent), new URLSearchParams(qs));
    } catch (e) {
      console.error(e);
      const el = document.createElement('div');
      el.className = 'page';
      el.innerHTML = '<p class="muted">Could not load this page. Check your connection and try again.</p><p><a class="btn" href="#/">Home</a></p>';
      next = { el };
    }
    if (mine !== token) {
      next.destroy?.();
      return;
    }
    current?.destroy?.();
    outlet.replaceChildren(next.el);
    perfMark('screen');
    current = next;
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '/';
}

export function startRouter(el: HTMLElement) {
  outlet = el;
  window.addEventListener('hashchange', () => void render());
  void render();
}
