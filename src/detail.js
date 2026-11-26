// Tiny tiling surface textures (64px, one per layer) that give every flat-shaded facet
// a material: planks, masonry, clay tiles, canvas, rock, sand, grass, iron, cobbles, thatch.
// RGB is an albedo multiplier around 1.0 (stored /2), A is relief height used for bump lighting.
// Approach after Cinderwatch (kevintngo, MIT); patterns written for Black Tide.
import * as THREE from 'three';
import { hash2i } from './util.js';

export const S = { PLAIN: 0, WOOD: 1, MASON: 2, TILE: 3, CLOTH: 4, ROCK: 5, SAND: 6, GRASS: 7, METAL: 8, COBBLE: 9, THATCH: 10 };
// default texture repeats per metre for each layer
export const SCALE = [0.3, 0.42, 0.34, 0.45, 0.36, 0.26, 0.32, 0.38, 0.6, 0.42, 0.42];
const N = 64, LAYERS = 11, TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const h2 = (x, y, s) => hash2i(x, y, s);
function pn(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const mx = k => ((k % px) + px) % px, my = k => ((k % py) + py) % py;
  const a = h2(mx(xi), my(yi), s), b = h2(mx(xi + 1), my(yi), s), c = h2(mx(xi), my(yi + 1), s), d = h2(mx(xi + 1), my(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pf(x, y, per, s, oct) { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { t += a * pn(x * f, y * f, per * f, per * f, s + i * 7); n += a; a *= 0.5; f *= 2; } return t / n; }

export function makeDetail() {
  const data = new Uint8Array(N * N * 4 * LAYERS);
  const put = (L, x, y, r, g, b, h) => {
    const i = ((L * N + y) * N + x) * 4;
    data[i] = clamp(r * 127.5, 0, 255); data[i + 1] = clamp(g * 127.5, 0, 255); data[i + 2] = clamp(b * 127.5, 0, 255); data[i + 3] = clamp(h * 255, 0, 255);
  };
  // voronoi sites for cobbles
  const CG = 7, CS = N / CG, sites = [];
  for (let j = 0; j < CG; j++) for (let i = 0; i < CG; i++) sites.push([(i + 0.2 + 0.6 * h2(i, j, 11)) * CS, (j + 0.2 + 0.6 * h2(i, j, 12)) * CS, h2(i, j, 13), h2(i, j, 14)]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // plain: plaster with soft mottling
    { const n = pf(x / 8, y / 8, 8, 1, 3), sp = h2(x, y, 2); let m = 0.95 + (n - 0.5) * 0.16 + (sp < 0.03 ? -0.08 : 0); put(S.PLAIN, x, y, m, m, m * 0.99, 0.5 + (n - 0.5) * 0.3); }
    // wood: planks run along v (texture y); 8px wide planks, butt joints, grain, nails, knots
    {
      const pl = Math.floor(x / 8), lx = x % 8, id = h2(pl, 0, 41);
      const grain = pn(x * 1.25, y / 7, 80, 9, 42 + pl), g2 = pn(x * 2.5, y / 3, 160, 21, 44);
      let m = 0.8 + 0.28 * id + (grain - 0.5) * 0.34 + (g2 - 0.5) * 0.12, h = 0.55 + grain * 0.25;
      const joint = Math.floor(8 + id * 48);
      if (lx === 0 || y === joint) { m = 0.42; h = 0.08; }
      else if (lx === 1) m += 0.06; else if (lx === 7) m -= 0.08;
      if ((y === (joint + 3) % N || y === (joint + N - 3) % N) && (lx === 2 || lx === 6)) { m = 0.36; h = 0.85; }
      const kd = Math.hypot(lx - 4, y - (joint + 29) % N); if (kd < 2.4 && id > 0.55) m -= 0.22 * (1 - kd / 2.4);
      put(S.WOOD, x, y, m * 1.03, m, m * 0.95, h);
    }
    // masonry: coursed stone blocks
    {
      const row = Math.floor(y / 8), ox = (row & 1) ? 8 : 0, bx = Math.floor((x + ox) / 16), lx = (x + ox) % 16, ly = y % 8;
      const id = h2(bx % 4, row, 31), id2 = h2(bx % 4, row, 32), n = pn(x / 2, y / 2, 32, 32, 33) - 0.5;
      let m = 0.8 + 0.32 * id + n * 0.22, h = 0.66 + 0.2 * id2 + n * 0.15;
      if (id2 > 0.86) { m -= 0.12; h -= 0.22; }
      if (ly === 1 || lx === 1) m += 0.09;
      if (ly === 7 || lx === 15) m -= 0.1;
      let r = m * (1 + (id - 0.5) * 0.07), g = m, b = m * (1 - (id - 0.5) * 0.09);
      if (ly === 0 || lx === 0) { r = g = b = 0.5 + n * 0.1; h = 0.1; }
      put(S.MASON, x, y, r, g, b, h);
    }
    // clay roof tiles: rows of half-round tiles, shadowed under each course
    {
      const row = Math.floor(y / 8), ox = (row & 1) ? 4 : 0, tx = Math.floor((x + ox) / 8), lx = (x + ox) % 8, ly = y % 8;
      const id = h2(tx % 8, row, 71), n = pn(x / 2, y / 2, 32, 32, 73) - 0.5;
      const round = Math.sin((lx + 0.5) / 8 * Math.PI);
      let m = 0.72 + 0.3 * id + n * 0.12 + round * 0.18, h = 0.25 + 0.45 * round + 0.25 * (ly / 7);
      if (ly === 0) { m -= 0.35; h = 0.05; } if (ly === 7) m += 0.08;
      if (lx === 0) { m -= 0.18; h -= 0.2; }
      put(S.TILE, x, y, m * (1 + (id - 0.5) * 0.12), m, m * (1 - (id - 0.5) * 0.1), h);
    }
    // canvas: weave, vertical panel seams, a few stains
    {
      const w = ((x + y) & 1) ? 1.04 : 0.96, n = pf(x / 16, y / 16, 4, 81, 3), st = pf(x / 8 + 3, y / 8, 8, 83, 2);
      let m = w * (0.9 + 0.2 * n), h = 0.5 + (w - 1) * 0.8;
      if (x % 16 === 0) { m *= 0.86; h = 0.3; } else if (x % 16 === 1) m *= 1.04;
      if (st > 0.7) m *= 0.88;
      put(S.CLOTH, x, y, m, m * 0.99, m * 0.95, h);
    }
    // rock: fbm, cracks, strata
    {
      const n = pf(x / 8, y / 8, 8, 21, 4), n2 = pf(x / 16, y / 16, 4, 23, 3), n3 = pf(x / 16 + 9, y / 16 + 3, 4, 27, 3);
      const crack = (Math.abs(n2 - 0.5) < 0.022 || Math.abs(n3 - 0.52) < 0.016) ? 1 : 0;
      const strata = Math.sin((y + n2 * 26) * TAU / 16) * 0.05;
      const m = 0.74 + 0.42 * n + strata - crack * 0.34 + (h2(x, y, 29) - 0.5) * 0.08;
      put(S.ROCK, x, y, m, m, m * 1.03, 0.3 + 0.6 * n - crack * 0.4);
    }
    // sand: speckle and soft ripples
    {
      const rip = Math.sin((x * 0.35 + pf(x / 16, y / 16, 4, 91, 2) * 9 + y * 0.12) * 1.0), sp = h2(x, y, 93), n = pf(x / 8, y / 8, 8, 95, 3);
      let m = 0.95 + rip * 0.05 + (n - 0.5) * 0.14 + (sp > 0.97 ? 0.12 : sp < 0.03 ? -0.12 : 0);
      put(S.SAND, x, y, m * 1.01, m, m * 0.97, 0.45 + rip * 0.12 + (n - 0.5) * 0.2);
    }
    // grass/foliage: tufts and blades
    {
      const n = pf(x / 8, y / 8, 8, 101, 3), b = h2(x, y >> 1, 103), sp = h2(x, y, 105);
      let m = 0.86 + (n - 0.5) * 0.3 + (b > 0.8 ? 0.16 : b < 0.15 ? -0.14 : 0);
      if (sp > 0.985) m += 0.25;
      put(S.GRASS, x, y, m * 0.98, m * 1.02, m * 0.95, 0.4 + n * 0.35 + (b - 0.5) * 0.25);
    }
    // iron: brushed, pitted, a little rust
    {
      const st = pn(x / 3, y * 1.5, 21, 96, 61) - 0.5, rust = pf(x / 16, y / 16, 4, 63, 3), pit = h2(x, y, 65);
      let m = 0.92 + st * 0.22, r = m, g = m, b = m * 1.03, h = 0.5 + st * 0.12;
      if (rust > 0.6) { const k = sm(0.6, 0.74, rust); r = r + (m * 1.05 - r) * k; g = g + (m * 0.72 - g) * k; b = b + (m * 0.52 - b) * k; }
      if (pit < 0.03) { r *= 0.7; g *= 0.7; b *= 0.7; h -= 0.2; }
      put(S.METAL, x, y, r, g, b, h);
    }
    // cobbles: voronoi stones with sunken joints
    {
      let d1 = 1e9, d2 = 1e9, s1 = null;
      for (const s of sites) {
        let dx = Math.abs(x + 0.5 - s[0]), dy = Math.abs(y + 0.5 - s[1]); if (dx > N / 2) dx = N - dx; if (dy > N / 2) dy = N - dy;
        const d = Math.sqrt(dx * dx * 0.85 + dy * dy * 1.15);
        if (d < d1) { d2 = d1; d1 = d; s1 = s; } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1, n = pn(x / 2, y / 2, 32, 32, 51) - 0.5;
      if (edge < 1.2) put(S.COBBLE, x, y, 0.4, 0.38, 0.36, 0.04);
      else {
        const dome = sm(1.2, 4.4, edge), m = 0.72 + 0.4 * s1[2] + n * 0.16 + dome * 0.1, warm = (s1[3] - 0.5) * 0.12;
        put(S.COBBLE, x, y, m * (1 + warm), m, m * (1 - warm), 0.25 + 0.7 * dome + n * 0.1);
      }
    }
    // palm thatch
    {
      const st = pn(x * 1.6, y / 5, 103, 13, 111), row = y % 16;
      let m = 0.76 + 0.42 * st; if (row === 0) m -= 0.3; if (row === 1) m += 0.08;
      put(S.THATCH, x, y, m * 1.04, m, m * 0.88, 0.3 + st * 0.5 + (row / 16) * 0.2);
    }
  }
  const t = new THREE.DataArrayTexture(data, N, N, LAYERS);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

// Inject detail sampling and bump relief into a MeshStandardMaterial.
export function enhance(mat, D, key, extra) {
  mat.customProgramCacheKey = () => 'bt-detail-' + key;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = D.uDetail; sh.uniforms.uBump = D.uBump;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSurf; varying vec2 vSurf; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf; vObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray uDetail; uniform float uBump; varying vec2 vSurf; varying vec3 vObj;
vec3 btPerturb(vec3 sp, vec3 sn, vec2 dH, float fd){
  vec3 sx = dFdx(sp), sy = dFdy(sp); vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd; vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * sn - g);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float btH = 0.5;
{
  vec3 on = normalize(cross(dFdx(vObj), dFdy(vObj))); vec3 an = abs(on);
  float layer = floor(vSurf.x + 0.5), sc = vSurf.y;
  bool top = an.y > max(an.x, an.z);
  vec2 duv;
  if (layer == 1.0) duv = top ? vObj.zx : vec2(vObj.y, an.x > an.z ? vObj.z : vObj.x);
  else if (layer == 3.0 || layer == 10.0) duv = top ? vObj.xz : vec2(an.x > an.z ? vObj.z : vObj.x, vObj.y);
  else duv = top ? vObj.xz : (an.x > an.z ? vObj.zy : vObj.xy);
  vec4 dt = texture(uDetail, vec3(duv * sc, layer));
  diffuseColor.rgb *= dt.rgb * 2.0;
  btH = dt.a;
}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
normal = btPerturb(-vViewPosition, normal, vec2(dFdx(btH), dFdy(btH)) * uBump, faceDirection);`);
    if (extra) extra(sh);
  };
  return mat;
}
