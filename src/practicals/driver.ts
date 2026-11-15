// A driver wires one practical's apparatus to the engine: it owns the 3D
// template, the instruments, and the actions the bench UI (HTML or headset
// panel) shows as buttons and sliders.
import type * as THREE from 'three';
import type { Practical } from '../types.ts';
import type { Stage } from '../render/renderer.ts';
import type { Handle, Template } from '../templates/types.ts';
import type { PracticalEngine } from './engine.ts';
import type { Meta, Values } from './modules/logic.ts';

export interface Action {
  id: string;
  label: string;
  kind: 'button' | 'range' | 'toggle';
  primary?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  dp?: number;
  on(v?: number): void;
}
export interface Reading { values: Values; meta: Meta }

export interface Driver {
  template: Template;
  /** Extra grab / tap targets (instruments), in template-local space. */
  handles: Handle[];
  actions(): Action[];
  /** Main instrument display, e.g. the stopwatch time. */
  readout(): string;
  status(): string;
  /** Index of the procedure step the student is on. */
  step(): number;
  read(): Reading | { error: string };
  afterRecord(): void;
  update(dt: number, t: number): void;
  onTapPoint?(local: THREE.Vector3): void;
  /** Hooks for automated run-throughs (tests, demo recording). */
  bot: Record<string, (...args: number[]) => unknown>;
  dispose(): void;
}

export interface DriverCtx {
  practical: Practical;
  engine: PracticalEngine;
  stage: Stage;
  lite: boolean;
  /** Ask the bench UI to redraw its controls and readout. */
  refresh(): void;
}

const loaders: Record<string, () => Promise<{ mount(ctx: DriverCtx): Promise<Driver> }>> = {
  'pendulum-g': () => import('./modules/pendulum-g.ts'),
  'refraction-glass-block': () => import('./modules/refraction-glass-block.ts'),
  'ohms-law': () => import('./modules/ohms-law.ts'),
};

export async function createDriver(ctx: DriverCtx): Promise<Driver> {
  const load = loaders[ctx.practical.slug];
  if (!load) throw new Error(`No driver for ${ctx.practical.slug}`);
  return (await load()).mount(ctx);
}
