// The lab partner's body: a small hologram that floats beside the bench and
// pulses when it speaks. (What it says comes from partner/client.ts.)
import * as THREE from 'three';
import { WARM, CYAN, glow, holo } from '../render/hologram-shader.ts';

export class PartnerBot {
  group = new THREE.Group();
  private core: THREE.Mesh;
  private ring: THREE.Mesh;
  private talk = 0;
  private home = new THREE.Vector3();

  constructor(x: number, y: number, z = 0.25, lite = false) {
    this.home.set(x, y, z);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, lite ? 0 : 1), holo(WARM, { opacity: 1, fill: 0.35, rim: 1.4 }));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 6, lite ? 20 : 40), glow(CYAN, 0.9));
    const eyeGeo = new THREE.SphereGeometry(0.016, 8, 6);
    for (const sx of [-0.035, 0.035]) {
      const eye = new THREE.Mesh(eyeGeo, glow(0xffffff, 1));
      eye.position.set(sx, 0.02, 0.095);
      this.core.add(eye);
    }
    this.group.add(this.core, this.ring);
    this.group.position.copy(this.home);
  }

  speak() {
    this.talk = 1;
  }

  update(dt: number, t: number) {
    this.talk = Math.max(0, this.talk - dt * 0.5);
    this.group.position.y = this.home.y + Math.sin(t * 1.6) * 0.025;
    this.ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.9) * 0.4;
    this.ring.rotation.y = t * 0.8;
    const s = 1 + this.talk * 0.18 * (0.5 + 0.5 * Math.sin(t * 16));
    this.core.scale.setScalar(s);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    this.group.removeFromParent();
  }
}
