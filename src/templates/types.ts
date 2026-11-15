import type * as THREE from 'three';
import type { State } from '../types.ts';

/** A named part: a point, or a segment (so a whole line counts when tapped). */
export type PickTarget = THREE.Vector3 | [THREE.Vector3, THREE.Vector3];

/** Something the student can grab. `pos` is in template-local space and stays live. */
export interface Handle {
  name: string;
  pos: THREE.Vector3;
  radius: number;
  /** Normal of the drag plane in template-local space. Default 'z' (the upright plane). */
  plane?: 'x' | 'y' | 'z';
  drag?: (local: THREE.Vector3, phase: 'start' | 'move' | 'end') => void;
  tap?: () => void;
  enabled?: () => boolean;
}

export interface ViewHint { dist: number; target: [number, number, number]; yaw: number; pitch: number }

/** A control the UI renders as a slider, toggle or button (and XR renders as panel buttons). */
export interface ControlSpec {
  key: string;
  label: string;
  type: 'range' | 'toggle' | 'action' | 'choice';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  dp?: number;
  options?: { value: string; label: string }[];
}

export interface SetOpts { animate?: boolean; reset?: boolean }

export interface Template {
  readonly name: string;
  readonly preset: string;
  group: THREE.Group;
  view: ViewHint;
  canSlice: boolean;
  onChange: ((s: State) => void) | null;
  setState(s: State, o?: SetOpts): void;
  getState(): State;
  update(dt: number, t: number): void;
  pickTargets(): Record<string, PickTarget>;
  /** Names to label on generated diagrams. */
  diagramTargets(): string[];
  handles(): Handle[];
  controls(): ControlSpec[];
  action(key: string): void;
  dispose(): void;
}

export type TemplateFactory = (preset: string, params: State, lite: boolean) => Template;
