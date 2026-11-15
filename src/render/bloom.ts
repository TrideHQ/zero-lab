// Subtle bloom for the browser view on capable devices. Never used in Lite mode
// or inside XR sessions (too costly, and XR renders through its own framebuffer).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface Bloom { render(): void; setSize(w: number, h: number): void; dispose(): void }

export function createBloom(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Bloom {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const pass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.18);
  composer.addPass(pass);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize: (w, h) => {
      composer.setSize(w, h);
      pass.resolution.set(w / 2, h / 2);
    },
    dispose: () => composer.dispose(),
  };
}
