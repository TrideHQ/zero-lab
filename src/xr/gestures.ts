// Hand gestures beyond the pinch: the pointing ray, palm-up hold (menu) and
// the palm swipe (next / previous card).
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

export class PalmSwipe {
  private travel = 0;
  private dir = 0;
  private cool = 0;
  /** Returns +1 (next) or -1 (previous) when an open hand sweeps sideways; 0 otherwise. */
  update(hand: HandState, right: THREE.Vector3, dt: number): 1 | -1 | 0 {
    this.cool = Math.max(0, this.cool - dt);
    const side = hand.tracked && hand.open ? hand.velocity.dot(right) : 0;
    // palm must face sideways (not up/down) so a resting or menu hand does not swipe
    const sideways = Math.abs(hand.palmNormal.dot(UP)) < 0.5;
    if (Math.abs(side) < 0.9 || !sideways || this.cool > 0) {
      this.travel = 0;
      return 0;
    }
    const d = Math.sign(side);
    if (d !== this.dir) { this.dir = d; this.travel = 0; }
    this.travel += Math.abs(side) * dt;
    if (this.travel > 0.22) {
      this.travel = 0;
      this.cool = 0.8;
      return d < 0 ? 1 : -1; // sweeping right-to-left brings the next card, like turning a page
    }
    return 0;
  }
}
