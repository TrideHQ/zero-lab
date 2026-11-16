// Hand tracking: reads the WebXR hand joints each frame, draws light-weight
// hologram hands, and exposes the few points the gestures need.
import * as THREE from 'three';

/** Opaque, softly shaded material for the hands. Works with instancing and needs no scene lights. */
function handMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(SKIN) } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main() { float d = abs(dot(normalize(vN), normalize(vV))); vec3 c = uColor * (0.42 + 0.58 * d) + vec3(0.10, 0.16, 0.22) * pow(1.0 - d, 2.5); gl_FragColor = vec4(c, 1.0); }`,
  });
}
const SKIN = 0xe7d3c1, SKIN_PINCH = 0xffc27a;
// bones: finger chains from the wrist, plus webbing across the palm so the hand reads as solid
const CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8, 9], [0, 10, 11, 12, 13, 14], [0, 15, 16, 17, 18, 19], [0, 20, 21, 22, 23, 24]];
const BONES: [number, number, number][] = [];
for (const c of CHAINS) for (let i = 0; i < c.length - 1; i++) BONES.push([c[i], c[i + 1], i === 0 ? 0.0125 : i === 1 ? 0.0105 : 0.0085]);
for (const [a, b] of [[5, 10], [10, 15], [15, 20], [6, 11], [11, 16], [16, 21], [1, 5], [2, 6]]) BONES.push([a, b, 0.0125]);

const JOINTS: XRHandJoint[] = [
  'wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<XRHandJoint, number>;

const UP_Y = new THREE.Vector3(0, 1, 0);

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
  bones: THREE.InstancedMesh;
  private last = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private sc = new THREE.Vector3();
  private mid = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private m = new THREE.Matrix4();

  constructor(side: 'left' | 'right') {
    this.side = side;
    // one instanced mesh: a sphere per joint and a capsule-like cylinder per bone
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), handMaterial(), JOINTS.length);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), this.mesh.material, BONES.length);
    this.bones.frustumCulled = false;
    this.mesh.add(this.bones);
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
      const r = i === 0 ? 0.014 : i % 5 === 1 || i === 2 ? 0.0115 : 0.009;
      this.m.compose(this.joints[i], this.q.identity(), this.sc.setScalar(r));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    BONES.forEach(([a, b, r], i) => {
      this.dir.subVectors(this.joints[b], this.joints[a]);
      const len = this.dir.length() || 1e-4;
      this.q.setFromUnitVectors(UP_Y, this.dir.divideScalar(len));
      this.m.compose(this.mid.addVectors(this.joints[a], this.joints[b]).multiplyScalar(0.5), this.q, this.sc.set(r, len, r));
      this.bones.setMatrixAt(i, this.m);
    });
    this.bones.instanceMatrix.needsUpdate = true;
    const gap = this.thumbTip.distanceTo(this.indexTip);
    this.pinching = was ? gap < 0.035 : gap < 0.018; // hysteresis so a pinch does not flicker
    this.pinchStart = this.pinching && !was;
    this.pinchEnd = !this.pinching && was;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value.setHex(this.pinching ? SKIN_PINCH : SKIN);
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
    this.bones.geometry.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
