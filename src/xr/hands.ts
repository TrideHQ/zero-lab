// Hand tracking: reads the WebXR hand joints each frame, draws light-weight
// hologram hands, and exposes the few points the gestures need.
import * as THREE from 'three';
import { glow, CYAN, WARM } from '../render/hologram-shader.ts';

const JOINTS: XRHandJoint[] = [
  'wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<XRHandJoint, number>;

export class HandState {
  readonly side: 'left' | 'right';
  tracked = false;
  joints = JOINTS.map(() => new THREE.Vector3());
  /** Midpoint of thumb tip and index tip. */
  pinchPos = new THREE.Vector3();
  pinching = false;
  pinchStart = false;
  pinchEnd = false;
  palm = new THREE.Vector3();
  palmNormal = new THREE.Vector3();
  open = false;
  velocity = new THREE.Vector3();
  mesh: THREE.InstancedMesh;
  private last = new THREE.Vector3();
  private m = new THREE.Matrix4();

  constructor(side: 'left' | 'right') {
    this.side = side;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0075, 8, 6), glow(CYAN, 0.9), JOINTS.length);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  get wrist() { return this.joints[J.wrist]; }
  get indexTip() { return this.joints[J['index-finger-tip']]; }
  get thumbTip() { return this.joints[J['thumb-tip']]; }

  update(frame: XRFrame, ref: XRReferenceSpace, source: XRInputSource | undefined, dt: number) {
    const was = this.pinching;
    this.pinchStart = this.pinchEnd = false;
    this.tracked = false;
    if (source?.hand && frame.getJointPose) {
      let ok = 0;
      for (let i = 0; i < JOINTS.length; i++) {
        const space = source.hand.get(JOINTS[i]);
        const pose = space ? frame.getJointPose(space, ref) : null;
        if (!pose) continue;
        const p = pose.transform.position;
        this.joints[i].set(p.x, p.y, p.z);
        ok++;
      }
      this.tracked = ok > 20;
    }
    this.mesh.visible = this.tracked;
    if (!this.tracked) {
      if (was) { this.pinching = false; this.pinchEnd = true; }
      return;
    }
    for (let i = 0; i < JOINTS.length; i++) {
      this.m.makeTranslation(this.joints[i].x, this.joints[i].y, this.joints[i].z);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    const gap = this.thumbTip.distanceTo(this.indexTip);
    this.pinching = was ? gap < 0.035 : gap < 0.018; // hysteresis so a pinch does not flicker
    this.pinchStart = this.pinching && !was;
    this.pinchEnd = !this.pinching && was;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value.setHex(this.pinching ? WARM : CYAN);
    this.pinchPos.copy(this.thumbTip).add(this.indexTip).multiplyScalar(0.5);
    const idx = this.joints[J['index-finger-metacarpal']], pky = this.joints[J['pinky-finger-metacarpal']], mid = this.joints[J['middle-finger-metacarpal']];
    this.palm.copy(this.wrist).add(mid).multiplyScalar(0.5);
    const a = new THREE.Vector3().subVectors(idx, this.wrist), b = new THREE.Vector3().subVectors(pky, this.wrist);
    this.palmNormal.crossVectors(a, b).normalize();
    if (this.side === 'left') this.palmNormal.negate();
    const reach = (n: XRHandJoint) => this.joints[J[n]].distanceTo(this.wrist);
    this.open = !this.pinching && reach('index-finger-tip') > 0.12 && reach('middle-finger-tip') > 0.12 && reach('ring-finger-tip') > 0.11;
    if (dt > 0) this.velocity.subVectors(this.palm, this.last).divideScalar(dt);
    this.last.copy(this.palm);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
