// Phone AR: hit-test against real surfaces, show a reticle, and place the lab
// bench where the student taps. Pinch on screen scales it; drag turns it.
import * as THREE from 'three';
import { WARM, glow } from '../render/hologram-shader.ts';

export class ArPlacement {
  reticle: THREE.Mesh;
  placed = false;
  private source: XRHitTestSource | null = null;
  private m = new THREE.Matrix4();
  hasHit = false;

  constructor() {
    const g = new THREE.RingGeometry(0.09, 0.11, 32);
    g.rotateX(-Math.PI / 2);
    this.reticle = new THREE.Mesh(g, glow(WARM, 1));
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
  }

  async start(session: XRSession) {
    try {
      const viewer = await session.requestReferenceSpace('viewer');
      this.source = (await session.requestHitTestSource?.({ space: viewer })) ?? null;
    } catch {
      this.source = null; // no hit-test: the lab is placed in front of the camera instead
    }
  }

  update(frame: XRFrame, ref: XRReferenceSpace) {
    this.hasHit = false;
    if (this.placed || !this.source) {
      this.reticle.visible = false;
      return;
    }
    const pose = frame.getHitTestResults(this.source)[0]?.getPose(ref);
    this.reticle.visible = !!pose;
    if (pose) {
      this.hasHit = true;
      this.m.fromArray(pose.transform.matrix);
      this.reticle.matrix.copy(this.m);
    }
  }

  /** Put `root` on the surface under the reticle (or 0.8 m in front of the camera), scaled to fit a desk. */
  place(root: THREE.Object3D, camera: THREE.Camera, scale = 0.22) {
    const pos = new THREE.Vector3();
    const cam = new THREE.Vector3();
    camera.getWorldPosition(cam);
    if (this.hasHit) pos.setFromMatrixPosition(this.reticle.matrix);
    else {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      pos.copy(cam).addScaledVector(dir.normalize(), 0.8).setY(cam.y - 0.45);
    }
    root.position.copy(pos);
    root.scale.setScalar(scale);
    root.rotation.set(0, Math.atan2(cam.x - pos.x, cam.z - pos.z), 0); // face the student
    this.placed = true;
    this.reticle.visible = false;
  }

  dispose() {
    this.source?.cancel();
    this.reticle.geometry.dispose();
    (this.reticle.material as THREE.Material).dispose();
    this.reticle.removeFromParent();
  }
}
