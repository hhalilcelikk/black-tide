// Little scenes of life: crew figures, a treasure-dig camp on Cayo Palma, people on the quay.
import * as THREE from 'three';
import { Geo, C, V, mat, roughen } from './geo.js';
import { S as DS } from './detail.js';
import { mulberry32 } from './util.js';
import { heightAt, boatGeo } from './world.js';

const SKINS = ['#e0b48c', '#b07a50', '#7a5236'].map(C);
const SHIRTS = ['#e9e1cf', '#a93a2c', '#2f4d74', '#d8c79f', '#5b6b3a'].map(C);
const PANTS = ['#3a3228', '#2b3442', '#5b4a36'].map(C);

// A crew figure, ~1.8 m. pose: stand | dig | sit | point | carry
export function figure(g, x, y, z, rot, r, pose = 'stand', captain = false) {
  const prev = g.s; g.surf(DS.PLAIN);
  const m = mat(x, y, z, 0, rot);
  const P = (px, py, pz) => V(px, py, pz).applyMatrix4(m).toArray();
  const sk = SKINS[Math.floor(r() * 3)], sh = captain ? C('#7d1f1a') : SHIRTS[Math.floor(r() * 5)], pa = PANTS[Math.floor(r() * 3)];
  const lean = pose === 'dig' ? 0.55 : 0;
  const sit = pose === 'sit' ? 0.45 : 0;
  if (pose === 'sit') {
    g.box(0.5, 0.16, 0.16, mat(...P(0.25, 0.42, -0.1), 0, rot), pa); g.box(0.5, 0.16, 0.16, mat(...P(0.25, 0.42, 0.1), 0, rot), pa);
    g.box(0.16, 0.42, 0.16, mat(...P(0.5, 0.21, -0.1), 0, rot), pa); g.box(0.16, 0.42, 0.16, mat(...P(0.5, 0.21, 0.1), 0, rot), pa);
  } else {
    g.box(0.15, 0.8, 0.16, mat(...P(0, 0.4, -0.11), 0, rot), pa); g.box(0.15, 0.8, 0.16, mat(...P(0, 0.4, 0.11), 0, rot), pa);
  }
  const hy = 0.8 - sit * 0.4;
  g.cyl(0.2, 0.23, 0.64, 6, mat(...P(Math.sin(lean) * 0.3, hy + 0.3, 0), 0, rot, -lean), sh);
  const sx = Math.sin(lean) * 0.6, sy = hy + 0.58 - (1 - Math.cos(lean)) * 0.3;
  if (pose === 'dig') {
    g.box(0.11, 0.6, 0.11, mat(...P(sx + 0.25, sy - 0.25, -0.18), 0, rot, -1.1), sh);
    g.box(0.11, 0.6, 0.11, mat(...P(sx + 0.25, sy - 0.25, 0.18), 0, rot, -1.1), sh);
    g.rod(V(...P(sx + 0.55, sy - 0.4, 0)), V(...P(sx + 0.9, sy - 1.6, 0)), 0.035, 0.035, 4, C('#5a3c24'));
    g.box(0.06, 0.34, 0.26, mat(...P(sx + 0.95, sy - 1.75, 0), 0, rot, 0.3), C('#5f646b'));
  } else if (pose === 'point') {
    g.box(0.11, 0.62, 0.11, mat(...P(0.3, hy + 0.55, -0.32), 0, rot, -1.35), sh);
    g.box(0.11, 0.6, 0.11, mat(...P(0.05, hy + 0.3, 0.31), -0.2, rot, 0.15), sh);
  } else if (pose === 'carry') {
    g.box(0.11, 0.55, 0.11, mat(...P(0.18, hy + 0.5, -0.28), 0, rot, -0.9), sh);
    g.box(0.11, 0.55, 0.11, mat(...P(0.18, hy + 0.5, 0.28), 0, rot, -0.9), sh);
  } else {
    g.box(0.11, 0.62, 0.11, mat(...P(0.05, hy + 0.3, -0.31), 0.2, rot, 0.15), sh);
    g.box(0.11, 0.62, 0.11, mat(...P(0.05, hy + 0.3, 0.31), -0.2, rot, 0.15), sh);
  }
  const head = P(sx, sy + 0.3, 0);
  g.ico(0.145, 0, mat(...head), sk);
  if (captain) { g.cyl(0.33, 0.33, 0.05, 6, mat(head[0], head[1] + 0.12, head[2]), C('#1b1716')); g.cyl(0.14, 0.17, 0.22, 6, mat(head[0], head[1] + 0.23, head[2]), C('#1b1716')); }
  else if (r() < 0.7) g.ico(0.155, 0, mat(head[0], head[1] + 0.07, head[2], 0, 0, 0, 1, 0.55, 1), [C('#a4231c'), C('#2a3c63'), C('#c9b98f')][Math.floor(r() * 3)]);
  g.s = prev;
  return V(...head);
}

// Treasure dig on the beach: campfire, an open chest of gold, a pit, a lantern, crew and a beached boat.
export function makeCamp(U, fx, cx, cz) {
  const r = mulberry32(61);
  const g = new Geo(62, 0.06), gw = new Geo(63, 0), gold = new Geo(64, 0.15);
  const group = new THREE.Group();
  const y = (x, z) => heightAt(x, z);
  // fire pit
  g.surf(DS.ROCK);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; g.add(roughen(new THREE.DodecahedronGeometry(0.22, 0), 0.08, i), mat(cx + Math.cos(a) * 0.85, y(cx, cz) + 0.1, cz + Math.sin(a) * 0.85, i, i, 0), C('#77706a')); }
  g.surf(DS.WOOD);
  for (let i = 0; i < 3; i++) g.cyl(0.09, 0.09, 1.3, 6, mat(cx, y(cx, cz) + 0.15, cz, 0, i * 1.05, Math.PI / 2 - 0.25), C('#4a3020'));
  const fire = fx.addFire(group, V(cx, y(cx, cz) + 0.05, cz), 0.5, 41);
  // pit and spoil heap
  const px = cx + 4.2, pz = cz - 2.4, py = y(px, pz);
  g.surf(DS.SAND);
  g.cyl(1.25, 1.0, 0.16, 9, mat(px, py + 0.02, pz), C('#4a3a26'));
  g.add(roughen(new THREE.IcosahedronGeometry(1, 0), 0.25, 5), mat(px + 2.0, py + 0.2, pz + 0.6, 0, 0.4, 0, 1.3, 0.55, 1.0), C('#d9c48f'));
  // open chest with gold
  const chx = px - 0.3, chz = pz + 1.9, chy = y(chx, chz);
  g.surf(DS.WOOD);
  g.box(1.1, 0.6, 0.72, mat(chx, chy + 0.3, chz, 0, 0.5), C('#6b4526'));
  g.box(1.12, 0.66, 0.08, mat(...V(0, 0.62, -0.42).applyAxisAngle(V(0, 1, 0), 0.5).add(V(chx, chy, chz)).toArray(), -0.9, 0.5, 0), C('#6b4526'));
  g.surf(DS.METAL);
  for (const o of [-0.4, 0.4]) g.box(0.1, 0.64, 0.76, mat(...V(o, 0.31, 0).applyAxisAngle(V(0, 1, 0), 0.5).add(V(chx, chy, chz)).toArray(), 0, 0.5), C('#2a2522'));
  gold.add(roughen(new THREE.IcosahedronGeometry(0.4, 1), 0.12, 9), mat(chx, chy + 0.62, chz, 0, 0.5, 0, 1.25, 0.35, 0.85), C('#ffffff'));
  for (let i = 0; i < 14; i++) gold.cyl(0.07, 0.07, 0.025, 6, mat(chx + (r() - 0.5) * 2.6, y(chx, chz) + 0.04, chz + (r() - 0.2) * 1.8, (r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6), C('#ffffff'));
  // lantern pole by the pit
  const lpx = px - 1.6, lpz = pz - 1.2, lpy = y(lpx, lpz);
  g.surf(DS.WOOD); g.rod(V(lpx, lpy - 0.3, lpz), V(lpx, lpy + 2.4, lpz), 0.05, 0.04, 5, C('#4a3020'));
  g.rod(V(lpx, lpy + 2.35, lpz), V(lpx + 0.5, lpy + 2.45, lpz), 0.035, 0.035, 4, C('#4a3020'));
  g.surf(DS.METAL); g.cyl(0.14, 0.12, 0.34, 6, mat(lpx + 0.5, lpy + 2.2, lpz), C('#2a2522'));
  gw.cyl(0.11, 0.11, 0.24, 6, mat(lpx + 0.5, lpy + 2.18, lpz), C('#ffffff'));
  // crew
  figure(g, px + 0.1, py - 0.35, pz - 0.1, 0.8, r, 'dig');
  figure(g, px + 1.6, py, pz - 1.4, 2.2, r, 'carry');
  figure(g, cx - 1.3, y(cx - 1.3, cz + 0.4), cz + 0.4, 0.2, r, 'sit');
  figure(g, cx + 1.0, y(cx + 1.0, cz + 1.4), cz + 1.4, -2.4, r, 'sit');
  figure(g, chx - 1.6, y(chx - 1.6, chz + 0.8), chz + 0.8, -0.3, r, 'point', true);
  // beached rowing boat and oars
  let bz = cz; while (y(cx - 3, bz) > 0.15 && bz < cz + 40) bz += 0.4;
  boatGeo(g, mat(cx - 3, y(cx - 3, bz - 1.6) - 0.2, bz - 1.6, 0.06, 1.25, 0.08), C('#6e8ba0'), C('#a58a62'));
  g.surf(DS.WOOD);
  for (const o of [-0.5, 0.5]) g.rod(V(cx - 4.2 + o, y(cx - 4.2, bz - 4) + 0.08, bz - 4), V(cx - 1.4 + o, y(cx - 1.4, bz - 3) + 0.1, bz - 3.2), 0.04, 0.04, 4, C('#8a6a44'));
  const mesh = new THREE.Mesh(g.build(), U.shipMat); mesh.castShadow = true; mesh.receiveShadow = true;
  const gm = new THREE.Mesh(gold.build(), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.75, 0.45) }));
  group.add(mesh, gm, new THREE.Mesh(gw.build(), U.glowMat));
  const lights = [
    { pos: V(lpx + 0.5, lpy + 2.15, lpz), color: C('#ffb257'), power: 0.8, kind: 'lamp' },
    { pos: V(chx, chy + 1.1, chz), color: C('#ffcf6a'), power: 0.45, kind: 'lamp' },
  ];
  return { group, fire, lights };
}

// People on the quay and the pier head
export function makeQuayLife(U, dock) {
  const r = mulberry32(71);
  const g = new Geo(72, 0.05);
  const e = dock.end;
  figure(g, e.x - 4, 1.53, e.z + 0.6, 1.2, r, 'stand');
  figure(g, e.x - 2.8, 1.53, e.z - 0.4, -2.2, r, 'point', true);
  figure(g, e.x + 3.5, 1.53, e.z + 1.0, 2.6, r, 'carry');
  figure(g, e.x + 0.8, 1.53, e.z - 9, 0.1, r, 'stand');
  figure(g, e.x - 1.2, 1.53, e.z - 16, 3.0, r, 'carry');
  figure(g, e.x + 4.5, heightAt(e.x + 4.5, dock.zShore - 5), dock.zShore - 5, -0.6, r, 'stand');
  figure(g, e.x + 5.3, heightAt(e.x + 5.3, dock.zShore - 5.6), dock.zShore - 5.6, 2.4, r, 'stand');
  const m = new THREE.Mesh(g.build(), U.shipMat); m.castShadow = true;
  return m;
}
