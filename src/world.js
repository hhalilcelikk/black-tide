// The islands: one height function drives the faceted terrain, the water depth texture,
// and the placement of palms, trees, the port town, the fort, the dock and the lighthouse.
import * as THREE from 'three';
import { Geo, C, V, mat, roughen } from './geo.js';
import { mulberry32, fbm, hash2i, smoothstep, clamp, lerp, smax } from './util.js';
import { S as DS } from './detail.js';

export const BLOBS = [
  { x: -52, z: -194, r: 96, h: 34, s: 1 },   // Isla Rosalind, main body
  { x: 26, z: -118, r: 27, h: 12, s: 2 },    // fort headland
  { x: -122, z: -128, r: 31, h: 8, s: 3 },   // west arm
  { x: -186, z: 74, r: 30, h: 15, s: 4 },    // lighthouse island
  { x: 152, z: 44, r: 21, h: 6, s: 5 },      // palm cay
  { x: 36, z: 170, r: 15, h: 4, s: 7 },      // south cay
  { x: 92, z: -34, r: 5.5, h: 7, s: 8 },     // sea stacks
  { x: 99, z: -26, r: 3.6, h: 4, s: 9 },
  { x: 86, z: -22, r: 3.0, h: 3, s: 10 },
];

export const AREA = { x: -320, z: -340, size: 640 };

export function heightAt(x, z) {
  let H = -28;
  for (const b of BLOBS) {
    const dx = x - b.x, dz = z - b.z;
    const d = Math.hypot(dx, dz);
    let hb;
    if (d > b.r * 2.2) hb = -(d / b.r - 1) * b.r * 0.3;
    else {
      const ca = dx / (d + 1e-6), sa = dz / (d + 1e-6);
      const warp = 1 + 0.44 * (fbm(ca * 1.4 + b.s * 7.3, sa * 1.4 + b.s * 3.1, 3, 3) - 0.5) + 0.05 * Math.sin(Math.atan2(dz, dx) * 5 + b.s);
      const t = d / (b.r * warp);
      hb = t < 1 ? b.h * Math.pow(1 - t * t, 1.1) : -(t - 1) * b.r * 0.3;
    }
    H = smax(H, hb, 4);
  }
  const up = smoothstep(0.5, 7, H);
  if (up > 0 || H > 0) H += (fbm(x * 0.017, z * 0.017, 11, 4) - 0.5) * 12 * up + (fbm(x * 0.06, z * 0.06, 12, 3) - 0.5) * 2.6 * smoothstep(1, 4, H);
  if (H > -2 && H < 3) H = -2 + (H + 2) * 0.73; else if (H >= 3) H = H - 1.35;
  return Math.max(H, -28);
}

export function slopeAt(x, z) {
  const gx = heightAt(x + 1.5, z) - heightAt(x - 1.5, z), gz = heightAt(x, z + 1.5) - heightAt(x, z - 1.5);
  return { s: Math.hypot(gx, gz) / 3, gx: gx / 3, gz: gz / 3 };
}

export function bakeHeight(res = 512) {
  const data = new Uint16Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = AREA.x + (i + 0.5) / res * AREA.size, z = AREA.z + (j + 0.5) / res * AREA.size;
    data[j * res + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const PAL = {
  wet: C('#c4ad7e'), sand: C('#ecd8a3'), sand2: C('#e3cb92'), dry: C('#b8ad6c'),
  grass: C('#7da650'), grass2: C('#6c9947'), forest: C('#4d7a3a'), forest2: C('#3e6833'),
  rock: C('#a19580'), rock2: C('#82776a'), dirt: C('#bf9b69'),
};

function groundColor(x, h, z, ny, town) {
  const n = fbm(x * 0.05, z * 0.05, 21, 3);
  if (h < 0.15) return PAL.wet;
  if (ny < 0.74 && h > 1.0) return ny < 0.6 ? PAL.rock2 : PAL.rock;
  if (h < 1.45) return n > 0.5 ? PAL.sand : PAL.sand2;
  if (town > 0.5 && h < 16) return n > 0.45 ? PAL.dirt : PAL.dry;
  if (h < 2.3) return PAL.dry;
  if (h > 9 || n > 0.56) return n > 0.62 ? PAL.forest2 : PAL.forest;
  return n > 0.45 ? PAL.grass : PAL.grass2;
}

const TOWN = { x: -50, z: -116, r: 46 };

export function makeTerrain(U) {
  const sp = 2.4, x0 = -262, x1 = 222, z0 = -318, z1 = 218;
  const nx = Math.round((x1 - x0) / sp), nz = Math.round((z1 - z0) / sp);
  const P = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * sp + (hash2i(i, j, 77) - 0.5) * sp * 0.55;
    const z = z0 + j * sp + (hash2i(i, j, 78) - 0.5) * sp * 0.55;
    P.push(V(x, heightAt(x, z), z));
  }
  const g = new Geo(3, 0.07);
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nn = new THREE.Vector3();
  const tri = (a, b, c) => {
    if (Math.max(a.y, b.y, c.y) < -6) return;
    ab.subVectors(b, a); ac.subVectors(c, a); nn.crossVectors(ab, ac).normalize();
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
    const town = 1 - smoothstep(TOWN.r * 0.75, TOWN.r, Math.hypot(cx - TOWN.x, (cz - TOWN.z) * 1.4));
    const gc = groundColor(cx, cy, cz, Math.abs(nn.y), town);
    g.surf(gc === PAL.rock || gc === PAL.rock2 ? DS.ROCK : gc === PAL.sand || gc === PAL.sand2 || gc === PAL.wet ? DS.SAND : gc === PAL.dirt || gc === PAL.dry ? (town > 0.5 ? DS.COBBLE : DS.SAND) : DS.GRASS);
    g.tri(a, b, c, gc);
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = P[j * (nx + 1) + i], b = P[j * (nx + 1) + i + 1], c = P[(j + 1) * (nx + 1) + i], d = P[(j + 1) * (nx + 1) + i + 1];
    if ((i + j) & 1) { tri(a, c, b); tri(b, c, d); } else { tri(a, c, d); tri(a, d, b); }
  }
  const mesh = new THREE.Mesh(g.build(), U.enhance(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide }), 'terrain'));
  mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

// ---------- vegetation ----------
function palmGeo(seed) {
  const r = mulberry32(seed);
  const g = new Geo(seed, 0.08);
  const H = 8, bend = 1.5, seg = 6;
  let prev = V(0, -0.5, 0);
  for (let i = 1; i <= seg; i++) {
    const t = i / seg, p = V(bend * t * t, H * t, 0);
    g.surf(DS.THATCH, 1.2); g.rod(prev, p, 0.27 - 0.09 * (t - 1 / seg), 0.25 - 0.09 * t, 5, i % 2 ? C('#8c6c46') : C('#735737'), 0.04);
    prev = p;
  }
  const top = prev;
  g.ico(0.42, 0, mat(top.x, top.y, top.z), C('#6b4f2c'));
  for (let k = 0; k < 3; k++) g.ico(0.17, 0, mat(top.x + Math.cos(k * 2.1) * 0.32, top.y - 0.38, top.z + Math.sin(k * 2.1) * 0.32), C('#5a3f23'));
  g.surf(DS.GRASS, 0.9);
  const greens = [C('#4f8c3a'), C('#609c42'), C('#457d34'), C('#6aa648')];
  const nf = 9;
  for (let f = 0; f < nf; f++) {
    const a = (f / nf) * Math.PI * 2 + r() * 0.4;
    const len = 3.6 + r() * 1.3, droop = 1.5 + r() * 0.9, lift = 0.8 + r() * 0.4;
    const dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a));
    const Pt = t => top.clone().addScaledVector(dir, len * t).add(V(0, lift * t - droop * t * t, 0));
    const Wd = t => 0.62 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95));
    const ca = greens[f % 4], cb = greens[(f + 1) % 4];
    for (let s = 0; s < 4; s++) {
      const t0 = s / 4, t1 = (s + 1) / 4;
      const a0 = Pt(t0), a1 = Pt(t1), w0 = Wd(t0), w1 = Wd(t1);
      const l0 = a0.clone().addScaledVector(side, w0).add(V(0, -0.18 * w0, 0)), l1 = a1.clone().addScaledVector(side, w1).add(V(0, -0.18 * w1, 0));
      const q0 = a0.clone().addScaledVector(side, -w0).add(V(0, -0.18 * w0, 0)), q1 = a1.clone().addScaledVector(side, -w1).add(V(0, -0.18 * w1, 0));
      g.quad(a0, a1, l1, l0, ca); g.quad(a0, q0, q1, a1, cb);
    }
  }
  return g.build();
}

function treeGeo(seed) {
  const r = mulberry32(seed);
  const g = new Geo(seed, 0.07);
  g.surf(DS.WOOD, 0.8); g.rod(V(0, -0.5, 0), V(0.2, 3.4, 0.1), 0.32, 0.2, 5, C('#6e5134')); g.surf(DS.GRASS, 0.55);
  const greens = [C('#3f6e34'), C('#4f7f3c'), C('#365f2f'), C('#5a8a40')];
  const n = 3 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const s = 1.8 + r() * 1.3;
    const geo = roughen(new THREE.IcosahedronGeometry(1, 0), 0.35, seed * 7 + k);
    g.add(geo, mat((r() - 0.5) * 2.4, 4.4 + r() * 1.6, (r() - 0.5) * 2.4, r(), r() * 6, 0, s, s * 0.85, s), greens[k % 4]);
  }
  return g.build();
}

function bushGeo(seed) {
  const g = new Geo(seed, 0.08);
  g.surf(DS.GRASS, 0.6);
  g.add(roughen(new THREE.IcosahedronGeometry(1, 0), 0.3, seed), mat(0, 0.35, 0, 0, 0, 0, 1.5, 0.85, 1.3), C('#4d7d3a'));
  g.add(roughen(new THREE.IcosahedronGeometry(0.8, 0), 0.3, seed + 1), mat(0.9, 0.3, 0.4, 0, 1, 0, 1, 0.8, 1), C('#5f8f44'));
  return g.build();
}

function scatter(U, geo, count, pick, seed, matOpts = {}) {
  const r = mulberry32(seed);
  const mats = [];
  let tries = 0;
  while (mats.length < count && tries < count * 40) {
    tries++;
    const x = lerp(-255, 215, r()), z = lerp(-310, 210, r());
    const m = pick(x, z, r);
    if (m) mats.push(m);
  }
  const mesh = new THREE.InstancedMesh(geo, U.enhance(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide, ...matOpts }), 'veg'), mats.length);
  const col = new THREE.Color();
  mats.forEach((m, i) => { mesh.setMatrixAt(i, m); col.setRGB(0.85 + r() * 0.3, 0.88 + r() * 0.24, 0.85 + r() * 0.25); mesh.setColorAt(i, col); });
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// ---------- buildings ----------
const WALLS = ['#f1e3c2', '#e9c88e', '#e8b7a0', '#b8d3c9', '#dca660', '#f3ebd8', '#c5d6e0', '#e6d27a'].map(C);
const ROOFS = ['#b4533a', '#a2452f', '#c46a48', '#8f3f2e', '#b65c3c'].map(C);
const SHUTTERS = ['#3e6b59', '#2e5577', '#7a3b2a', '#4a5f2e'].map(C);
const STONE = C('#8c8272'), WOOD = C('#5a4330'), DARKWOOD = C('#3f2d20'), GLASS = C('#24262b');

function pt(m, x, y, z) { return V(x, y, z).applyMatrix4(m); }

function addHouse(g, gw, x, z, rot, w, d, hgt, wallC, roofC, r, glowChance) {
  const h0 = Math.min(heightAt(x - w / 2, z - d / 2), heightAt(x + w / 2, z - d / 2), heightAt(x - w / 2, z + d / 2), heightAt(x + w / 2, z + d / 2));
  const h1 = Math.max(heightAt(x - w / 2, z - d / 2), heightAt(x + w / 2, z - d / 2), heightAt(x - w / 2, z + d / 2), heightAt(x + w / 2, z + d / 2));
  const ground = h1 - 0.2, y0 = h0 - 1.5, top = ground + hgt;
  g.surf(DS.MASON); g.box(w + 0.3, ground + 0.55 - y0, d + 0.3, mat(x, (ground + 0.55 + y0) / 2, z, 0, rot), STONE);
  g.surf(DS.PLAIN); g.box(w, top - ground - 0.5, d, mat(x, (top + ground + 0.5) / 2, z, 0, rot), wallC);
  const m = mat(x, top, z, 0, rot);
  const ov = 0.45, L = w / 2 + ov, D = d / 2 + ov, rh = 1.7 + r() * 0.9;
  g.surf(DS.TILE);
  g.quad(pt(m, -L, -0.15, D), pt(m, L, -0.15, D), pt(m, L, rh, 0), pt(m, -L, rh, 0), roofC);
  g.quad(pt(m, L, -0.15, -D), pt(m, -L, -0.15, -D), pt(m, -L, rh, 0), pt(m, L, rh, 0), roofC);
  g.surf(DS.PLAIN);
  for (const s of [-1, 1]) g.tri(pt(m, s * w / 2, 0, d / 2), pt(m, s * w / 2, 0, -d / 2), pt(m, s * w / 2, rh * 0.92, 0), wallC);
  g.surf(DS.MASON);
  if (r() < 0.45) g.box(0.8, 1.6, 0.8, mat(...pt(m, w * 0.25, rh * 0.75, -d * 0.1).toArray(), 0, rot), STONE);
  g.surf(DS.WOOD);
  const fm = mat(x, ground, z, 0, rot);
  // door
  g.box(1.05, 2.0, 0.12, mat(...pt(fm, (r() - 0.5) * w * 0.3, 1.0 + 0.5, d / 2 + 0.03).toArray(), 0, rot), DARKWOOD);
  const storeys = hgt > 5 ? 2 : 1;
  const sh = SHUTTERS[Math.floor(r() * SHUTTERS.length)];
  const nw = Math.max(1, Math.floor(w / 2.4));
  for (let s = 0; s < storeys; s++) for (let i = 0; i < nw; i++) {
    const wx = -w / 2 + (i + 0.5) * w / nw;
    if (s === 0 && Math.abs(wx) < 0.9) continue;
    const wy = 0.5 + 1.9 + s * 2.4;
    if (wy > hgt - 0.6) continue;
    const lit = r() < glowChance;
    (lit ? gw : g).box(0.7, 0.95, 0.1, mat(...pt(fm, wx, wy, d / 2 + 0.04).toArray(), 0, rot), lit ? C('#ffffff') : GLASS);
    for (const k of [-1, 1]) g.box(0.36, 0.98, 0.08, mat(...pt(fm, wx + k * 0.56, wy, d / 2 + 0.08).toArray(), 0, rot), sh);
  }
  // side windows
  for (const sgn of [-1, 1]) {
    if (r() < 0.4) continue;
    const lit = r() < glowChance;
    (lit ? gw : g).box(0.1, 0.9, 0.65, mat(...pt(fm, sgn * (w / 2 + 0.04), 2.3, 0).toArray(), 0, rot), lit ? C('#ffffff') : GLASS);
  }
  // balcony on tall houses
  if (storeys === 2 && r() < 0.6) {
    g.box(w * 0.7, 0.18, 1.1, mat(...pt(fm, 0, 3.05, d / 2 + 0.55).toArray(), 0, rot), WOOD);
    g.box(w * 0.7, 0.08, 0.08, mat(...pt(fm, 0, 4.0, d / 2 + 1.05).toArray(), 0, rot), DARKWOOD);
    for (let i = 0; i <= 6; i++) g.box(0.07, 0.9, 0.07, mat(...pt(fm, -w * 0.35 + i * w * 0.7 / 6, 3.55, d / 2 + 1.05).toArray(), 0, rot), DARKWOOD);
  }
  return { x, z, top };
}

function addChurch(g, gw, x, z, rot) {
  const gr = heightAt(x, z) + 0.2, y0 = gr - 3;
  const white = C('#efe6d0'), roof = C('#a8482f');
  g.surf(DS.PLAIN);
  g.box(8, gr + 7 - y0, 15, mat(x, (gr + 7 + y0) / 2, z, 0, rot), white);
  const m = mat(x, gr + 7, z, 0, rot);
  const L = 4.5, D = 7.9, rh = 3.4;
  g.surf(DS.TILE); g.quad(pt(m, -L, -0.1, D), pt(m, -L, -0.1, -D), pt(m, 0, rh, -D), pt(m, 0, rh, D), roof);
  g.quad(pt(m, L, -0.1, -D), pt(m, L, -0.1, D), pt(m, 0, rh, D), pt(m, 0, rh, -D), roof);
  g.surf(DS.PLAIN); for (const s of [-1, 1]) g.tri(pt(m, -4, 0, s * 7.5), pt(m, 4, 0, s * 7.5), pt(m, 0, rh * 0.95, s * 7.5), white);
  const tm = mat(x, gr, z, 0, rot);
  const tz = 9.3;
  g.box(4.2, 16 - (y0 - gr), 4.2, mat(...pt(tm, 0, (16 + y0 - gr) / 2, tz).toArray(), 0, rot), white);
  g.box(4.6, 0.4, 4.6, mat(...pt(tm, 0, 12.4, tz).toArray(), 0, rot), C('#d9cdb0'));
  for (const [ax, az] of [[2.12, 0], [-2.12, 0], [0, 2.12], [0, -2.12]]) g.box(Math.abs(ax) > 0 ? 0.1 : 1.1, 1.8, Math.abs(az) > 0 ? 0.1 : 1.1, mat(...pt(tm, ax, 14.2, tz + az).toArray(), 0, rot), C('#2c2620'));
  g.surf(DS.TILE); g.add(new THREE.ConeGeometry(3.3, 4.2, 4), mat(...pt(tm, 0, 18.1, tz).toArray(), 0, rot + Math.PI / 4), roof); g.surf(DS.WOOD);
  g.box(0.18, 1.8, 0.18, mat(...pt(tm, 0, 21.0, tz).toArray(), 0, rot), C('#3a3128'));
  g.box(0.9, 0.16, 0.16, mat(...pt(tm, 0, 21.3, tz).toArray(), 0, rot), C('#3a3128'));
  g.box(1.6, 2.6, 0.15, mat(...pt(tm, 0, 1.3, tz + 2.12).toArray(), 0, rot), DARKWOOD);
  gw.box(1.0, 1.0, 0.12, mat(...pt(tm, 0, 9.6, tz + 2.13).toArray(), 0, rot), C('#ffffff'));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) gw.box(0.12, 1.7, 0.8, mat(...pt(tm, s * 4.03, 3.5, -5 + i * 3.4).toArray(), 0, rot), C('#ffffff'));
}

function addFort(g, gw, cx, cz, lights, flags) {
  const gy = heightAt(cx, cz);
  const stone = C('#bfae8e'), stone2 = C('#a69676'), dark = C('#7f7360');
  const base = gy - 6, top = gy + 4.0, R = 12;
  g.surf(DS.MASON);
  // curtain walls
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const m = mat(cx + Math.cos(a) * R, (top + base) / 2, cz + Math.sin(a) * R, 0, -a);
    g.box(2.6, top - base, 2 * R - 2, m, stone);
    // merlons on outer edge
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 1) continue;
      const t = -R + 2 + i * (2 * R - 4) / 11;
      const p = pt(mat(cx, 0, cz, 0, -a), R + 0.9, top + 0.55, t);
      g.box(0.8, 1.1, 1.1, mat(p.x, p.y, p.z, 0, -a), stone2);
    }
  }
  // bastions at the corners (diamonds)
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const bx = cx + Math.cos(a) * R * 1.42, bz = cz + Math.sin(a) * R * 1.42;
    g.box(8.5, top + 0.6 - base, 8.5, mat(bx, (top + 0.6 + base) / 2, bz, 0, a + Math.PI / 4), stone);
    g.box(9.0, 1.1, 9.0, mat(bx, base + 3.5, bz, 0, a + Math.PI / 4), dark);
    // corner guerite (sentry box)
    const gx = cx + Math.cos(a) * R * 1.95, gz = cz + Math.sin(a) * R * 1.95;
    g.cyl(0.9, 1.0, 2.2, 6, mat(gx, top + 1.6, gz), stone2);
    g.surf(DS.TILE); g.add(new THREE.ConeGeometry(1.2, 1.4, 6), mat(gx, top + 3.4, gz), C('#8c3f2e')); g.surf(DS.METAL);
    // cannons out of the bastion faces
    for (const s of [-1, 1]) {
      const ca = a + s * 0.55;
      const p0 = V(bx + Math.cos(ca) * 3.2, top + 0.9, bz + Math.sin(ca) * 3.2), p1 = V(bx + Math.cos(ca) * 5.2, top + 0.95, bz + Math.sin(ca) * 5.2);
      g.rod(p0, p1, 0.2, 0.15, 6, C('#1d1d20'));
    }
    g.surf(DS.MASON);
  }
  // parade ground and keep
  g.surf(DS.COBBLE); g.box(2 * R - 2.4, 0.4, 2 * R - 2.4, mat(cx, top - 1.4, cz), C('#c9b48e'));
  g.surf(DS.PLAIN); g.box(8, 6, 7, mat(cx - 2, top + 1.6, cz - 1), C('#d8c7a3')); g.surf(DS.MASON);
  g.box(8.6, 0.6, 7.6, mat(cx - 2, top + 4.9, cz - 1), stone2);
  for (let i = 0; i < 3; i++) gw.box(0.8, 1.0, 0.1, mat(cx - 4.5 + i * 2.5, top + 2.2, cz + 2.55), C('#ffffff'));
  // flagpole
  g.surf(DS.WOOD); g.rod(V(cx - 2, top + 5, cz - 1), V(cx - 2, top + 17, cz - 1), 0.12, 0.08, 5, C('#4a3a2a')); g.surf(DS.METAL);
  flags.push({ kind: 'stgeorge', pos: V(cx - 2, top + 16.0, cz - 1), w: 5.2, h: 3.3 });
  // brazier on the seaward bastion
  const ba = Math.PI / 4;
  const brz = V(cx + Math.cos(ba) * R * 1.42, top + 1.8, cz + Math.sin(ba) * R * 1.42);
  g.cyl(0.55, 0.35, 0.7, 6, mat(brz.x, brz.y, brz.z), C('#2a2522'));
  gw.ico(0.45, 0, mat(brz.x, brz.y + 0.5, brz.z), C('#ffffff'));
  lights.push({ pos: brz.clone().add(V(0, 1.2, 0)), color: C('#ff9a3c'), power: 1.3, kind: 'fire' });
}

function boatGeo(g, m, hullC, inC) {
  // a rowing boat: two half shells
  const sh = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const prevS = g.s; g.surf(DS.WOOD);
  g.add(sh, new THREE.Matrix4().multiplyMatrices(m, mat(0, 0.55, 0, 0, 0, 0, 2.3, 0.6, 0.85)), hullC);
  g.box(4.0, 0.06, 1.3, new THREE.Matrix4().multiplyMatrices(m, mat(0, 0.5, 0)), inC);
  for (const x of [-0.8, 0.4]) g.box(0.25, 0.08, 1.5, new THREE.Matrix4().multiplyMatrices(m, mat(x, 0.58, 0)), C('#6e5338'));
  g.s = prevS;
}
export { boatGeo };

function addDock(g, gw, lights) {
  const dx = -40;
  let zs = -125;
  while (zs < -40 && heightAt(dx, zs) > 0.15) zs += 0.5;
  const z0 = zs - 7, z1 = zs + 30, deckY = 1.45;
  const pl = [C('#8f6e4b'), C('#7e603f'), C('#9a7a54')];
  g.surf(DS.WOOD);
  for (let z = z0, i = 0; z < z1; z += 0.9, i++) g.box(4.4, 0.16, 0.84, mat(dx, deckY, z + 0.45), pl[i % 3], 0.02);
  for (let x = -7, i = 0; x < 7; x += 0.9, i++) g.box(0.84, 0.16, 4.6, mat(dx + x + 0.45, deckY, z1 + 2.3), pl[i % 3], 0.02);
  for (let z = z0 + 1; z < z1 + 4; z += 3.2) for (const s of [-2.1, 2.1]) g.cyl(0.2, 0.22, 7, 6, mat(dx + s, deckY - 3.2, z), WOOD);
  for (let x = -6.8; x <= 6.8; x += 3.4) for (const s of [0.2, 4.4]) g.cyl(0.2, 0.22, 7, 6, mat(dx + x, deckY - 3.2, z1 + s), WOOD);
  // cargo
  const crate = C('#a07a4c'), barrel = C('#7a5233');
  for (let i = 0; i < 5; i++) g.box(1.1, 1.1, 1.1, mat(dx - 5.5 + i * 0.4, deckY + 0.65 + (i > 2 ? 1.1 : 0), z1 + 1.4 + (i % 2) * 1.2, 0, i * 0.4), crate);
  for (let i = 0; i < 4; i++) g.cyl(0.4, 0.4, 1.0, 8, mat(dx + 4.2 + (i % 2) * 0.9, deckY + 0.58, z1 + 1.2 + Math.floor(i / 2) * 0.9), barrel);
  // lamp posts
  g.surf(DS.METAL);
  for (const lx of [-6.4, 6.4]) {
    const p = V(dx + lx, deckY, z1 + 4.1);
    g.rod(p, p.clone().add(V(0, 3.6, 0)), 0.09, 0.07, 5, C('#2b2622'));
    g.box(0.5, 0.12, 0.5, mat(p.x, p.y + 3.62, p.z), C('#2b2622'));
    gw.cyl(0.2, 0.2, 0.42, 6, mat(p.x, p.y + 3.85, p.z), C('#ffffff'));
    g.add(new THREE.ConeGeometry(0.32, 0.3, 6), mat(p.x, p.y + 4.2, p.z), C('#2b2622'));
    lights.push({ pos: p.clone().add(V(0, 3.9, 0)), color: C('#ffb257'), power: 0.9, kind: 'lamp' });
  }
  // moored boats
  g.surf(DS.WOOD);
  boatGeo(g, mat(dx - 4.4, 0.05, z1 - 6, 0, Math.PI / 2 + 0.1), C('#6e8ba0'), C('#a58a62'));
  boatGeo(g, mat(dx + 4.6, 0.05, z1 - 12, 0, Math.PI / 2 - 0.15), C('#a54b36'), C('#a58a62'));
  // warehouse at the root of the pier
  const wx = dx - 13, wz = zs - 12;
  addHouse(g, gw, wx, wz, 0.05, 13, 8, 6.2, C('#cdb48c'), C('#6f5a48'), mulberry32(9), 0.4);
  return { x: dx, zShore: zs, end: V(dx, deckY, z1 + 2.3) };
}

function addLighthouse(g, gw, x, z, lights) {
  const gy = heightAt(x, z);
  const red = C('#b3352a'), white = C('#efe8d8');
  g.surf(DS.PLAIN);
  for (let i = 0; i < 6; i++) g.cyl(2.3 - i * 0.14 - 0.14, 2.3 - i * 0.14, 2.4, 8, mat(x, gy - 1 + i * 2.4 + 1.2, z), i % 2 ? red : white, 0.03);
  const ty = gy - 1 + 14.4;
  g.surf(DS.METAL); g.cyl(2.2, 2.0, 0.4, 8, mat(x, ty + 0.2, z), C('#3b3430'));
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.box(0.08, 1.0, 0.08, mat(x + Math.cos(a) * 2.05, ty + 0.9, z + Math.sin(a) * 2.05), C('#2d2723')); }
  gw.cyl(1.15, 1.15, 1.8, 8, mat(x, ty + 1.3, z), C('#ffffff'));
  g.add(new THREE.ConeGeometry(1.6, 1.6, 8), mat(x, ty + 3.0, z), red);
  // keeper's cottage
  addHouse(g, gw, x + 7, z + 5, 0.6, 6, 5, 3.6, C('#efe6d4'), C('#9c4630'), mulberry32(31), 0.6);
  lights.push({ pos: V(x, ty + 1.4, z), color: C('#ffd27a'), power: 2.2, kind: 'beacon' });
}

function addRocks(g, seed) {
  const r = mulberry32(seed);
  const grey = [C('#8a8173'), C('#776e62'), C('#9b9282')];
  g.surf(DS.ROCK);
  let n = 0;
  for (let i = 0; i < 2000 && n < 70; i++) {
    const x = lerp(-255, 215, r()), z = lerp(-310, 210, r());
    const h = heightAt(x, z);
    if (h < -1.6 || h > 1.2) continue;
    const s = 0.6 + r() * 1.8;
    g.add(roughen(new THREE.DodecahedronGeometry(1, 0), 0.4, i), mat(x, h + s * 0.2, z, r(), r() * 6, r(), s * (1 + r() * 0.6), s * 0.8, s), grey[i % 3]);
    n++;
  }
  // sea stacks off the headland
  for (const [x, z, s] of [[92, -34, 4.2], [99, -26, 2.4], [86, -22, 1.7]]) {
    g.add(roughen(new THREE.DodecahedronGeometry(1, 1), 0.3, x), mat(x, heightAt(x, z) + s * 1.2, z, 0.2, x, 0, s, s * 2.2, s), grey[0]);
  }
}

export function makeWorld(U) {
  const group = new THREE.Group();
  const lights = [], flags = [];
  const terrain = makeTerrain(U);
  group.add(terrain);

  const g = new Geo(11, 0.05), gw = new Geo(12, 0.0);
  const r = mulberry32(5);
  const dock = addDock(g, gw, lights);
  const church = { x: -66, z: -133 };
  addChurch(g, gw, church.x, church.z, 0.08);
  const houses = [];
  for (let t = 0; t < 6000 && houses.length < 30; t++) {
    const x = lerp(-110, -2, r()), z = lerp(-150, -101, r());
    const h = heightAt(x, z);
    if (h < 1.7 || h > 16) continue;
    if (slopeAt(x, z).s > 0.42) continue;
    if (Math.abs(x - dock.x) < 9 && z > dock.zShore - 26) continue;
    if (Math.hypot(x - church.x, z - church.z) < 14) continue;
    if (Math.hypot(x - (dock.x - 13), z - (dock.zShore - 12)) < 12) continue;
    if (houses.some(o => Math.hypot(o.x - x, o.z - z) < 9.2)) continue;
    houses.push({ x, z });
    const w = 5 + r() * 3.2, d = 4.5 + r() * 2.2, hgt = r() < 0.35 ? 5.4 + r() * 1.2 : 3.4 + r() * 1.4;
    addHouse(g, gw, x, z, (r() - 0.5) * 0.5, w, d, hgt, WALLS[Math.floor(r() * WALLS.length)], ROOFS[Math.floor(r() * ROOFS.length)], r, 0.55);
  }
  // street lamps along the waterfront
  g.surf(DS.METAL);
  for (const lx of [-78, -58, -20]) {
    let lz = -125; while (lz < -60 && heightAt(lx, lz) > 1.6) lz += 0.5;
    const p = V(lx, heightAt(lx, lz - 3), lz - 3);
    g.rod(p, p.clone().add(V(0, 3.4, 0)), 0.1, 0.07, 5, C('#2b2622'));
    gw.cyl(0.2, 0.2, 0.4, 6, mat(p.x, p.y + 3.6, p.z), C('#ffffff'));
    lights.push({ pos: p.clone().add(V(0, 3.7, 0)), color: C('#ffad52'), power: 0.75, kind: 'lamp' });
  }
  // torches on the pier head and the quay
  g.surf(DS.METAL);
  const torches = [];
  for (const [tx, tz] of [[dock.x - 6.9, dock.end.z - 2.1], [dock.x + 6.9, dock.end.z - 2.1], [dock.x - 2.6, dock.zShore - 3], [dock.x + 2.6, dock.zShore - 3]]) {
    const ty = tz > dock.zShore - 6 ? 1.45 : heightAt(tx, tz);
    g.rod(V(tx, ty, tz), V(tx, ty + 2.3, tz), 0.06, 0.05, 5, C('#2b2622'));
    g.cyl(0.18, 0.1, 0.3, 6, mat(tx, ty + 2.4, tz), C('#2b2622'));
    torches.push(V(tx, ty + 2.75, tz));
  }
  addFort(g, gw, 26, -120, lights, flags);
  addLighthouse(g, gw, -188, 74, lights);
  addRocks(g, 17);

  const town = new THREE.Mesh(g.build(), U.enhance(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, side: THREE.DoubleSide }), 'town'));
  town.castShadow = true; town.receiveShadow = true;
  group.add(town);
  const glow = new THREE.Mesh(gw.build(), U.glowMat);
  group.add(glow);

  // vegetation
  const avoid = (x, z) => Math.hypot(x - 153, z - 55) < 7.5 || houses.some(o => Math.hypot(o.x - x, o.z - z) < 6.5) || Math.hypot(x - 26, z - 120 * -1) < 26 || Math.hypot(x - church.x, z - church.z) < 12 || (Math.abs(x - dock.x) < 18 && Math.abs(z - (dock.zShore - 8)) < 14);
  const palms = scatter(U, palmGeo(4), 300, (x, z, rr) => {
    const h = heightAt(x, z);
    if (h < 0.7 || h > 7) return null;
    const sl = slopeAt(x, z); if (sl.s > 0.6) return null;
    if (avoid(x, z)) return null;
    const lean = 0.12 + rr() * 0.3, dir = Math.atan2(-sl.gz, -sl.gx);
    const s = 0.75 + rr() * 0.45;
    const m = new THREE.Matrix4().compose(V(x, h - 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -dir, lean, 'YXZ')), V(s, s, s));
    return m;
  }, 41);
  const trees = scatter(U, treeGeo(6), 340, (x, z, rr) => {
    const h = heightAt(x, z);
    if (h < 3.5 || h > 40) return null;
    if (slopeAt(x, z).s > 0.75 || avoid(x, z)) return null;
    const s = 0.8 + rr() * 0.7;
    return mat(x, h - 0.3, z, 0, rr() * 6, 0, s, s * (0.85 + rr() * 0.3), s);
  }, 42);
  const bushes = scatter(U, bushGeo(8), 300, (x, z, rr) => {
    const h = heightAt(x, z);
    if (h < 1.3 || h > 28 || avoid(x, z)) return null;
    const s = 0.6 + rr() * 0.8;
    return mat(x, h - 0.1, z, 0, rr() * 6, 0, s);
  }, 43);
  group.add(palms, trees, bushes);
  return { group, lights, flags, dock, torches };
}
