// Scan-line "materialise" sweep: the hologram draws itself from the floor up.
import * as THREE from 'three';
import { U } from './hologram-shader.ts';

const box = new THREE.Box3();
let raf = 0;

export function materialise(obj: THREE.Object3D, instant = false, onDone?: () => void) {
  cancelAnimationFrame(raf);
  if (instant) {
    U.uRevealY.value = 1e6;
    onDone?.();
    return;
  }
  obj.updateWorldMatrix(true, true);
  box.setFromObject(obj);
  const y0 = box.min.y - 0.05, y1 = box.max.y + 0.1;
  U.uRevealBand.value = Math.max(0.01, (y1 - y0) * 0.06);
  const start = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / 900);
    U.uRevealY.value = y0 + (y1 - y0) * (k * k * (3 - 2 * k));
    if (k < 1) raf = requestAnimationFrame(step);
    else {
      U.uRevealY.value = 1e6;
      onDone?.();
    }
  };
  step();
}
