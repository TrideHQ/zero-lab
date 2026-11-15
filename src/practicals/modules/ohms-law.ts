// Ohm's law -> R. The student builds the circuit, closes the switch, moves the
// rheostat and records what the two meters show.
import { createTemplate } from '../../templates/registry.ts';
import type { CircuitBoard } from '../../templates/circuit-board/index.ts';
import type { Action, Driver, DriverCtx } from '../driver.ts';
import { t } from '../../i18n/index.ts';
import { blip } from '../../audio/sfx.ts';

const ORDER = ['battery', 'switch', 'rheostat', 'resistor', 'ammeter', 'voltmeter'];

export async function mount(ctx: DriverCtx): Promise<Driver> {
  const R = Number(ctx.practical.variants[ctx.engine.variant].params.R);
  const emf = Number(ctx.practical.model.params.emf ?? 6);
  const tpl = (await createTemplate('circuit-board', 'ohm', { R, emf, hideR: true, seed: 11 }, ctx.lite)) as CircuitBoard;
  const bench = tpl.bench();
  tpl.setState({ rheo: 0.9, electrons: true }, { animate: false });
  let seen = 0;
  tpl.onChange = () => ctx.refresh();

  const driver: Driver = {
    template: tpl,
    handles: [],
    actions(): Action[] {
      const acts: Action[] = [];
      if (!bench.complete()) {
        acts.push({ id: 'place-next', label: t('bench.place_next'), kind: 'button', on: () => {
          const next = ORDER.find((_, i) => i >= bench.placed());
          for (const name of ORDER) { // place the first part still in the tray
            const before = bench.placed();
            bench.place(name);
            if (bench.placed() > before) break;
          }
          void next;
          blip('tick');
          ctx.refresh();
        } });
        return acts;
      }
      acts.push({ id: 'switch', label: `${t('controls.switch')}: ${bench.switchOn() ? t('controls.on') : t('controls.off')}`, kind: 'toggle', pressed: bench.switchOn(), primary: !bench.switchOn(), on: () => { bench.setSwitch(!bench.switchOn()); blip('tick'); ctx.refresh(); } });
      acts.push({ id: 'rheo', label: t('controls.rheostat'), kind: 'range', min: 0, max: 1, step: 0.02, value: bench.rheostat(), dp: 2, on: (v) => { bench.setRheostat(v!); ctx.refresh(); } });
      return acts;
    },
    readout: () => (bench.complete() ? `${bench.displayV().toFixed(1)} V   ${bench.displayI().toFixed(2)} A` : t('bench.placed', { n: bench.placed(), m: bench.total })),
    status: () => (bench.complete() ? '' : t('bench.placed', { n: bench.placed(), m: bench.total })),
    step: () => (!bench.complete() ? 0 : !bench.switchOn() ? 1 : ctx.engine.rows.length ? 3 : 2),
    read() {
      if (!bench.complete()) return { error: 'bench.not_ready' };
      return { values: { V: bench.displayV(), I: bench.displayI() }, meta: { switchOn: bench.switchOn(), trueV: bench.trueV(), trueI: bench.trueI() } };
    },
    afterRecord() {},
    update() {
      if (bench.placed() !== seen) {
        seen = bench.placed();
        ctx.refresh();
      }
    },
    bot: {
      placeAll: () => bench.placeAll(),
      setSwitch: (on) => bench.setSwitch(!!on),
      rheostat: (v) => bench.setRheostat(v),
      placed: () => bench.placed(),
    },
    dispose() {},
  };
  return driver;
}
