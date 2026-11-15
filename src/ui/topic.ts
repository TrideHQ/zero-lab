// Topic stage: 3D model centre, explanation cards on the left, diagrams on the
// right, step dots and "Try the practical" below. On phones it stacks.
import { h, fill } from './dom.ts';
import { renderTex, texToText } from './components/katex.ts';
import { controlBar, type ControlBar } from './components/controls.ts';
import { L, t } from '../i18n/index.ts';
import { board, loadTopic, mapping, summary } from '../topics/loader.ts';
import { startChecks } from '../topics/checks.ts';
import { isLite, settings } from '../store/settings.ts';
import { passCheck, progress, visitTopic } from '../store/progress.ts';
import { go, type Screen } from '../router.ts';
import type { Stage } from '../render/renderer.ts';
import type { Template } from '../templates/types.ts';
import type { PanelSpec, XRApp } from '../xr/panel-spec.ts';
import { blip } from '../audio/sfx.ts';
import { perfMark } from './debug.ts';
import { narrate, stopNarration } from '../audio/narration.ts';

export default async function topicPage(params: string[], query: URLSearchParams): Promise<Screen> {
  const slug = params[0];
  const topic = await loadTopic(slug);
  const sum = summary(slug)!;
  const lite = isLite();
  const m = mapping(topic);
  const b = board();
  const nCards = topic.cards.length;
  let index = Math.min(nCards, Math.max(0, Number(query.get('c') ?? 0) || 0)); // index === nCards -> checks
  let stage: Stage | null = null;
  let tpl: Template | null = null;
  let bar: ControlBar | null = null;
  let dead = false;
  const checks = startChecks(topic.checks, progress().topics[slug]?.checks ?? []);
  let feedback: { text: string; good: boolean } | null = null;

  // ---- skeleton ----------------------------------------------------------
  const cardBody = h('div.card-body', { 'aria-live': 'polite' });
  const count = h('span.count');
  const prev = h('button.btn.small', { id: 'prev', 'aria-label': t('topic.prev'), onclick: () => show(index - 1) }, '←');
  const next = h('button.btn.small.primary', { id: 'next', onclick: () => show(index + 1) }, t('topic.next'));
  const dots = h('div.dots', { role: 'tablist' });
  const viewport = h('div.viewport', { id: 'viewport' });
  const tools = h('div.tools');
  const hint = h('div.hint', t('topic.drag_hint'));
  const xrButtons = h('div.xr-buttons');
  const images = h('aside.panel.images', h('h3', t('topic.images')));

  const el = h('div.stage-page',
    h('header.stage-head',
      h('a.back', { href: `#/s/${topic.subject}`, 'aria-label': t('app.back') }, '←'),
      h('h1', L(topic.title)),
      h('span.tags',
        m ? h('span.tag.level', b.id === 'international' ? m.level : `${b.name} · ${m.level}`) : null,
        !topic.reviewed ? h('span.tag.draft', { id: 'draft-badge' }, t('topic.draft')) : null),
      xrButtons),
    h('div.stage-grid',
      h('aside.panel.cards', cardBody, h('div.card-nav', prev, count, next)),
      h('div.stage-center', viewport, tools),
      images),
    h('footer.stage-foot',
      dots,
      topic.practical ? h('a.btn.primary', { id: 'try-practical', href: practicalHref() }, t('topic.try')) : null));

  function practicalHref() {
    return `#/p/${topic.practical}?from=${slug}${topic.practicalVariant ? `&v=${topic.practicalVariant}` : ''}`;
  }

  // ---- cards and checks --------------------------------------------------
  function drawDots() {
    dots.replaceChildren(...Array.from({ length: nCards + 1 }, (_, i) =>
      h('button', { role: 'tab', 'aria-current': String(i === index), 'aria-label': i < nCards ? t('topic.card', { n: i + 1, m: nCards }) : t('topic.checks'), title: i < nCards ? L(topic.cards[i].title) : t('topic.checks'), onclick: () => show(i) })));
  }

  function show(i: number) {
    if (i < 0 || i > nCards) return;
    index = i;
    feedback = null;
    blip('step');
    draw();
  }

  function draw() {
    drawDots();
    prev.toggleAttribute('disabled', index === 0);
    next.toggleAttribute('disabled', index === nCards);
    next.textContent = index === nCards - 1 ? t('topic.checks') : t('topic.next');
    if (stage) stage.onTap = null;
    if (index < nCards) {
      const c = topic.cards[index];
      count.textContent = t('topic.card', { n: index + 1, m: nCards });
      const eq = c.equation ? h('div.equation') : null;
      fill(cardBody, h('h2', L(c.title)), h('p', L(c.text)), eq);
      if (eq && c.equation) void renderTex(eq, c.equation);
      tpl?.setState(c.modelState, { reset: true });
      visitTopic(slug, index);
      if (settings().narration) narrate(slug, index);
    } else {
      stopNarration();
      drawCheck();
    }
    bar?.sync();
    app.version++;
  }

  function drawCheck() {
    count.textContent = t('topic.checks');
    if (checks.done()) {
      fill(cardBody, h('h2', t('topic.checks')), h('p.feedback.good', t('topic.all_done')),
        topic.related.length ? h('div', h('h3', t('topic.related')), h('div.options', topic.related.map((r) => h('a.option', { href: `#/t/${r}` }, L(summary(r)?.title))))) : null,
        topic.practical ? h('a.btn.primary.wide', { href: practicalHref() }, t('topic.try')) : null);
      return;
    }
    const c = checks.check;
    const fb = h('p.feedback', { class: feedback ? (feedback.good ? 'good' : 'bad') : '' }, feedback?.text ?? '');
    const answered = (ok: boolean) => {
      feedback = { text: ok ? t('topic.correct') : t('topic.wrong'), good: ok };
      blip(ok ? 'good' : 'bad');
      if (ok) {
        passCheck(slug, checks.index, topic.checks.length);
        setTimeout(() => {
          if (dead || index !== nCards) return;
          feedback = null;
          checks.next();
          draw();
        }, 1000);
      }
      fb.textContent = feedback.text;
      fb.className = 'feedback ' + (ok ? 'good' : 'bad');
      app.version++;
    };
    const head = [h('h2', t('topic.checks')), h('small', t('topic.check_n', { n: checks.index + 1, m: topic.checks.length })), h('p.check-q', L(c.q))];
    if (c.type === 'choice') {
      fill(cardBody, ...head, h('div.options', c.options.map((o, i) =>
        h('button.option', { 'data-option': i, onclick: (e: Event) => {
          const ok = checks.answer(i);
          (e.currentTarget as HTMLElement).classList.add(ok ? 'right' : 'wrong');
          answered(ok);
        } }, L(o)))), fb);
    } else {
      fill(cardBody, ...head, h('p.muted', t('topic.point_hint')), fb);
      if (c.modelState) tpl?.setState(c.modelState, { reset: true });
      if (stage) stage.onTap = (name) => answered(checks.answer(name));
      pointAnswer = (name) => answered(checks.answer(name));
    }
  }
  let pointAnswer: ((name: string | null) => void) | null = null;

  // ---- images ------------------------------------------------------------
  const figs: HTMLImageElement[] = [];
  topic.images.forEach((im, i) => {
    const img = h('img', { alt: L(im.caption), loading: 'lazy', decoding: 'async' }) as HTMLImageElement;
    if (im.type === 'file') img.src = im.src;
    else {
      img.src = `/img/gen/${slug}-${i}.webp`;
      img.onerror = async () => {
        img.onerror = null;
        try {
          const { renderDiagram } = await import('../templates/diagram.ts');
          img.src = await renderDiagram({ template: im.template ?? topic.model.template, preset: im.preset ?? topic.model.preset, params: topic.model.params, state: im.state });
        } catch {
          img.closest('figure')?.remove();
        }
      };
    }
    figs.push(img);
    images.append(h('figure.figure', img, h('figcaption', L(im.caption), ' ', h('small', im.type === 'file' ? im.credit : t('topic.generated')))));
  });

  // ---- 3D ----------------------------------------------------------------
  async function start3d() {
    viewport.querySelector('.placeholder')?.remove();
    try {
      const [{ getStage, webglOk }, { createTemplate }] = await Promise.all([import('../render/renderer.ts'), import('../templates/registry.ts')]);
      if (!webglOk()) throw new Error('no webgl');
      const made = await createTemplate(topic.model.template, topic.model.preset, topic.model.params, lite);
      if (dead) {
        made.dispose();
        return;
      }
      stage = getStage();
      tpl = made;
      stage.mount(viewport, lite);
      stage.setTemplate(tpl);
      perfMark('model');
      blip('hum');
      bar = controlBar(tpl, stage);
      tools.replaceChildren(bar.el);
      viewport.append(hint);
      setTimeout(() => hint.remove(), 6000);
      draw();
      void offerXR();
    } catch (e) {
      console.warn('3D unavailable', e);
      viewport.append(h('div.placeholder', h('p.muted', t('topic.no3d'))));
    }
  }

  async function offerXR() {
    const xr = await import('../xr/session.ts');
    const sup = await xr.xrSupport();
    if (dead || !stage) return;
    xr.setXRApp(app);
    const enter = (mode: 'vr' | 'ar') => async () => {
      try {
        await xr.enterXR(mode, stage!);
      } catch (e) {
        console.warn(e);
      }
    };
    fill(xrButtons, 
      sup.ar ? h('button.btn.small', { id: 'enter-ar', onclick: enter('ar') }, t('topic.ar')) : null,
      sup.vr ? h('button.btn.small', { id: 'enter-vr', onclick: enter('vr') }, t('topic.vr')) : null);
  }

  // ---- what the headset panels show --------------------------------------
  const app: XRApp = {
    version: 0,
    main(): PanelSpec {
      const badge = !topic.reviewed ? t('topic.draft') : undefined;
      if (index < nCards) {
        const c = topic.cards[index];
        return {
          title: L(c.title), badge, body: [L(c.text)], equation: c.equation ? texToText(c.equation) : undefined,
          footer: `${L(topic.title)} · ${t('topic.card', { n: index + 1, m: nCards })}`,
          buttons: [
            { id: 'prev', label: '← ' + t('topic.prev'), disabled: index === 0, on: () => show(index - 1) },
            { id: 'next', label: (index === nCards - 1 ? t('topic.checks') : t('topic.next')) + ' →', primary: true, on: () => show(index + 1) },
            ...(tpl?.canSlice ? [{ id: 'slice', label: t('topic.slice'), pressed: (stage?.slice ?? 0) > 0.5, on: () => stage?.setSlice((stage?.slice ?? 0) > 0.5 ? 0 : 1) }] : []),
            ...(topic.practical ? [{ id: 'practical', label: t('topic.try'), on: () => go(practicalHref().slice(1)) }] : []),
          ],
        };
      }
      if (checks.done()) {
        return { title: t('topic.checks'), badge, body: [t('topic.all_done')], buttons: [
          { id: 'prev', label: '← ' + t('topic.prev'), on: () => show(nCards - 1) },
          ...(topic.practical ? [{ id: 'practical', label: t('topic.try'), primary: true, on: () => go(practicalHref().slice(1)) }] : []),
        ] };
      }
      const c = checks.check;
      return {
        title: t('topic.checks'), badge,
        body: [L(c.q), c.type === 'point' ? t('xr.pinch') : '', feedback?.text ?? ''],
        footer: t('topic.check_n', { n: checks.index + 1, m: topic.checks.length }),
        buttons: [
          ...(c.type === 'choice' ? c.options.map((o, i) => ({ id: 'opt' + i, label: L(o), on: () => (cardBody.querySelector(`[data-option="${i}"]`) as HTMLElement | null)?.click() })) : []),
          { id: 'prev', label: '← ' + t('topic.prev'), on: () => show(nCards - 1) },
        ],
      };
    },
    sideImage: () => figs.find((f) => f.complete && f.naturalWidth > 0) ?? null,
    onPoint(name) {
      if (index === nCards && checks.check?.type === 'point' && !checks.done()) pointAnswer?.(name);
    },
    wantsPoint: () => index === nCards && !checks.done() && checks.check?.type === 'point',
  };

  // ---- gestures and keys -------------------------------------------------
  let sx = 0, sy = 0;
  const cardsEl = el.querySelector('.cards') as HTMLElement;
  cardsEl.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  cardsEl.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1) * (document.documentElement.dir === 'rtl' ? -1 : 1));
  }, { passive: true });
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  };
  window.addEventListener('keydown', onKey);

  draw();
  if (lite && query.get('3d') !== '1') {
    // Lite mode: the diagram is the first thing on screen; the 3D engine is not even downloaded yet.
    const first = figs[0] ? (h('img', { alt: figs[0].alt, src: figs[0].src }) as HTMLImageElement) : null;
    if (first) figs[0].addEventListener('load', () => { first.src = figs[0].src; });
    const ph = h('div.placeholder', first, h('button.btn.primary', { id: 'show-3d', onclick: () => void start3d() }, t('topic.show3d')), h('small', t('topic.lite_note')));
    viewport.append(ph);
  } else {
    // let the text paint first, then bring up the hologram
    setTimeout(() => void (!dead && start3d()), 30);
  }

  return {
    el,
    destroy() {
      dead = true;
      stopNarration();
      window.removeEventListener('keydown', onKey);
      void import('../xr/session.ts').then((x) => x.xrApp() === app && x.setXRApp(null));
      stage?.unmount();
    },
  };
}
