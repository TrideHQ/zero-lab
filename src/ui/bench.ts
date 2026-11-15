// Practical bench: procedure and instruments on the left, the apparatus in 3D
// in the middle with the lab partner, and the live results table, graph,
// analysis and mark sheet on the right.
import { h, fill } from './dom.ts';
import { renderTex } from './components/katex.ts';
import { L, getLocale, num, t } from '../i18n/index.ts';
import { board, loadPractical, loadRubrics, summary } from '../topics/loader.ts';
import { isLite, settings } from '../store/settings.ts';
import { savePractical } from '../store/progress.ts';
import { go, type Screen } from '../router.ts';
import { PracticalEngine } from '../practicals/engine.ts';
import { createDriver, type Action, type Driver } from '../practicals/driver.ts';
import { renderTable, tableSpec } from '../practicals/table.ts';
import { drawGraph } from '../practicals/graph.ts';
import { mark, type MarkSheet } from '../practicals/marks.ts';
import { askPartner } from '../partner/client.ts';
import { pickIssue } from '../partner/rules.ts';
import type { Stage } from '../render/renderer.ts';
import type { PanelButton, PanelSpec, XRApp } from '../xr/panel-spec.ts';
import { blip } from '../audio/sfx.ts';
import { perfMark } from './debug.ts';

export default async function benchPage(params: string[], query: URLSearchParams): Promise<Screen> {
  const slug = params[0];
  const [practical, rubrics] = await Promise.all([loadPractical(slug), loadRubrics()]);
  const from = query.get('from');
  const engine = new PracticalEngine(practical, query.get('v') ?? undefined);
  const b = board();
  const rubricId = rubrics.rubrics[b.rubric] ? b.rubric : 'generic';
  const rubric = rubrics.rubrics[rubricId];
  const lite = isLite();
  let stage: Stage | null = null;
  let driver: Driver | null = null;
  let dead = false;
  let speech = t('partner.hello');
  let highlight = 0;
  let sheet: MarkSheet | null = null;
  let wizard = 0; // which analysis question the headset panel is on
  let sig = '';
  const cols = practical.table.columns;
  const colLabel = (id: string) => {
    const c = cols.find((x) => x.id === id);
    return c ? (c.unit ? `${c.label} / ${c.unit}` : c.label) : id;
  };

  // ---- skeleton ----------------------------------------------------------
  const steps = h('ol.steps');
  const readout = h('div.readout', { id: 'readout', 'aria-live': 'off' }, '');
  const status = h('small', { id: 'bench-status' });
  const controls = h('div.controls', { id: 'bench-controls' });
  const recordBtn = h('button.btn.primary', { id: 'record', onclick: () => void record() }, t('bench.record'));
  const undoBtn = h('button.btn.small', { id: 'undo', onclick: () => { engine.removeLast(); highlight = 0; redraw(); } }, t('bench.undo'));
  const analyseBtn = h('button.btn.wide', { id: 'analyse', onclick: () => analyse() }, t('bench.analyse'));
  const viewport = h('div.viewport', { id: 'viewport' });
  const bubble = h('div.bubble', { id: 'partner', role: 'status', 'aria-live': 'polite' });
  const right = h('aside.panel.bench-data');
  const graph = h('canvas.graph', { id: 'graph', role: 'img', 'aria-label': t('bench.graph') }) as HTMLCanvasElement;
  const xrButtons = h('div.xr-buttons');
  const variants = Object.entries(practical.variants);

  const el = h('div.stage-page.bench-page',
    h('header.stage-head',
      h('a.back', { href: from ? `#/t/${from}` : '#/s/physics', 'aria-label': t('app.back') }, '←'),
      h('h1', L(practical.title)),
      h('span.tags', h('span.tag.practical', t('bench.practical')), h('span.tag.level', L(rubric.name)),
        variants.length > 1 ? h('span.seg', variants.map(([id, v]) => h('button', { role: 'radio', 'aria-checked': String(id === engine.variant), onclick: () => go(`/p/${slug}?v=${id}${from ? `&from=${from}` : ''}`) }, L(v.label)))) : null),
      xrButtons),
    h('div.bench-grid',
      h('aside.panel.bench-left',
        h('details.about', { open: window.innerHeight > 900 }, h('summary', t('bench.aim_apparatus')),
          h('p', h('strong', t('bench.aim') + ': '), L(practical.aim)),
          h('p.muted', h('strong', t('bench.apparatus') + ': '), practical.apparatus.map((a) => L(a)).join(', '))),
        steps, readout, status, controls,
        h('div.btn-row', { style: { display: 'flex', gap: '8px', margin: '10px 0' } }, recordBtn, undoBtn),
        analyseBtn),
      h('div.stage-center', viewport),
      right));
  viewport.append(bubble);

  // ---- drawing -----------------------------------------------------------
  function say(text: string) {
    speech = text;
    fill(bubble, text ? h('b', t('bench.partner')) : null, text);
    app.version++;
  }

  function drawSteps() {
    const now = engine.phase === 'readings' ? driver?.step() ?? 0 : practical.steps.length - 1;
    fill(steps, practical.steps.map((s, i) => h('li', { class: i < now ? 'done' : i === now ? 'now' : '' }, L(s.text))));
  }

  function drawControls() {
    if (!driver) return;
    const acts = engine.phase === 'readings' ? driver.actions() : [];
    const next = acts.map((a) => `${a.id}:${a.kind}:${a.disabled ? 1 : 0}`).join('|');
    if (next !== sig) {
      sig = next;
      fill(controls, acts.map((a) => actionEl(a)));
    } else {
      for (const a of acts) {
        const node = controls.querySelector(`[data-action="${a.id}"]`) as HTMLElement | null;
        if (!node) continue;
        if (a.kind === 'range') {
          const input = node.querySelector('input') as HTMLInputElement;
          if (document.activeElement !== input) input.value = String(a.value);
          node.querySelector('b')!.textContent = num(a.value ?? 0, a.dp ?? 0) + (a.unit ?? '');
        } else {
          node.textContent = a.label;
          node.setAttribute('aria-pressed', String(!!a.pressed));
        }
      }
    }
    readout.textContent = driver.readout();
    status.textContent = driver.status();
  }

  function actionEl(a: Action): HTMLElement {
    if (a.kind === 'range') {
      const out = h('b', num(a.value ?? 0, a.dp ?? 0) + (a.unit ?? ''));
      const input = h('input', { type: 'range', min: a.min, max: a.max, step: a.step, value: a.value, 'aria-label': a.label,
        oninput: () => { out.textContent = num(Number(input.value), a.dp ?? 0) + (a.unit ?? ''); current(a.id)?.on(Number(input.value)); } }) as HTMLInputElement;
      return h('label', { 'data-action': a.id }, h('span', a.label, ' ', out), input);
    }
    return h('button.btn.small', { class: a.primary ? 'primary' : '', 'data-action': a.id, disabled: a.disabled, 'aria-pressed': String(!!a.pressed), onclick: () => current(a.id)?.on() }, a.label);
  }
  const current = (id: string) => driver?.actions().find((x) => x.id === id);

  function drawRight() {
    const kids: (HTMLElement | null)[] = [h('h3', t('bench.table')), renderTable(engine, highlight)];
    if (engine.phase !== 'readings') {
      kids.push(h('h3', t('bench.graph')), graph);
      const f = engine.fit();
      const xc = cols.find((c) => c.id === engine.analysis.x), yc = cols.find((c) => c.id === engine.analysis.y);
      const slopeUnit = xc && yc ? [yc.unit, xc.unit].filter(Boolean).join(' / ') : '';
      kids.push(h('div.kv', { id: 'fit' }, h('span', t('bench.slope')), h('b', f ? `${num(f.slope, 3)} ${slopeUnit}` : '—'), h('span.muted', 'r²'), h('span.muted', f ? num(f.r2, 3) : '—')));
    }
    if (engine.phase === 'analysis') kids.push(form());
    if (engine.phase === 'done' && sheet) kids.push(markSheet(sheet));
    fill(right, ...kids);
    if (engine.phase !== 'readings') drawGraph(graph, engine, engine.analysis.x, engine.analysis.y);
  }

  function redraw() {
    drawSteps();
    drawControls();
    drawRight();
    const ready = engine.rows.length >= 3;
    recordBtn.toggleAttribute('disabled', engine.phase !== 'readings');
    undoBtn.toggleAttribute('disabled', engine.phase !== 'readings' || !engine.rows.length);
    analyseBtn.toggleAttribute('disabled', engine.phase !== 'readings' || !ready);
    analyseBtn.classList.toggle('primary', engine.phase === 'readings' && engine.rows.length >= engine.target);
    app.version++;
  }

  // ---- taking readings ---------------------------------------------------
  async function record() {
    if (!driver || engine.phase !== 'readings') return;
    const r = driver.read();
    if ('error' in r) {
      say(t(r.error));
      blip('bad');
      return;
    }
    const row = engine.add(r.values, r.meta);
    driver.afterRecord();
    blip('record');
    const n = engine.rows.length;
    const issue = pickIssue('reading', row.issues, engine.globalIssues());
    highlight = issue !== 'none' && issue !== 'narrow_range' ? n : 0;
    redraw();
    say('…');
    const reply = await askPartner(engine.context('reading', b.id, getLocale(), issue, highlight));
    if (dead || engine.rows.length !== n) return;
    const m = reply.highlight?.match(/^reading_(\d+)$/);
    if (m) highlight = Number(m[1]);
    bubble.dataset.source = reply.source;
    say(reply.say);
    drawRight();
  }

  function analyse() {
    if (engine.rows.length < 3) {
      say(t('bench.need_more', { n: 3 }));
      return;
    }
    engine.phase = 'analysis';
    wizard = 0;
    say(engine.rows.length < engine.target ? t('partner.issue.too_few_readings') : '');
    redraw();
  }

  // ---- analysis form -----------------------------------------------------
  function form(): HTMLElement {
    const a = engine.analysis;
    const axis = (which: 'x' | 'y') => {
      const sel = h('select', { id: `axis-${which}`, 'aria-label': t(which === 'x' ? 'bench.x_axis' : 'bench.y_axis'), onchange: () => { a[which] = sel.value; drawRight(); app.version++; } },
        h('option', { value: '' }, t('bench.choose')), practical.graph.choices.map((c) => h('option', { value: c, selected: a[which] === c }, colLabel(c)))) as HTMLSelectElement;
      return h('label', t(which === 'x' ? 'bench.x_axis' : 'bench.y_axis'), sel);
    };
    const formula = h('fieldset', h('legend', t('bench.formula')), practical.formula.options.map((o) => {
      const tex = h('span');
      void renderTex(tex, o.tex, false);
      return h('label.pick', h('input', { type: 'radio', name: 'formula', value: o.id, checked: a.formula === o.id, onchange: () => { a.formula = o.id; app.version++; } }), tex);
    }));
    const unit = h('select', { id: 'unit', 'aria-label': t('bench.unit'), onchange: () => { a.unit = (unit as HTMLSelectElement).value; app.version++; } },
      h('option', { value: '' }, t('bench.choose')), practical.expected.units.map((u) => h('option', { value: u, selected: a.unit === u }, u)));
    const prec = h('fieldset', h('legend', t('bench.precautions')), practical.precautions.map((p) =>
      h('label.pick', h('input', { type: 'checkbox', value: p.id, checked: a.precautions.includes(p.id), onchange: (e: Event) => {
        const box = e.target as HTMLInputElement;
        if (box.checked && a.precautions.length >= 2) { box.checked = false; return; }
        a.precautions = box.checked ? [...a.precautions, p.id] : a.precautions.filter((x) => x !== p.id);
        app.version++;
      } }), L(p.text))));
    const concl = h('fieldset', h('legend', t('bench.conclusion')), practical.conclusions.map((c, i) =>
      h('label.pick', h('input', { type: 'radio', name: 'conclusion', value: i, checked: a.conclusion === i, onchange: () => { a.conclusion = i; app.version++; } }), L(c.text))));
    return h('div.form', { id: 'analysis' },
      h('h3', t('bench.axes')), axis('y'), axis('x'), formula, h('label', t('bench.unit'), unit), prec, concl,
      h('button.btn.primary.wide', { id: 'finish', onclick: () => void finish() }, t('bench.finish')));
  }

  async function finish() {
    const a = engine.analysis;
    if (!a.x || !a.y || !a.formula || a.conclusion < 0) {
      say(t('bench.choose'));
      blip('bad');
      return;
    }
    engine.phase = 'done';
    sheet = mark(rubricId, rubric, engine.stats());
    const ans = engine.answer();
    drawGraph(graph, engine, a.x, a.y);
    savePractical(`${slug}:${engine.variant}`, {
      slug, variant: engine.variant, board: b.id, rubric: rubricId, score: sheet.total, total: sheet.max, type: sheet.type,
      symbol: practical.expected.symbol, answer: ans, unit: a.unit, pctError: engine.pctError(), graph: thumb(), at: Date.now(),
    });
    blip('good');
    redraw();
    say('…');
    const issue = pickIssue('final', [], engine.globalIssues());
    const reply = await askPartner(engine.context('final', b.id, getLocale(), issue, issue === 'outlier' ? engine.outlierIndex() : 0, { got: sheet.total, max: sheet.max }));
    if (dead) return;
    bubble.dataset.source = reply.source;
    say(reply.say);
  }

  function thumb(): string {
    try {
      return graph.toDataURL('image/webp', 0.7);
    } catch {
      return '';
    }
  }

  function markSheet(s: MarkSheet): HTMLElement {
    const ans = engine.answer();
    const unit = engine.analysis.unit && engine.analysis.unit !== '(no unit)' ? ' ' + engine.analysis.unit : '';
    return h('div', { id: 'marksheet' },
      h('h3', t('bench.marksheet')),
      h('p.muted', L(s.name)),
      h('table.marks', s.rows.map((r) => h('tr', { 'data-criterion': r.id },
        h('td', L(r.label)),
        h('td', s.type === 'competency' ? (r.met ? '✓ ' + t('bench.met') : t('bench.not_met')) : `${num(r.got)} / ${num(r.max)}`)))),
      h('div.total', { id: 'total' }, s.type === 'percent' ? `${num(s.total)}%` : t('bench.of', { a: num(s.total), b: num(s.max) })),
      h('div.kv',
        h('span', `${t('bench.answer')} (${practical.expected.symbol})`), h('b', { id: 'answer' }, Number.isFinite(ans) ? num(ans, 2) + unit : '—'),
        h('span', t('bench.accepted')), h('b', num(engine.accepted, 2) + (practical.expected.unit !== '(no unit)' ? ' ' + practical.expected.unit : '')),
        h('span', t('bench.error')), h('b', { id: 'pct-error' }, Number.isFinite(engine.pctError()) ? num(engine.pctError(), 1) + '%' : '—')),
      h('p.muted', t('bench.saved')),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button.btn', { onclick: () => go(`/p/${slug}?v=${engine.variant}${from ? `&from=${from}` : ''}&again=${Date.now()}`) }, t('bench.again')),
        from ? h('a.btn', { href: `#/t/${from}` }, t('bench.to_topic')) : null,
        h('a.btn', { href: '#/progress' }, t('app.progress'))));
  }

  // ---- headset panels ----------------------------------------------------
  const app: XRApp = {
    version: 0,
    main(): PanelSpec {
      const title = L(practical.title);
      if (engine.phase === 'readings') {
        const buttons: PanelButton[] = [];
        for (const a of driver?.actions() ?? []) {
          if (a.kind === 'range') {
            const step = (a.step ?? 1) * (a.id === 'rheo' ? 5 : 1);
            const val = `${a.label} ${num(a.value ?? 0, a.dp ?? 0)}${a.unit ?? ''}`;
            buttons.push({ id: a.id + '-', label: `− ${val}`, on: () => current(a.id)?.on(Math.max(a.min ?? 0, (current(a.id)?.value ?? 0) - step)) });
            buttons.push({ id: a.id + '+', label: `+ ${val}`, on: () => current(a.id)?.on(Math.min(a.max ?? 1, (current(a.id)?.value ?? 0) + step)) });
          } else buttons.push({ id: a.id, label: a.label, primary: a.primary, pressed: a.pressed, disabled: a.disabled, on: () => current(a.id)?.on() });
        }
        buttons.push({ id: 'record', label: t('bench.record'), primary: true, on: () => void record() });
        buttons.push({ id: 'analyse', label: t('bench.analyse'), disabled: engine.rows.length < 3, on: analyse });
        const now = driver?.step() ?? 0;
        return { title, badge: L(rubric.name), body: [L(practical.steps[now].text), driver?.readout() ?? '', driver?.status() ?? ''], buttons, footer: t('bench.step', { n: now + 1, m: practical.steps.length }) };
      }
      if (engine.phase === 'analysis') {
        const a = engine.analysis;
        const pick = (label: string, on: () => void, pressed = false): PanelButton => ({ id: 'w' + label, label, pressed, on: () => { on(); redraw(); } });
        const advance = () => { wizard++; };
        const pages: { q: string; buttons: PanelButton[] }[] = [
          { q: t('bench.y_axis'), buttons: practical.graph.choices.map((c) => pick(colLabel(c), () => { a.y = c; advance(); }, a.y === c)) },
          { q: t('bench.x_axis'), buttons: practical.graph.choices.map((c) => pick(colLabel(c), () => { a.x = c; advance(); }, a.x === c)) },
          { q: t('bench.formula'), buttons: practical.formula.options.map((o) => pick(o.text, () => { a.formula = o.id; advance(); }, a.formula === o.id)) },
          { q: t('bench.unit'), buttons: practical.expected.units.map((u) => pick(u, () => { a.unit = u; advance(); }, a.unit === u)) },
          { q: t('bench.precautions'), buttons: [...practical.precautions.map((p) => pick(L(p.text), () => { a.precautions = a.precautions.includes(p.id) ? a.precautions.filter((x) => x !== p.id) : a.precautions.length < 2 ? [...a.precautions, p.id] : a.precautions; }, a.precautions.includes(p.id))), pick(t('topic.next') + ' →', advance)] },
          { q: t('bench.conclusion'), buttons: practical.conclusions.map((c, i) => pick(L(c.text), () => { a.conclusion = i; advance(); }, a.conclusion === i)) },
        ];
        if (wizard >= pages.length) return { title, body: [t('bench.finish')], buttons: [{ id: 'back', label: '← ' + t('topic.prev'), on: () => { wizard = pages.length - 1; redraw(); } }, { id: 'finish', label: t('bench.finish'), primary: true, on: () => void finish() }] };
        const page = pages[wizard];
        return { title, body: [page.q], buttons: [...page.buttons, ...(wizard > 0 ? [{ id: 'back', label: '← ' + t('topic.prev'), on: () => { wizard--; redraw(); } }] : [])], footer: t('bench.step', { n: wizard + 1, m: pages.length }) };
      }
      const s = sheet!;
      return {
        title: t('bench.marksheet'), badge: L(s.name),
        body: [s.type === 'percent' ? `${num(s.total)}%` : t('bench.of', { a: num(s.total), b: num(s.max) }), `${practical.expected.symbol} = ${Number.isFinite(engine.answer()) ? num(engine.answer(), 2) : '—'}   (${t('bench.error')}: ${Number.isFinite(engine.pctError()) ? num(engine.pctError(), 1) + '%' : '—'})`],
        table: { head: ['', ''], rows: s.rows.map((r) => [L(r.label), s.type === 'competency' ? (r.met ? '✓' : '–') : `${num(r.got)} / ${num(r.max)}`]) },
        buttons: [{ id: 'again', label: t('bench.again'), on: () => go(`/p/${slug}?v=${engine.variant}${from ? `&from=${from}` : ''}&again=${Date.now()}`) }, ...(from ? [{ id: 'topic', label: t('bench.to_topic'), on: () => go(`/t/${from}`) }] : [])],
      };
    },
    side: () => ({ title: t('bench.table'), body: [], table: tableSpec(engine), buttons: [] }),
    sideImage: () => (engine.phase !== 'readings' ? graph : null),
    speech: () => speech,
    pointAnywhere: () => engine.phase === 'readings' && !!driver?.onTapPoint,
    onPoint(_name, local) {
      if (local && engine.phase === 'readings') driver?.onTapPoint?.(local);
    },
  };

  // ---- 3D ----------------------------------------------------------------
  async function start3d() {
    try {
      const [{ getStage, webglOk }, { PartnerBot }] = await Promise.all([import('../render/renderer.ts'), import('../partner/bot.ts')]);
      if (!webglOk()) throw new Error('no webgl');
      const st = getStage();
      st.mount(viewport, lite);
      const d = await createDriver({ practical, engine, stage: st, lite, refresh: () => { if (!dead) { drawSteps(); drawControls(); app.version++; } } });
      if (dead) {
        d.template.dispose();
        return;
      }
      stage = st;
      driver = d;
      st.setTemplate(d.template);
      perfMark('model');
      st.extraHandles = d.handles;
      st.onTapPoint = (p) => { if (engine.phase === 'readings') d.onTapPoint?.(p); };
      const bot = new PartnerBot(1.25, 1.5, 0.2, lite);
      d.template.group.add(bot.group);
      let acc = 0, lastSpeech = '';
      st.frame.add((dt, tt) => {
        d.update(dt, tt);
        bot.update(dt, tt);
        if (speech !== lastSpeech) { lastSpeech = speech; if (speech) bot.speak(); }
        if ((acc += dt) > 0.1) {
          acc = 0;
          const text = d.readout();
          if (readout.textContent !== text) { readout.textContent = text; app.version++; }
        }
      });
      blip('hum');
      redraw();
      const xr = await import('../xr/session.ts');
      const sup = await xr.xrSupport();
      if (dead) return;
      xr.setXRApp(app);
      const enter = (mode: 'vr' | 'ar') => () => void xr.enterXR(mode, st).catch((e) => console.warn(e));
      fill(xrButtons,
        sup.ar ? h('button.btn.small', { id: 'enter-ar', onclick: enter('ar') }, t('topic.ar')) : null,
        sup.vr ? h('button.btn.small', { id: 'enter-vr', onclick: enter('vr') }, t('topic.vr')) : null);
      // automation hooks for the run-through tests and the demo recording
      (window as unknown as { __bench: unknown }).__bench = { engine, driver: d, stage: st, record, analyse, finish, redraw, say: () => speech, source: () => bubble.dataset.source ?? '', sheet: () => sheet };
    } catch (e) {
      console.warn('3D unavailable', e);
      viewport.append(h('div.placeholder', h('p.muted', t('topic.no3d'))));
    }
  }

  say(speech);
  redraw();
  setTimeout(() => void (!dead && start3d()), 30);
  void settings;
  void summary;

  return {
    el,
    destroy() {
      dead = true;
      void import('../xr/session.ts').then((x) => x.xrApp() === app && x.setXRApp(null));
      driver?.dispose();
      stage?.unmount();
      delete (window as unknown as { __bench?: unknown }).__bench;
    },
  };
}
