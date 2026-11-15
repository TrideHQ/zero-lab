import type { State } from '../types.ts';
import type { Template } from './types.ts';

/** Templates load on demand so a topic only downloads the model it needs. */
const loaders: Record<string, () => Promise<{ create: (preset: string, params: State, lite: boolean) => Template }>> = {
  'ray-optics': () => import('./ray-optics/index.ts'),
  'circuit-board': () => import('./circuit-board/index.ts'),
  'forces-rig': () => import('./forces-rig/index.ts'),
  'sky-moon': () => import('./sky-moon/index.ts'),
};

export async function createTemplate(name: string, preset: string, params: State, lite = false): Promise<Template> {
  const load = loaders[name];
  if (!load) throw new Error(`Unknown template "${name}"`);
  return (await load()).create(preset, params, lite);
}
