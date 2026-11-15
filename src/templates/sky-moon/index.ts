// Placeholder until the Moon & Astronauts step.
import type { State } from '../../types.ts';
import type { Template } from '../types.ts';
import { BaseTemplate } from '../base.ts';

class SkyMoon extends BaseTemplate {
  readonly name = 'sky-moon';
  constructor(preset: string, params: State, lite: boolean) {
    super(preset, params, lite);
    this.init({});
  }
  protected apply() {}
  pickTargets() {
    return {};
  }
}
export function create(preset: string, params: State, lite: boolean): Template {
  return new SkyMoon(preset, params, lite);
}
