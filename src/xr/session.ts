// WebXR entry points. Filled in by the XR step; the browser build works without it.
import type { Stage } from '../render/renderer.ts';
import type { XRApp } from './panel-spec.ts';

let app: XRApp | null = null;

export async function xrSupport(): Promise<{ vr: boolean; ar: boolean }> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) return { vr: false, ar: false };
  const ok = (m: XRSessionMode) => xr.isSessionSupported(m).catch(() => false);
  const [vr, ar] = await Promise.all([ok('immersive-vr'), ok('immersive-ar')]);
  return { vr, ar };
}
export function setXRApp(a: XRApp | null) {
  app = a;
}
export const xrApp = () => app;
export async function enterXR(_mode: 'vr' | 'ar', _stage: Stage): Promise<void> {
  throw new Error('XR mode is not built yet');
}
export const xrActive = () => false;
