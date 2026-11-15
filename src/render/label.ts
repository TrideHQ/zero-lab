import * as THREE from 'three';

export interface LabelOpts { color?: string; size?: number; bg?: string | null; weight?: number }

/** Text sprite backed by a small canvas texture. `size` is the text height in model units. */
export class Label {
  sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private text = '';
  private o: Required<LabelOpts>;

  constructor(text: string, o: LabelOpts = {}) {
    this.o = { color: o.color ?? '#e8f7ff', size: o.size ?? 0.09, bg: o.bg ?? null, weight: o.weight ?? 600 };
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false }));
    this.sprite.renderOrder = 10;
    this.set(text);
  }

  set(text: string) {
    if (text === this.text) return;
    this.text = text;
    const px = 48;
    const ctx = this.canvas.getContext('2d')!;
    const font = `${this.o.weight} ${px}px Inter, system-ui, sans-serif`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 28;
    const hgt = px + 24;
    this.canvas.width = w;
    this.canvas.height = hgt;
    ctx.font = font;
    if (this.o.bg) {
      ctx.fillStyle = this.o.bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, w, hgt, 14);
      ctx.fill();
    }
    ctx.fillStyle = this.o.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, hgt / 2 + 2);
    this.tex.dispose();
    this.tex.needsUpdate = true;
    const s = (this.o.size * hgt) / px;
    this.sprite.scale.set((s * w) / hgt, s, 1);
  }

  at(x: number, y: number, z = 0): this {
    this.sprite.position.set(x, y, z);
    return this;
  }

  dispose() {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}
