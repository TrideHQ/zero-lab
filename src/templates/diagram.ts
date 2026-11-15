// Diagrams for the image panel are rendered from the same 3D templates, so the
// pictures always match the model. `scripts/render-diagrams.ts` pre-renders them
// to /img/gen at build time; this module is also the runtime fallback.
import * as THREE from 'three';
import type { State } from '../types.ts';
import { createTemplate } from './registry.ts';
import { U } from '../render/hologram-shader.ts';
import { t } from '../i18n/index.ts';
import type { PickTarget } from './types.ts';

export interface DiagramSpec { template: string; preset: string; params: State; state: State; labels?: boolean }

let renderer: THREE.WebGLRenderer | null = null;
let idle = 0;

function get(w: number, h: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setClearColor(0x0a1230, 1);
  }
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  clearTimeout(idle);
  // free the extra GL context once the panel has what it needs
  idle = window.setTimeout(() => {
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
  }, 4000);
  return renderer;
}

export async function renderDiagram(spec: DiagramSpec, w = 800, h = 600): Promise<string> {
  const tpl = await createTemplate(spec.template, spec.preset, spec.params, true);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  scene.add(tpl.group);
  tpl.setState(spec.state, { animate: false, reset: true });
  tpl.update(0, 0.6);
  const cam = new THREE.PerspectiveCamera(40, w / h, 0.05, 300);
  const v = tpl.view;
  const pitch = Math.min(v.pitch, 0.5);
  cam.position.set(v.target[0], v.target[1] + Math.sin(pitch) * v.dist, v.target[2] + Math.cos(pitch) * v.dist * 0.92);
  cam.lookAt(...v.target);
  cam.updateMatrixWorld();
  const r = get(w, h);
  const keep = U.uRevealY.value;
  U.uRevealY.value = 1e6;
  r.render(scene, cam);
  U.uRevealY.value = keep;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d')!;
  g.drawImage(r.domElement, 0, 0);
  if (spec.labels !== false) {
    const targets = tpl.pickTargets();
    const placed: { x: number; y: number }[] = [];
    g.font = '600 22px Inter, system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (const name of tpl.diagramTargets()) {
      const target: PickTarget | undefined = targets[name];
      if (!target) continue;
      const p = (Array.isArray(target) ? target[0].clone().lerp(target[1], 0.5) : target.clone()).applyMatrix4(tpl.group.matrixWorld).project(cam);
      const x = (p.x * 0.5 + 0.5) * w;
      let y = (-p.y * 0.5 + 0.5) * h;
      const text = t(`labels.${name}`);
      const tw = g.measureText(text).width + 16;
      let lx = x + 14;
      if (lx + tw > w - 6) lx = x - 14 - tw;
      while (placed.some((q) => Math.abs(q.y - y) < 28 && Math.abs(q.x - lx) < tw)) y += 28;
      placed.push({ x: lx, y });
      g.fillStyle = '#ffb347';
      g.beginPath();
      g.arc(x, (-p.y * 0.5 + 0.5) * h, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(10,18,48,0.85)';
      g.beginPath();
      g.roundRect(lx, y - 15, tw, 30, 8);
      g.fill();
      g.fillStyle = '#e8f7ff';
      g.fillText(text, lx + 8, y + 1);
    }
  }
  tpl.dispose();
  return out.toDataURL('image/webp', 0.86);
}
