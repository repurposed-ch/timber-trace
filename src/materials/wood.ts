import * as THREE from "three";
import { presetFor, productLayout } from "./presets";

const vertex = /* glsl */ `
varying vec3 vPos;
varying vec3 vNormal;
void main() {
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */ `
precision highp float;
varying vec3 vPos;
varying vec3 vNormal;
uniform vec3 uBase, uLate, uSize;
uniform float uRings, uContrast, uKnots, uPores, uRibbon, uSeed, uLayer, uUnknown, uOpacity;
uniform int uMode;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}

// p: x along the grain, yz across it; pith: centre of the rings in yz
vec3 wood(vec3 p, vec2 pith, float seed) {
  vec2 v = p.yz - pith;
  float wobble = fbm(vec3(p.x * 1.2, p.y * 6.0, p.z * 6.0) + seed) - 0.5;
  float r = length(v) * (1.0 + 0.06 * wobble);

  // one possible knot per 0.6 m: a branch growing out radially from the pith
  float cell = floor(p.x / 0.6);
  float kx = (cell + 0.2 + 0.6 * hash(vec3(cell, seed, 1.0))) * 0.6;
  float ka = hash(vec3(cell, seed, 2.0)) * 6.2831;
  vec2 kd = vec2(cos(ka), sin(ka));
  float kt = dot(v, kd);
  float kdist = length(vec2(p.x - kx, length(v - kd * kt)));
  float krad = 0.008 + 0.012 * hash(vec3(cell, seed, 3.0));
  float hasKnot = step(hash(vec3(cell, seed, 4.0)), uKnots) * step(0.0, kt);
  float knot = hasKnot * (1.0 - smoothstep(krad * 0.6, krad, kdist));
  r += hasKnot * 0.006 * exp(-kdist * 40.0);

  float rr = r * uRings + 0.25 * wobble;
  float ring = fract(rr);
  float late = smoothstep(0.55, 0.85, ring) * (1.0 - smoothstep(0.92, 1.0, ring));
  // fade rings to their average once they get smaller than a pixel
  late = mix(late, 0.3, smoothstep(0.25, 0.7, fwidth(rr)));
  vec3 col = mix(uBase, uLate, late * uContrast);

  float grain = fbm(vec3(p.x * 4.0, p.y * 250.0, p.z * 250.0) + seed);
  col *= 0.88 + 0.22 * grain;

  float pore = step(0.78, noise(vec3(p.x * 60.0, p.y * 700.0, p.z * 700.0)));
  col *= 1.0 - uPores * 0.35 * pore * (1.0 - late);

  float ribbon = 0.5 + 0.5 * sin(atan(v.y, v.x) * 24.0 + 6.0 * fbm(p * 3.0 + seed));
  col *= 1.0 - uRibbon * 0.2 * ribbon;

  return mix(col, uLate * 0.55, knot);
}

// stacked layers along y, each cut from a different log
vec3 layered(vec3 p, float thickness, bool cross, float pithDist) {
  float y0 = p.y + uSize.y * 0.5;
  float idx = floor(y0 / thickness);
  float s = hash(vec3(idx, uSeed, 7.0));
  float ly = y0 - (idx + 0.5) * thickness;
  vec3 lp = cross && mod(idx, 2.0) > 0.5 ? vec3(p.z, ly, p.x) : vec3(p.x, ly, p.z);
  lp.x += s * 11.0;
  vec2 pith = vec2((s > 0.5 ? 1.0 : -1.0) * (thickness * 0.5 + pithDist * (0.3 + s)), (s - 0.5) * uSize.z);
  vec3 col = wood(lp, pith, s * 10.0) * (0.9 + 0.2 * hash(vec3(idx, uSeed, 9.0)));
  // glue lines: about one pixel wide at any zoom
  float u = y0 / thickness;
  float f = fract(u);
  float glue = 1.0 - smoothstep(0.0, 1.2 * fwidth(u), min(f, 1.0 - f));
  return col * (1.0 - 0.35 * glue);
}

void main() {
  vec3 p = vPos;
  vec3 col;
  if (uMode == 1) {
    col = layered(p, uLayer > 0.0 ? uLayer : uSize.y / 3.0, false, 0.05);
  } else if (uMode == 2) {
    col = layered(p, uLayer, true, 0.05);
  } else if (uMode == 3) {
    col = layered(p, uLayer, false, 0.25);
  } else if (uMode == 4) {
    col = wood(p, vec2(0.0), uSeed);
  } else if (uMode == 5) {
    float strand = noise(vec3(p.x * 5.0, p.y * 140.0, p.z * 140.0) + uSeed);
    col = mix(uBase, uLate, smoothstep(0.35, 0.65, strand) * uContrast) * (0.85 + 0.3 * noise(p * vec3(2.0, 400.0, 400.0)));
  } else {
    col = wood(p, vec2(-uSize.y * 0.5 - 0.06, uSize.z * 0.15), uSeed);
  }

  // unknown species: neutral with diagonal hatching
  float hatch = step(0.5, fract((p.x + p.y + p.z) * 30.0));
  col *= 1.0 - uUnknown * 0.08 * hatch;

  vec3 n = normalize(vNormal);
  float diff = max(dot(n, normalize(vec3(0.35, 0.8, 0.55))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.6, -0.2, 0.4))), 0.0);
  col *= 0.42 + 0.6 * diff + 0.15 * fill;
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}`;

export type WoodParams = {
  species: string;
  product: string;
  /** beam size in metres: x = length, y = height, z = width */
  size: [number, number, number];
  seed: number;
  opacity?: number;
};

const linear = (hex: string) => new THREE.Color(hex);

export function createWoodMaterial(params: WoodParams): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    extensions: { derivatives: true } as any,
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uBase: { value: new THREE.Color() },
      uLate: { value: new THREE.Color() },
      uSize: { value: new THREE.Vector3() },
      uRings: { value: 0 },
      uContrast: { value: 0 },
      uKnots: { value: 0 },
      uPores: { value: 0 },
      uRibbon: { value: 0 },
      uSeed: { value: 0 },
      uLayer: { value: 0 },
      uUnknown: { value: 0 },
      uOpacity: { value: 1 },
      uMode: { value: 0 },
    },
  });
  updateWoodMaterial(mat, params);
  return mat;
}

export function updateWoodMaterial(mat: THREE.ShaderMaterial, { species, product, size, seed, opacity = 1 }: WoodParams) {
  const preset = presetFor(species);
  const layout = productLayout(product);
  const u = mat.uniforms;
  u.uBase.value.copy(linear(preset.base));
  u.uLate.value.copy(linear(preset.late));
  u.uSize.value.set(...size);
  u.uRings.value = preset.rings;
  u.uContrast.value = preset.contrast;
  u.uKnots.value = preset.knots;
  u.uPores.value = preset.pores;
  u.uRibbon.value = preset.ribbon;
  u.uSeed.value = seed;
  u.uLayer.value = layout.layer;
  u.uMode.value = layout.mode;
  u.uUnknown.value = species === "unknown" || species === "other" ? 1 : 0;
  u.uOpacity.value = opacity;
  mat.transparent = opacity < 1;
  mat.depthWrite = opacity >= 1;
}
