// Hologram materials: additive, fresnel-rimmed, with travelling scan lines and
// a "materialise" sweep (everything above uRevealY is clipped, with a bright edge).
import * as THREE from 'three';

export const CYAN = 0x36e3ff;
export const TEAL = 0x1fb6d6;
export const WARM = 0xffb347;
export const WHITE = 0xe8f7ff;
// colour-blind-safe set for forces / heat / current (Okabe–Ito)
export const C_FORCE = 0xe69f00;
export const C_FORCE2 = 0x56b4e9;
export const C_GOOD = 0x009e73;
export const C_HOT = 0xd55e00;
export const C_ALT = 0xcc79a7;
export const C_YELLOW = 0xf0e442;

/** Shared by every hologram material. */
export const U = {
  uTime: { value: 0 },
  uRevealY: { value: 1e6 },
  uRevealBand: { value: 0.08 },
  uScanFreq: { value: 70 },
};

const VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(normalMatrix * normal);
  vec4 mv = viewMatrix * w;
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; uniform float uFill; uniform float uRim; uniform float uScan;
uniform float uTime; uniform float uRevealY; uniform float uRevealBand; uniform float uScanFreq;
varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main() {
  if (vW.y > uRevealY) discard;
  float edge = smoothstep(uRevealY - uRevealBand, uRevealY, vW.y);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uRim);
  float scan = 1.0 - uScan * (0.5 + 0.5 * sin(vW.y * uScanFreq - uTime * 2.5));
  float a = (uFill + fres * (1.0 - uFill)) * uOpacity * scan;
  gl_FragColor = vec4(uColor * (1.0 + edge * 3.0), clamp(a + edge * 0.6, 0.0, 1.0));
}`;

export interface HoloOpts { opacity?: number; fill?: number; rim?: number; scan?: number; side?: THREE.Side }

export function holo(color: number, o: HoloOpts = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...U,
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: o.opacity ?? 0.9 },
      uFill: { value: o.fill ?? 0.12 },
      uRim: { value: o.rim ?? 2.0 },
      uScan: { value: o.scan ?? 0.25 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: o.side ?? THREE.DoubleSide,
  });
}

/** Flat glowing surface (no rim falloff), e.g. arrows, needles, small solid parts. */
export const glow = (color: number, opacity = 0.9) => holo(color, { opacity, fill: 1, rim: 1, scan: 0.1 });

const LINE_VERT = /* glsl */ `
attribute vec4 aColor; varying vec4 vC; varying vec3 vW;
void main() {
  vC = aColor;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const LINE_FRAG = /* glsl */ `
uniform float uRevealY; uniform float uRevealBand;
varying vec4 vC; varying vec3 vW;
void main() {
  if (vW.y > uRevealY) discard;
  float edge = smoothstep(uRevealY - uRevealBand, uRevealY, vW.y);
  gl_FragColor = vec4(vC.rgb * (1.0 + edge * 3.0), vC.a);
}`;

export function lineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    uniforms: { uRevealY: U.uRevealY, uRevealBand: U.uRevealBand },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Thin additive outline of a mesh's hard edges. */
export function edges(geo: THREE.BufferGeometry, color = CYAN, opacity = 0.9, threshold = 20): THREE.LineSegments {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, threshold),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
}
