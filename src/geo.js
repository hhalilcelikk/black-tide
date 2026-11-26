// Low-poly geometry builder: everything is flat triangles with per-face colour,
// so facets read clearly and a few thousand of them can share one draw call.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { SCALE } from './detail.js';

export const C = (hex) => new THREE.Color(hex);
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Matrix that maps a unit Y-axis primitive (centred at origin, height 1) onto segment a->b.
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
export function between(a, b, sx = 1, sz = sx) {
  _d.subVectors(b, a);
  const len = _d.length();
  _q.setFromUnitVectors(_up, _d.clone().normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), _q, _s.set(sx, len, sz));
  return m;
}

export class Geo {
  constructor(seed = 1, jitter = 0.05) { this.p = []; this.c = []; this.sv = []; this.s = [0, 0.3]; this.f = null; this.rnd = mulberry32(seed); this.jitter = jitter; }
  surf(layer, scale) { this.s = [layer, scale ?? SCALE[layer]]; return this; }
  tri(a, b, c, color, jitter = this.jitter) {
    const k = 1 + (this.rnd() - 0.5) * jitter * 2;
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) { this.c.push(color.r * k, color.g * k, color.b * k); this.sv.push(this.s[0], this.s[1]); }
  }
  quad(a, b, c, d, color, jitter) { this.tri(a, b, c, color, jitter); this.tri(a, c, d, color, jitter); }
  // Add any three.js geometry, transformed by m. color may be a Color or fn(verts, faceIndex) -> Color.
  add(geo, m, color, jitter = this.jitter) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pa = g.attributes.position;
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < pa.count; i += 3) {
      for (let j = 0; j < 3; j++) { v[j].fromBufferAttribute(pa, i + j); if (m) v[j].applyMatrix4(m); }
      const col = typeof color === 'function' ? color(v, i / 3) : color;
      this.tri(v[0], v[1], v[2], col, jitter);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  box(w, h, d, m, color, jitter) { this.add(new THREE.BoxGeometry(w, h, d), m, color, jitter); }
  cyl(rt, rb, h, seg, m, color, jitter, open = false) { this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m, color, jitter); }
  // Cylinder spanning two points.
  rod(a, b, r0, r1, seg, color, jitter) { this.add(new THREE.CylinderGeometry(r1, r0, 1, seg, 1, false), between(a, b), color, jitter); }
  ico(r, detail, m, color, jitter) { this.add(new THREE.IcosahedronGeometry(r, detail), m, color, jitter); }
  get count() { return this.p.length / 9; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.sv, 2));
    if (this.f) g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.f, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Jitter vertices of an indexed geometry for an organic, hand-cut look (rocks, canopies).
export function roughen(geo, amount, seed = 1) {
  const r = mulberry32(seed);
  const pa = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pa.count; i++) {
    const key = `${pa.getX(i).toFixed(3)},${pa.getY(i).toFixed(3)},${pa.getZ(i).toFixed(3)}`;
    let o = map.get(key);
    if (!o) { o = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]; map.set(key, o); }
    pa.setXYZ(i, pa.getX(i) + o[0], pa.getY(i) + o[1], pa.getZ(i) + o[2]);
  }
  return geo;
}
