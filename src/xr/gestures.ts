// Hand gestures beyond the pinch: the pointing ray and the palm-up hold (menu).
import * as THREE from 'three';
import type { HandState } from './hands.ts';

const UP = new THREE.Vector3(0, 1, 0);

/** Pointing ray: from an estimated shoulder through the pinch point (stable, like headset system UI). */
export function pointerRay(hand: HandState, head: THREE.Vector3, headYaw: number, out: THREE.Ray): THREE.Ray {
  const sx = (hand.side === 'left' ? -1 : 1) * 0.17;
  out.origin.set(head.x + Math.cos(headYaw) * sx, head.y - 0.22, head.z - Math.sin(headYaw) * sx);
  out.direction.subVectors(hand.pinchPos, out.origin).normalize();
  out.origin.copy(hand.pinchPos);
  return out;
}

export class PalmUpHold {
  private t = 0;
  private fired = false;
  /** Returns true once, after the palm has faced up, open, for `hold` seconds. */
  update(hand: HandState, dt: number, hold = 1.0): boolean {
    const up = hand.tracked && hand.open && hand.palmNormal.dot(UP) > 0.75;
    if (!up) {
      this.t = 0;
      this.fired = false;
      return false;
    }
    this.t += dt;
    if (this.t >= hold && !this.fired) {
      this.fired = true;
      return true;
    }
    return false;
  }
  get progress() { return Math.min(1, this.t); }
}

// A palm-swipe for next / previous card was tried and removed: in emulator tests it fired 9 times out of 12.
// The Previous / Next pinch buttons do that job reliably.
