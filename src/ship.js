// Procedural sailing ships. One builder makes a lofted hull with strakes and wales,
// decks, gunports and cannons, masts and yards, billowed faceted sails, rigging and ratlines,
// a lit stern gallery, lanterns, crew and cargo. Local frame: +X bow, +Y up, +Z starboard.
import * as THREE from 'three';
import { Geo, C, V, mat } from './geo.js';
import { mulberry32, lerp, smoothstep, vnoise } from './util.js';
import { makeFlag, flagTexture } from './flags.js';
import { S as DS } from './detail.js';
import { boatGeo } from './world.js';

export const TYPES = {
  brigantine: {
    L: 26, B: 7.4, T: 2.4, dMain: 1.55, qd: { u: 0.25, h: 1.45 }, fc: { u: 0.87, h: 0.9 }, guns: 6, gunU: [0.31, 0.82],
    masts: [
      { u: 0.71, rig: 'square', lower: 11.5, top: 7.6, tg: 4.6 },
      { u: 0.43, rig: 'brig', lower: 12.5, top: 8.2, tg: 4.8 },
    ],
    sprit: { len: 9.2, ang: 0.34, jib: 4.6 }, lanterns: 3, crew: 13, boat: true,
  },
  galleon: {
    L: 31, B: 8.8, T: 2.9, dMain: 1.75, qd: { u: 0.31, h: 1.9 }, poop: { u: 0.15, h: 1.55 }, fc: { u: 0.84, h: 1.7 }, guns: 7, gunU: [0.33, 0.8],
    masts: [
      { u: 0.74, rig: 'square', lower: 11.5, top: 7.2, tg: 4.2 },
      { u: 0.47, rig: 'square', lower: 13.2, top: 8.2, tg: 4.6 },
      { u: 0.17, rig: 'lateen', lower: 9.0, top: 0, tg: 0 },
    ],
    sprit: { len: 12, ang: 0.45, jib: 0 }, lanterns: 3, crew: 12, boat: true,
  },
  sloop: {
    L: 17, B: 5.6, T: 1.9, dMain: 1.2, qd: null, fc: null, guns: 3, gunU: [0.36, 0.74],
    masts: [{ u: 0.6, rig: 'sloop', lower: 14.5, top: 4.5, tg: 0 }],
    sprit: { len: 8.5, ang: 0.22, jib: 0 }, lanterns: 1, crew: 6, boat: false,
  },
  schooner: {
    L: 21, B: 5.9, T: 2.0, dMain: 1.3, qd: { u: 0.17, h: 0.75 }, fc: null, guns: 4, gunU: [0.3, 0.8],
    masts: [
      { u: 0.66, rig: 'gaff', lower: 13.2, top: 4.2, tg: 0, boom: 0.25 },
      { u: 0.38, rig: 'gaff', lower: 14.6, top: 4.8, tg: 0, boom: 0.42 },
    ],
    sprit: { len: 8.8, ang: 0.2, jib: 3.6 }, lanterns: 1, crew: 8, boat: false,
  },
  fluyt: {
    L: 28, B: 7.8, T: 2.6, dMain: 1.6, qd: { u: 0.24, h: 1.7 }, fc: { u: 0.88, h: 0.8 }, guns: 4, gunU: [0.34, 0.74], tumble: 0.3,
    masts: [
      { u: 0.74, rig: 'square', lower: 10.5, top: 6.8, tg: 0 },
      { u: 0.48, rig: 'square', lower: 12, top: 7.6, tg: 4.0 },
      { u: 0.16, rig: 'lateen', lower: 8.2, top: 0, tg: 0 },
    ],
    sprit: { len: 9.5, ang: 0.42, jib: 0 }, lanterns: 1, crew: 9, boat: true,
  },
  frigate: {
    L: 34, B: 8.6, T: 2.8, dMain: 1.7, qd: { u: 0.3, h: 1.3 }, fc: { u: 0.86, h: 1.0 }, guns: 9, gunU: [0.31, 0.85],
    masts: [
      { u: 0.75, rig: 'square', lower: 13, top: 8.6, tg: 5.0 },
      { u: 0.49, rig: 'square', lower: 14.6, top: 9.4, tg: 5.4 },
      { u: 0.19, rig: 'square', lower: 10.6, top: 6.4, tg: 0 },
    ],
    sprit: { len: 12, ang: 0.34, jib: 5 }, lanterns: 3, crew: 17, boat: true,
  },
  manowar: {
    L: 40, B: 10.6, T: 3.4, dMain: 2.9, qd: { u: 0.32, h: 1.8 }, poop: { u: 0.14, h: 1.5 }, fc: { u: 0.85, h: 1.5 }, guns: 11, gunU: [0.34, 0.84], gunRows: [0.905, 0.7],
    masts: [
      { u: 0.76, rig: 'square', lower: 15, top: 9.6, tg: 5.6 },
      { u: 0.5, rig: 'square', lower: 17, top: 10.6, tg: 6.2 },
      { u: 0.2, rig: 'lateen', lower: 11, top: 0, tg: 0 },
    ],
    sprit: { len: 14, ang: 0.42, jib: 0 }, lanterns: 3, crew: 22, boat: true,
  },
};

// Game-facing numbers for each class (speeds in knots at the best point of sail).
export const CLASSES = {
  sloop: { name: 'Sloop', role: 'Quick raider. Where every career starts.', guns: 6, crew: 40, hold: 40, hull: 60, sails: 60, knots: 9.5, turn: 1.0, point: 40, best: 95, price: 1200 },
  schooner: { name: 'Schooner', role: 'Fastest to windward. A smuggler\'s favourite.', guns: 8, crew: 50, hold: 60, hull: 75, sails: 70, knots: 10, turn: 0.9, point: 38, best: 100, price: 2400 },
  brigantine: { name: 'Brigantine', role: 'The pirate all-rounder. Fights and runs.', guns: 12, crew: 80, hold: 90, hull: 110, sails: 100, knots: 8.5, turn: 0.75, point: 48, best: 110, price: 4800 },
  fluyt: { name: 'Fluyt', role: 'Dutch cargo hauler. Huge hold, few guns.', guns: 8, crew: 30, hold: 220, hull: 120, sails: 100, knots: 7.5, turn: 0.55, point: 60, best: 135, price: 3600 },
  frigate: { name: 'Frigate', role: 'Navy hunter. Fast for her size, many guns.', guns: 18, crew: 160, hold: 120, hull: 180, sails: 150, knots: 9, turn: 0.6, point: 55, best: 125, price: 9000 },
  galleon: { name: 'Galleon', role: 'Treasure ship. Slow, tall, rich.', guns: 14, crew: 180, hold: 260, hull: 220, sails: 160, knots: 7.5, turn: 0.45, point: 62, best: 140, price: 8000 },
  manowar: { name: 'Man-o\'-War', role: 'Two gun decks. Flagship of a navy.', guns: 44, crew: 350, hold: 180, hull: 320, sails: 220, knots: 7.5, turn: 0.4, point: 60, best: 135, price: 0 },
};

export const LIVERIES = {
  pirate: { bottom: '#bcae8f', boot: '#231e1b', side: '#1f1c1b', wale: '#0f0d0c', top: '#6e1e17', trim: '#c9a24f', inner: '#7c2c21', cap: '#2a1f18', deck: '#9b7b53', deck2: '#8c6c48', mast: '#6b5034', sail: '#efe3c6', sail2: '#e2d2ae', patch: '#c7ae80', flag: 'jolly' },
  // the Black Wake: Corvin Vane's frigate, black from waterline to rail under blood-red sails
  boss: { bottom: '#bcae8f', boot: '#231e1b', side: '#121011', wale: '#060505', top: '#1c0d0c', trim: '#8a2a20', inner: '#7c2c21', cap: '#2a1f18', deck: '#9b7b53', deck2: '#8c6c48', mast: '#6b5034', sail: '#8e1f1a', sail2: '#741814', patch: '#5a1310', flag: 'jolly' },
  spanish: { bottom: '#cdbf9f', boot: '#2d241e', side: '#8b5b33', wale: '#2a1d14', top: '#c69a38', trim: '#7e2018', inner: '#8d3023', cap: '#3a281b', deck: '#a4845a', deck2: '#967650', mast: '#73573a', sail: '#f3ebd6', sail2: '#e8dcc0', patch: null, flag: 'burgundy' },
  english: { bottom: '#c9bc9b', boot: '#2b231e', side: '#5c3e27', wale: '#1c1410', top: '#2e4b6f', trim: '#d3ad56', inner: '#8d3023', cap: '#2d2219', deck: '#a4845a', deck2: '#967650', mast: '#6f5437', sail: '#f2ead5', sail2: '#e6dabe', patch: null, flag: 'stgeorge' },
  french: { bottom: '#c8bb9a', boot: '#2a231d', side: '#2d3954', wale: '#14161f', top: '#33416a', trim: '#d6b057', inner: '#8d3023', cap: '#2a2019', deck: '#a4845a', deck2: '#967650', mast: '#6f5437', sail: '#f4eee2', sail2: '#e8dfca', patch: null, flag: 'fleur' },
  dutch: { bottom: '#c6b996', boot: '#2b241d', side: '#6e4b2b', wale: '#211710', top: '#3f6040', trim: '#d9b35a', inner: '#8a2e22', cap: '#2c2118', deck: '#a4845a', deck2: '#967650', mast: '#6f5437', sail: '#efe6cf', sail2: '#e2d6b8', patch: null, flag: 'prinsen' },
};
export const NATIONS = {
  pirate: { name: 'Pirate', adj: 'pirate' }, english: { name: 'England', adj: 'English' }, spanish: { name: 'Spain', adj: 'Spanish' },
  french: { name: 'France', adj: 'French' }, dutch: { name: 'The Dutch', adj: 'Dutch' },
};

const YV = [0, 0.135, 0.269, 0.404, 0.529, 0.644, 0.702, 0.798, 0.856, 0.971, 1.0];
const ZMID = [0, 0.55, 0.80, 0.93, 0.99, 1.0, 1.0, 0.99, 0.97, 0.935, 0.93];
const ZSTERN = [0, 0.18, 0.34, 0.52, 0.70, 0.82, 0.87, 0.92, 0.95, 0.95, 0.94];
const ROWS = ['bottom', 'bottom', 'bottom', 'boot', 'side', 'wale', 'side', 'wale', 'top', 'trim'];

function hullFns(S) {
  const B = S.B, T = S.T, dm = S.dMain;
  const halfB = u => {
    const b = B / 2;
    if (u < 0.42) return b * (0.7 + 0.3 * Math.sin((u / 0.42) * Math.PI / 2));
    const t = (u - 0.42) / 0.58;
    return b * Math.pow(Math.max(0, 1 - t * t), 0.62);
  };
  const deckY = u => {
    if (S.qd && u < S.qd.u) return dm + S.qd.h + (S.poop && u < S.poop.u ? S.poop.h : 0);
    if (S.fc && u > S.fc.u) return dm + S.fc.h;
    return dm;
  };
  const railY = u => {
    let r = dm + 1.0;
    if (S.qd) r += S.qd.h * (1 - smoothstep(S.qd.u, S.qd.u + 0.07, u));
    if (S.poop) r += S.poop.h * (1 - smoothstep(S.poop.u, S.poop.u + 0.05, u));
    if (S.fc) r += S.fc.h * smoothstep(S.fc.u - 0.07, S.fc.u, u);
    r += 0.4 * Math.pow(Math.abs(u - 0.5) * 2, 2.6);
    return r;
  };
  const keelY = u => {
    if (u > 0.8) return lerp(-T, -0.7, Math.pow(smoothstep(0.8, 1.0, u), 1.3));
    if (u < 0.06) return lerp(-T * 0.82, -T, u / 0.06);
    return -T;
  };
  return { halfB, deckY, railY, keelY };
}

export function buildShip(typeKey, liveryKey, U, seed = 1) {
  const S = TYPES[typeKey], LV = LIVERIES[liveryKey];
  const col = {};
  for (const k in LV) if (typeof LV[k] === 'string' && LV[k][0] === '#') col[k] = C(LV[k]);
  const r = mulberry32(seed);
  const L = S.L, dm = S.dMain;
  const F = hullFns(S);
  const g = new Geo(seed, 0.035);
  g.surf(DS.WOOD);
  const gw = new Geo(seed + 2, 0);
  const sail = { p: [], c: [], f: [], s: [] };
  const lines = [];
  const furls = [];
  const line = (a, b) => lines.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const iron = C('#1c1c1f'), gold = col.trim, mastC = col.mast, dark = C('#2a1f17');

  const sectionAt = u => {
    const x = -L / 2 + u * L;
    const k = F.keelY(u), rr = F.railY(u), b = F.halfB(u);
    const wb = smoothstep(0.62, 1.0, u), ws = smoothstep(0.2, 0.0, u);
    const tb = S.tumble || 0;
    const pts = YV.map((yv, j) => ({ y: k + (rr - k) * yv, z: b * lerp(lerp(ZMID[j], ZSTERN[j], ws), Math.pow(yv, 0.85), wb) * (1 - tb * Math.pow(Math.max(0, yv - 0.55) / 0.45, 1.6)) }));
    return { u, x, k, r: rr, b, pts };
  };
  const zAt = (sc, y) => {
    const p = sc.pts;
    if (y <= p[0].y) return p[0].z;
    for (let j = 0; j < p.length - 1; j++) if (y <= p[j + 1].y) return lerp(p[j].z, p[j + 1].z, (y - p[j].y) / Math.max(1e-4, p[j + 1].y - p[j].y));
    return p[p.length - 1].z;
  };

  // ---- hull skin ----
  const N = 22;
  const sec = [];
  for (let i = 0; i <= N; i++) sec.push(sectionAt(i / N));
  for (let i = 0; i < N; i++) for (let j = 0; j < 10; j++) {
    const s0 = sec[i], s1 = sec[i + 1], c = col[ROWS[j]];
    for (const sd of [1, -1]) {
      g.quad(V(s0.x, s0.pts[j].y, sd * s0.pts[j].z), V(s1.x, s1.pts[j].y, sd * s1.pts[j].z), V(s1.x, s1.pts[j + 1].y, sd * s1.pts[j + 1].z), V(s0.x, s0.pts[j + 1].y, sd * s0.pts[j + 1].z), c);
    }
  }
  // transom
  const s0 = sec[0];
  const ctr = V(s0.x - 0.05, (s0.k + s0.r) / 2, 0);
  for (let j = 0; j < 10; j++) for (const sd of [1, -1]) {
    const yc = (s0.pts[j].y + s0.pts[j + 1].y) / 2;
    g.tri(ctr, V(s0.x, s0.pts[j].y, sd * s0.pts[j].z), V(s0.x, s0.pts[j + 1].y, sd * s0.pts[j + 1].z), yc < -0.3 ? col.bottom : yc < 0.3 ? col.boot : col.top);
  }
  // stem post and keel
  for (let i = 15; i < N; i++) g.quad(V(sec[i].x, sec[i].k - 0.15, 0.08), V(sec[i + 1].x, sec[i + 1].k - 0.15, 0.08), V(sec[i + 1].x, sec[i + 1].r + 0.25, 0.08), V(sec[i].x, sec[i].r + 0.25, 0.08), col.wale, 0);
  g.box(L * 0.82, 0.3, 0.26, mat(-L * 0.04, -S.T - 0.1, 0), col.wale);

  // ---- decks, bulwarks, cap rails ----
  const segs = [];
  if (S.qd) segs.push([0.0, S.qd.u, F.deckY(0.0)]);
  segs.push([S.qd ? S.qd.u : 0.0, S.fc ? S.fc.u : 0.965, dm]);
  if (S.fc) segs.push([S.fc.u, 0.965, F.deckY(0.99)]);
  const deckW = (u, y) => Math.max(0.05, zAt(sectionAt(u), y) - 0.22);
  for (const [ua, ub, dy] of segs) {
    const steps = Math.max(2, Math.round((ub - ua) * 34));
    let prev = null;
    for (let s = 0; s <= steps; s++) {
      const u = lerp(ua, ub, s / steps), sc = sectionAt(u);
      const cur = { x: sc.x, w: deckW(u, dy), r: sc.r, rz: zAt(sc, sc.r) };
      if (prev) {
        for (let p = 0; p < 6; p++) {
          const t0 = -1 + p / 3, t1 = -1 + (p + 1) / 3;
          g.quad(V(prev.x, dy, prev.w * t0), V(cur.x, dy, cur.w * t0), V(cur.x, dy, cur.w * t1), V(prev.x, dy, prev.w * t1), p % 2 ? col.deck : col.deck2, 0.02);
        }
        for (const sd of [1, -1]) {
          g.quad(V(prev.x, dy, sd * prev.w), V(cur.x, dy, sd * cur.w), V(cur.x, cur.r, sd * (cur.rz - 0.17)), V(prev.x, prev.r, sd * (prev.rz - 0.17)), col.inner);
          g.quad(V(prev.x, prev.r + 0.04, sd * (prev.rz - 0.22)), V(cur.x, cur.r + 0.04, sd * (cur.rz - 0.22)), V(cur.x, cur.r + 0.04, sd * (cur.rz + 0.07)), V(prev.x, prev.r + 0.04, sd * (prev.rz + 0.07)), col.cap, 0.02);
        }
      }
      prev = cur;
    }
  }
  // bulkheads at deck steps, with doors, windows and rails
  const bulkhead = (u, yLow, yHigh, faceSign) => {
    const sc = sectionAt(u), w = deckW(u, yLow);
    g.quad(V(sc.x, yLow, -w), V(sc.x, yLow, w), V(sc.x, yHigh, w), V(sc.x, yHigh, -w), col.top);
    g.box(0.06, 0.12, w * 2, mat(sc.x + faceSign * 0.03, yHigh - 0.06, 0), gold);
    g.box(0.08, Math.min(1.7, yHigh - yLow - 0.1), 0.9, mat(sc.x + faceSign * 0.04, yLow + Math.min(1.7, yHigh - yLow - 0.1) / 2, 0), dark);
    for (const z of [-w * 0.55, w * 0.55]) gw.box(0.08, 0.5, 0.6, mat(sc.x + faceSign * 0.05, yLow + (yHigh - yLow) * 0.6, z), C('#ffffff'));
    // balustrade on the upper deck edge
    const top = yHigh, xr = sc.x - faceSign * 0.15;
    g.box(0.1, 0.08, w * 2, mat(xr, top + 0.95, 0), col.cap);
    for (let i = 0; i <= 10; i++) g.box(0.08, 0.9, 0.08, mat(xr, top + 0.47, -w + i * w / 5), col.cap);
    // ladders
    for (const z of [-w + 0.7, w - 0.7]) g.box(1.9, 0.08, 0.7, mat(sc.x + faceSign * 0.85, (yLow + yHigh) / 2, z, 0, 0, faceSign * 0.62), col.deck2);
  };
  if (S.qd) bulkhead(S.qd.u, dm, F.deckY(0), 1);
  if (S.poop) { const sc = sectionAt(S.poop.u); const w = deckW(S.poop.u, dm + S.qd.h); g.quad(V(sc.x, dm + S.qd.h, -w), V(sc.x, dm + S.qd.h, w), V(sc.x, F.deckY(0), w), V(sc.x, F.deckY(0), -w), col.top); }
  if (S.fc) bulkhead(S.fc.u, dm, dm + S.fc.h, -1);

  // ---- gunports and cannons ----
  const guns = { port: [], star: [] };
  const rows = S.gunRows || [0.912];
  for (let ri = 0; ri < rows.length; ri++) for (let k = 0; k < S.guns; k++) {
    const u = lerp(S.gunU[0], S.gunU[1], (k + 0.5 + (ri % 2) * 0.25) / S.guns);
    const sc = sectionAt(u);
    const y = sc.k + (sc.r - sc.k) * rows[ri];
    const zH = zAt(sc, y);
    const lower = ri > 0;
    for (const sd of [1, -1]) {
      g.surf(DS.PLAIN); g.box(0.74, 0.6, 0.06, mat(sc.x, y, sd * (zH + 0.035)), C('#3b120e'), 0); g.surf(DS.WOOD);
      g.box(0.78, 0.64, 0.06, mat(sc.x, y + 0.3 + 0.11, sd * (zH + 0.3), -sd * 1.2, 0, 0), col.top);
      g.surf(DS.METAL); g.rod(V(sc.x, y - 0.04, sd * (zH - 1.25)), V(sc.x, y, sd * (zH + 0.62)), 0.17, 0.125, 7, iron);
      g.cyl(0.16, 0.16, 0.12, 7, mat(sc.x, y, sd * (zH + 0.58), Math.PI / 2, 0, 0), iron); g.surf(DS.WOOD);
      const dy = F.deckY(u);
      if (!lower) {
        g.box(0.85, 0.42, 1.0, mat(sc.x, dy + 0.21, sd * (zH - 1.05)), C('#5b3a26'));
        for (const wz of [-0.35, 0.35]) g.cyl(0.18, 0.18, 0.1, 6, mat(sc.x + 0.45, dy + 0.18, sd * (zH - 1.05) + wz, 0, 0, Math.PI / 2), dark);
      }
      guns[sd > 0 ? 'star' : 'port'].push(V(sc.x, y, sd * (zH + 0.72)));
    }
  }

  // ---- stern: gallery, carvings, lanterns, ensign ----
  const sr = F.railY(0), stw = zAt(s0, sr);
  const winY = S.qd ? F.deckY(0) - 0.05 : dm + 0.25;
  const nwin = S.L > 28 ? 5 : 4;
  g.surf(DS.PLAIN);
  for (let i = 0; i < nwin; i++) {
    const z = (i - (nwin - 1) / 2) * (stw * 1.5 / nwin);
    gw.box(0.06, 0.72, 0.5, mat(s0.x - 0.1, winY + 0.45, z), C('#ffffff'));
    g.box(0.07, 0.86, 0.1, mat(s0.x - 0.11, winY + 0.45, z + 0.32), gold);
  }
  if (S.L > 28) for (let i = 0; i < nwin; i++) { const z = (i - (nwin - 1) / 2) * (stw * 1.5 / nwin); gw.box(0.06, 0.6, 0.45, mat(s0.x - 0.12, winY + 1.75, z), C('#ffffff')); }
  g.box(0.08, 0.14, stw * 1.9, mat(s0.x - 0.12, winY + 0.95, 0), gold);
  g.box(0.08, 0.14, stw * 1.9, mat(s0.x - 0.12, winY - 0.05, 0), gold);
  g.box(0.1, 0.45, stw * 1.2, mat(s0.x - 0.14, sr - 0.35, 0), gold);
  g.ico(0.42, 0, mat(s0.x - 0.18, sr - 0.4, 0, 0, 0, 0, 0.5, 1, 1.4), gold);
  g.surf(DS.METAL);
  const lanterns = [];
  const nl = S.lanterns;
  for (let i = 0; i < nl; i++) {
    const z = nl === 1 ? 0 : (i - 1) * stw * 0.72, big = nl === 1 || i === 1 ? 1.25 : 1;
    const base = V(s0.x + 0.15, sr + 0.05, z);
    g.rod(base, base.clone().add(V(-0.25, 0.75 * big, 0)), 0.07, 0.05, 5, dark);
    const lp = base.clone().add(V(-0.3, 1.05 * big, 0));
    gw.cyl(0.22 * big, 0.17 * big, 0.55 * big, 6, mat(lp.x, lp.y, lp.z), C('#ffffff'));
    g.add(new THREE.ConeGeometry(0.3 * big, 0.32 * big, 6), mat(lp.x, lp.y + 0.42 * big, lp.z), gold);
    g.cyl(0.18 * big, 0.24 * big, 0.12 * big, 6, mat(lp.x, lp.y - 0.33 * big, lp.z), gold);
    lanterns.push(lp);
  }
  // ensign staff
  g.surf(DS.WOOD);
  const ensignBase = V(s0.x + 0.2, sr, -stw * 0.35);
  g.rod(ensignBase, ensignBase.clone().add(V(-0.6, 4.6, 0)), 0.07, 0.05, 5, mastC);

  // ---- bow: figurehead, catheads, anchors ----
  const bowX = L / 2, bowR = F.railY(1);
  g.surf(DS.PLAIN); g.ico(0.38, 0, mat(bowX - 0.1, bowR - 0.55, 0, 0, 0, 0, 1.3, 0.9, 0.6), gold); g.surf(DS.WOOD);
  for (const sd of [1, -1]) {
    const sc = sectionAt(0.9), cz = zAt(sc, sc.r);
    g.box(1.6, 0.28, 0.28, mat(sc.x + 0.1, sc.r - 0.1, sd * (cz + 0.5), 0, sd * 0.5, 0), col.wale);
    const ax = sc.x + 0.35, az = sd * (cz + 0.95);
    g.surf(DS.METAL); g.box(0.14, 2.2, 0.14, mat(ax, sc.r - 1.4, az), iron);
    g.box(1.3, 0.16, 0.16, mat(ax, sc.r - 0.4, az), C('#4d3826'));
    g.box(0.9, 0.14, 0.14, mat(ax + 0.32, sc.r - 2.35, az, 0, 0, 0.6), iron);
    g.box(0.9, 0.14, 0.14, mat(ax - 0.32, sc.r - 2.35, az, 0, 0, -0.6), iron); g.surf(DS.WOOD);
  }

  // ---- masts, spars, sails ----
  const BRACE = 0.42, SWING = -0.3;
  const sailCol = (i, j, ny) => {
    let c = (i % 2 ? col.sail : col.sail2);
    if (col.patch && r() < 0.06) c = col.patch;
    return c;
  };
  const pushSail = (P, nx, ny, bellyDir) => {
    const idx = (i, j) => P[j * (nx + 1) + i];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      const cc = sailCol(i, j, ny);
      const k = 1 + (r() - 0.5) * 0.05;
      for (const q of [[a, b, c], [a, c, d]]) for (const v of q) {
        sail.p.push(v.v.x, v.v.y, v.v.z);
        sail.c.push(cc.r * k, cc.g * k, cc.b * k);
        sail.f.push(bellyDir.x * v.f, bellyDir.y * v.f, bellyDir.z * v.f);
        sail.s.push(DS.CLOTH, 0.36);
      }
    }
  };
  const squareSail = (mx, yTop, yBot, wTop, wBot, belly) => {
    const nx = 6, ny = 5, m = mat(mx + 0.4, 0, 0, 0, BRACE);
    const P = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const s = i / nx, t = j / ny;
      const z = (s - 0.5) * lerp(wTop, wBot, t);
      const y = lerp(yTop, yBot, t) + 0.5 * Math.sin(Math.PI * s) * t * t * t;
      const bl = belly * Math.sin(Math.PI * (0.06 + 0.88 * s)) * Math.sin(Math.PI * (0.1 + 0.9 * t) * 0.92);
      P.push({ v: V(bl, y, z).applyMatrix4(m), f: Math.sin(Math.PI * s) * Math.sin(Math.PI * t) });
    }
    pushSail(P, nx, ny, V(1, 0, 0).applyAxisAngle(V(0, 1, 0), BRACE));
    return { tl: V(0, yTop, -wTop / 2).applyMatrix4(m), tr: V(0, yTop, wTop / 2).applyMatrix4(m), bl: P[ny * (nx + 1)].v, br: P[ny * (nx + 1) + nx].v };
  };
  const yard = (mx, y, len) => {
    const m = mat(mx + 0.3, y, 0, 0, BRACE);
    const a = V(0, 0, -len / 2).applyMatrix4(m), b = V(0, 0, len / 2).applyMatrix4(m), c = V(0, 0, 0).applyMatrix4(m);
    g.rod(a, c, 0.09, 0.17, 6, mastC); g.rod(c, b, 0.17, 0.09, 6, mastC);
    furls.push([a.clone().lerp(b, 0.05).add(V(0.1, -0.28, 0)), b.clone().lerp(a, 0.05).add(V(0.1, -0.28, 0)), 0.3]);
    return { a, b };
  };
  const quadSail = (tack, throat, peak, clew, belly, swingAbout) => {
    const nx = 6, ny = 5, P = [];
    const m = mat(swingAbout, 0, 0, 0, SWING).multiply(mat(-swingAbout, 0, 0));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const s = i / nx, t = j / ny;
      const bot = tack.clone().lerp(clew, s), top = throat.clone().lerp(peak, s);
      const v = bot.lerp(top, t);
      v.z -= belly * Math.sin(Math.PI * (0.05 + 0.9 * s)) * Math.sin(Math.PI * (0.05 + 0.9 * t));
      P.push({ v: v.applyMatrix4(m), f: Math.sin(Math.PI * s) * Math.sin(Math.PI * t) });
    }
    pushSail(P, nx, ny, V(0, 0, -1));
    return m;
  };
  const triSail = (head, tack, clew, belly, bellyDir = V(0, 0, -1)) => {
    const n = 5, P = [];
    // rows from foot (tack-clew) to head; each row has n+1 points (collapsed at head)
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const t = j / n, s = i / n;
      const a = tack.clone().lerp(head, t), b = clew.clone().lerp(head, t);
      const v = a.lerp(b, s);
      v.addScaledVector(bellyDir, belly * Math.sin(Math.PI * s) * Math.sin(Math.PI * (0.08 + 0.84 * t)) * (1 - t * 0.5));
      P.push({ v, f: Math.sin(Math.PI * s) * (1 - t) });
    }
    pushSail(P, n, n, bellyDir);
  };
  const shrouds = (mx, yTop, deckU, spread = 2.2, n = 5, ratlines = true) => {
    const sc = sectionAt(deckU), rz = zAt(sc, sc.r) + 0.35;
    for (const sd of [1, -1]) {
      const ends = [];
      for (let i = 0; i < n; i++) {
        const x = mx - spread * 0.75 + i * spread / (n - 1) * 0.95;
        const a = V(mx, yTop, sd * 0.3), b = V(x, sc.r - 0.3, sd * rz);
        line(a, b); ends.push([a, b]);
        g.box(0.35, 0.5, 0.12, mat(x, sc.r - 0.45, sd * (rz - 0.05)), col.wale);
      }
      if (ratlines) for (let y = sc.r + 0.6; y < yTop - 1.8; y += 0.55) {
        for (let i = 0; i < n - 1; i++) {
          const p = ends.map(([a, b]) => b.clone().lerp(a, (y - b.y) / (a.y - b.y)));
          line(p[i], p[i + 1]);
        }
      }
    }
  };

  const mastInfo = [];
  const sprit = S.sprit;
  const bowBase = V(L / 2 - 2.3, F.deckY(0.98) + 0.45, 0);
  const spritTip = bowBase.clone().add(V(Math.cos(sprit.ang) * sprit.len, Math.sin(sprit.ang) * sprit.len, 0));
  g.rod(bowBase, spritTip, 0.3, 0.17, 7, mastC);
  furls.push([bowBase.clone().lerp(spritTip, 0.25).add(V(0, 0.28, 0)), spritTip.clone().add(V(0, 0.18, 0)), 0.2]);
  let jibTip = spritTip;
  if (sprit.jib) { jibTip = spritTip.clone().add(V(Math.cos(sprit.ang * 0.8) * sprit.jib, Math.sin(sprit.ang * 0.8) * sprit.jib, 0)); g.rod(spritTip.clone().add(V(-1.4, -0.45, 0)), jibTip, 0.14, 0.09, 6, mastC); }
  line(spritTip, V(L / 2 - 0.2, -0.4, 0));

  for (const mspec of S.masts) {
    const mx = -L / 2 + mspec.u * L, dy = F.deckY(mspec.u);
    const lowTop = dy + mspec.lower;
    g.rod(V(mx, dy - 0.4, 0), V(mx, lowTop, 0), 0.36, 0.28, 8, mastC);
    for (const yb of [dy + 2.2, dy + 4.6, dy + 7]) g.cyl(0.36, 0.36, 0.14, 8, mat(mx, yb, 0), dark);
    g.cyl(0.55, 0.62, 0.3, 8, mat(mx, dy + 0.1, 0), dark);
    const info = { x: mx, deck: dy, lowTop };
    if (mspec.rig === 'lateen') {
      const a = V(mx + 5.6, dy + 2.6, 0), b = V(mx - 6.5, dy + 12.2, 0);
      const m = mat(mx, 0, 0, 0, SWING * 0.7).multiply(mat(-mx, 0, 0));
      const A = a.clone().applyMatrix4(m), Bv = b.clone().applyMatrix4(m);
      g.rod(A, Bv, 0.12, 0.1, 6, mastC);
      triSail(Bv, A, V(mx - 4.2, dy + 2.4, -0.4).applyMatrix4(m), 0.9);
      line(V(mx, lowTop, 0), Bv); line(V(mx, lowTop, 0), A);
      shrouds(mx, lowTop - 0.8, mspec.u, 1.8, 3, false);
      info.top = lowTop;
      mastInfo.push(info);
      continue;
    }
    // top platform (crosstrees on a gaff mast) and topmast
    if (mspec.rig === 'gaff') { g.box(0.22, 0.12, 1.7, mat(mx, lowTop - 0.9, 0), dark); g.box(0.5, 0.4, 0.5, mat(mx, lowTop, 0), dark); }
    else { g.cyl(1.35, 1.3, 0.18, 8, mat(mx + 0.2, lowTop - 0.9, 0), dark); g.box(0.7, 0.55, 0.9, mat(mx, lowTop + 0.1, 0), dark); }
    let tmTop = lowTop, tgTop = lowTop;
    if (mspec.top) {
      tmTop = lowTop - 1.6 + mspec.top;
      g.rod(V(mx + 0.05, lowTop - 1.8, 0), V(mx + 0.05, tmTop, 0), 0.22, 0.16, 7, mastC);
      g.box(0.45, 0.35, 0.6, mat(mx + 0.05, tmTop - 0.6, 0), dark);
      tgTop = tmTop;
      if (mspec.tg) { tgTop = tmTop - 0.8 + mspec.tg; g.rod(V(mx + 0.08, tmTop - 1.0, 0), V(mx + 0.08, tgTop, 0), 0.13, 0.08, 6, mastC); g.ico(0.15, 0, mat(mx + 0.08, tgTop + 0.08, 0), gold); }
    }
    info.top = tgTop; info.tmTop = tmTop;
    const B = S.B;
    if (mspec.rig === 'square' || mspec.rig === 'brig') {
      const y1 = lowTop - 1.5, l1 = B * 1.85;
      const y2 = lowTop - 1.6 + mspec.top * 0.8, l2 = l1 * 0.76;
      const y3 = tmTop - 0.8 + mspec.tg * 0.72, l3 = l2 * 0.68;
      if (mspec.rig === 'square') {
        const Y1 = yard(mx, y1, l1);
        const s1 = squareSail(mx, y1 - 0.15, dy + 2.9, l1 * 0.93, l1 * 1.0, 1.9);
        line(Y1.a, V(mx - 5, dy + 3, -B * 0.42)); line(Y1.b, V(mx - 5, dy + 3, B * 0.42));
        line(s1.bl, V(mx - 1.2, F.railY(mspec.u), -B * 0.48)); line(s1.br, V(mx - 1.2, F.railY(mspec.u), B * 0.48));
      }
      const Y2 = yard(mx, y2, l2);
      squareSail(mx, y2 - 0.12, mspec.rig === 'square' ? y1 + 0.35 : lowTop - 0.7, l2 * 0.93, mspec.rig === 'square' ? l1 * 0.9 : l1 * 0.72, 1.45);
      if (mspec.tg) { const Y3 = yard(mx, y3, l3); squareSail(mx, y3 - 0.1, y2 + 0.3, l3 * 0.93, l2 * 0.88, 0.95); line(Y3.a, Y2.a); line(Y3.b, Y2.b); }
      line(Y2.a, V(mx - 6, lowTop - 2, -B * 0.4)); line(Y2.b, V(mx - 6, lowTop - 2, B * 0.4));
      if (mspec.rig === 'brig') {
        // gaff mainsail with boom
        const boomY = dy + 3.4, gaffY = lowTop - 1.3;
        const boomL = L * 0.43, gaffL = L * 0.32;
        const tack = V(mx - 0.35, boomY, 0), throat = V(mx - 0.35, gaffY, 0);
        const clew = V(mx - boomL, boomY + 0.3, 0), peak = V(mx - 0.35 - gaffL * Math.cos(0.5), gaffY + gaffL * Math.sin(0.5), 0);
        const sm = quadSail(tack, throat, peak, clew, 1.25, mx);
        const tk = tack.clone().applyMatrix4(sm), ck = clew.clone().applyMatrix4(sm), th = throat.clone().applyMatrix4(sm), pk = peak.clone().applyMatrix4(sm);
        g.rod(tk, ck.clone().add(V(-0.4, -0.05, 0)), 0.16, 0.12, 6, mastC);
        furls.push([tk.clone().add(V(-0.6, 0.35, 0)), ck.clone().add(V(0.6, 0.35, 0)), 0.42]);
        g.rod(th, pk, 0.14, 0.1, 6, mastC);
        line(pk, V(mx, lowTop - 0.3, 0)); line(V(pk.x * 0.5 + th.x * 0.5, pk.y * 0.5 + th.y * 0.5, pk.z * 0.5), V(mx, lowTop - 0.6, 0));
        line(ck, V(-L / 2 + 0.6, F.railY(0) + 0.1, 0));
      }
      shrouds(mx, lowTop - 0.9, mspec.u + 0.01, 2.6, 5, true);
      // topmast shrouds to the platform edge
      for (const sd of [1, -1]) for (let i = 0; i < 3; i++) line(V(mx, tmTop - 0.5, 0), V(mx - 0.5 + i * 0.5, lowTop - 0.85, sd * 1.25));
    } else if (mspec.rig === 'gaff') {
      const boomY = dy + 2.0, gaffY = lowTop - 1.0;
      const boomL = L * mspec.boom, gaffL = boomL * 0.64;
      const tack = V(mx - 0.32, boomY, 0), throat = V(mx - 0.32, gaffY, 0);
      const clew = V(mx - boomL, boomY + 0.35, 0), peak = V(mx - 0.32 - gaffL * Math.cos(0.58), gaffY + gaffL * Math.sin(0.58), 0);
      const sm = quadSail(tack, throat, peak, clew, 1.25, mx);
      const tk = tack.clone().applyMatrix4(sm), ck = clew.clone().applyMatrix4(sm), th = throat.clone().applyMatrix4(sm), pk = peak.clone().applyMatrix4(sm);
      g.rod(tk, ck, 0.14, 0.11, 6, mastC); g.rod(th, pk, 0.12, 0.09, 6, mastC);
      furls.push([tk.clone().add(V(-0.5, 0.32, 0)), ck.clone().add(V(0.5, 0.32, 0)), 0.36]);
      if (mspec.top) triSail(V(mx + 0.05, tmTop - 0.2, 0), th.clone().add(V(0, 0.3, 0)), pk.clone().add(V(0.4, 0.1, 0)), 0.45);
      line(pk, V(mx, tmTop - 0.5, 0)); line(V(pk.x * 0.5 + th.x * 0.5, pk.y * 0.5 + th.y * 0.5, pk.z * 0.5), V(mx, lowTop - 0.5, 0));
      line(ck, V(Math.max(-L / 2 + 0.4, ck.x), F.railY(Math.max(0, (ck.x + L / 2) / L)), 0));
      shrouds(mx, lowTop - 1.0, mspec.u, 1.5, 3, true);
    } else if (mspec.rig === 'sloop') {
      const boomY = dy + 2.2, gaffY = lowTop - 1.2;
      const boomL = L * 0.72, gaffL = L * 0.45;
      const tack = V(mx - 0.35, boomY, 0), throat = V(mx - 0.35, gaffY, 0);
      const clew = V(mx - boomL, boomY + 0.4, 0), peak = V(mx - 0.35 - gaffL * Math.cos(0.62), gaffY + gaffL * Math.sin(0.62), 0);
      const sm = quadSail(tack, throat, peak, clew, 1.5, mx);
      const tk = tack.clone().applyMatrix4(sm), ck = clew.clone().applyMatrix4(sm), th = throat.clone().applyMatrix4(sm), pk = peak.clone().applyMatrix4(sm);
      g.rod(tk, ck, 0.16, 0.12, 6, mastC); g.rod(th, pk, 0.14, 0.1, 6, mastC);
      furls.push([tk.clone().add(V(-0.6, 0.35, 0)), ck.clone().add(V(0.6, 0.35, 0)), 0.4]);
      // gaff topsail
      triSail(V(mx + 0.05, tmTop - 0.2, 0), th.clone().add(V(0, 0.3, 0)), pk.clone().add(V(0.5, 0.1, 0)), 0.5);
      line(pk, V(mx, tmTop - 0.5, 0)); line(ck, V(-L / 2 + 0.4, F.railY(0), 0));
      shrouds(mx, lowTop - 1.0, mspec.u, 1.6, 3, true);
    }
    mastInfo.push(info);
  }

  // headsails and stays from the foremost mast
  const fore = mastInfo.reduce((a, b) => (b.x > a.x ? b : a));
  const stayA = V(fore.x, fore.lowTop - 0.8, 0), stayB = spritTip.clone().lerp(bowBase, 0.25);
  line(stayA, stayB);
  triSail(stayA.clone().lerp(stayB, 0.3), stayB.clone().lerp(stayA, 0.05), V(fore.x + 2.2, fore.deck + 2.6, -0.2), 0.6);
  if (fore.tmTop && fore.tmTop > fore.lowTop) {
    const tA = V(fore.x + 0.05, fore.tmTop - 0.3, 0);
    line(tA, spritTip);
    triSail(tA.clone().lerp(spritTip, 0.24), spritTip.clone().lerp(tA, 0.04), V(fore.x + 5.6, fore.deck + 3.4, -0.3), 0.7);
    if (sprit.jib && fore.top > fore.tmTop) {
      const gA = V(fore.x + 0.08, fore.top - 0.3, 0);
      line(gA, jibTip);
      triSail(gA.clone().lerp(jibTip, 0.3), jibTip.clone().lerp(gA, 0.03), V(fore.x + 9.0, fore.deck + 6.4, -0.3), 0.5);
    }
  } else {
    // sloop: big jib to the bowsprit tip
    const tA = V(fore.x, fore.lowTop - 0.4, 0);
    line(tA, spritTip);
    triSail(tA.clone().lerp(spritTip, 0.06), spritTip.clone().lerp(tA, 0.03), V(fore.x + 3.0, fore.deck + 1.8, -0.4), 1.1);
  }
  // stays between masts and backstays
  const sorted = [...mastInfo].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    line(V(a.x, a.lowTop - 0.8, 0), V(b.x - 0.4, b.deck + 1.2, 0));
    if (a.tmTop > a.lowTop) line(V(a.x, a.tmTop - 0.4, 0), V(b.x, b.lowTop - 0.6, 0));
  }
  for (const m of mastInfo) if (m.tmTop > m.lowTop) for (const sd of [1, -1]) {
    const u = Math.max(0.02, (m.x + L / 2) / L - 0.14), sc = sectionAt(u);
    line(V(m.x, m.tmTop - 0.5, 0), V(sc.x, sc.r, sd * (zAt(sc, sc.r) + 0.3)));
  }

  // ---- deck furniture, crew ----
  const mainM = sorted[sorted.length > 1 ? sorted.length - 2 : 0];
  const midDeckX = (mastInfo.length > 1) ? (sorted[sorted.length - 1].x + mainM.x) / 2 : mainM.x + 2.5;
  g.cyl(0.42, 0.46, 0.9, 8, mat(midDeckX - 1.8, dm + 0.45, 0), col.deck2);
  for (let i = 0; i < 4; i++) g.box(1.8, 0.08, 0.1, mat(midDeckX - 1.8, dm + 0.85, 0, 0, i * Math.PI / 4), dark);
  g.box(2.2, 0.16, 2.2, mat(midDeckX + 0.8, dm + 0.08, 0), C('#3a2a1d'));
  if (S.boat) boatGeo(g, mat(midDeckX + 0.8, dm + 1.25, 0, Math.PI, 0, 0, 0.95), col.top, C('#a58a62'));
  const barrelC = C('#7a5233');
  for (let i = 0; i < 5; i++) g.cyl(0.33, 0.33, 0.82, 8, mat(mainM.x + 1.4 + (i % 3) * 0.7, dm + 0.41, (i < 3 ? 1 : -1) * (S.B * 0.3)), barrelC);
  for (let i = 0; i < 3; i++) g.box(0.8, 0.7, 0.8, mat(fore.x - 1.6 + i * 0.85, dm + 0.35, -S.B * 0.28, 0, i * 0.3), C('#a07a4c'));
  // coiled ropes
  for (const z of [-1, 1]) g.add(new THREE.TorusGeometry(0.32, 0.09, 4, 8), mat(mainM.x - 1.2, dm + 0.08, z * S.B * 0.32, Math.PI / 2), C('#b49a6a'));
  // ship's wheel
  const wheelX = S.qd ? -L / 2 + S.qd.u * L - 1.6 : mainM.x - 3.5;
  const wheelY = S.qd ? F.deckY(0.05) : dm;
  g.box(0.25, 1.1, 0.3, mat(wheelX, wheelY + 0.55, 0), dark);
  g.add(new THREE.TorusGeometry(0.55, 0.05, 4, 12), mat(wheelX + 0.2, wheelY + 1.15, 0, 0, Math.PI / 2), C('#5a3c24'));
  for (let i = 0; i < 4; i++) g.box(0.05, 1.4, 0.05, mat(wheelX + 0.2, wheelY + 1.15, 0, 0, Math.PI / 2, i * Math.PI / 4), C('#5a3c24'));
  // crew
  const skins = [C('#e0b48c'), C('#b07a50'), C('#7a5236')];
  const shirts = [C('#e9e1cf'), C('#a93a2c'), C('#2f4d74'), C('#d8c79f'), C('#e9e1cf')];
  const pants = [C('#3a3228'), C('#2b3442'), C('#5b4a36')];
  const sailor = (x, y, z, rot, captain = false) => {
    g.surf(DS.PLAIN);
    const m = mat(x, y, z, 0, rot);
    const P = (px, py, pz) => V(px, py, pz).applyMatrix4(m).toArray();
    const sk = skins[Math.floor(r() * 3)], sh = captain ? C('#7d1f1a') : shirts[Math.floor(r() * 5)], pa = pants[Math.floor(r() * 3)];
    g.box(0.15, 0.8, 0.16, mat(...P(0, 0.4, -0.1), 0, rot), pa);
    g.box(0.15, 0.8, 0.16, mat(...P(0, 0.4, 0.1), 0, rot), pa);
    g.cyl(0.2, 0.23, 0.64, 6, mat(...P(0, 1.1, 0), 0, rot), sh);
    g.box(0.12, 0.62, 0.12, mat(...P(0.05, 1.08, -0.31), 0.2, rot, 0.15), sh);
    g.box(0.12, 0.62, 0.12, mat(...P(0.05, 1.08, 0.31), -0.2, rot, 0.15), sh);
    g.ico(0.145, 0, mat(...P(0, 1.57, 0)), sk);
    if (captain) { g.cyl(0.33, 0.33, 0.05, 6, mat(...P(0, 1.69, 0)), C('#1b1716')); g.cyl(0.14, 0.17, 0.22, 6, mat(...P(0, 1.8, 0)), C('#1b1716')); }
    else if (r() < 0.65) g.ico(0.155, 0, mat(...P(0, 1.64, 0), 0, 0, 0, 1, 0.55, 1), [C('#a4231c'), C('#2a3c63'), C('#c9b98f')][Math.floor(r() * 3)]);
    g.surf(DS.WOOD);
  };
  if (S.qd) { if (!U.noHelmsman || seed !== 3) sailor(wheelX - 0.55, wheelY, 0, 0); sailor(wheelX - 2.2, wheelY, -1.6, 0.4, true); }
  let placed = 0;
  for (let t = 0; t < 200 && placed < S.crew - 2; t++) {
    const u = lerp(S.qd ? S.qd.u + 0.04 : 0.15, S.fc ? S.fc.u - 0.03 : 0.85, r());
    const sc = sectionAt(u), w = deckW(u, dm) - 0.6;
    const x = sc.x, z = (r() * 2 - 1) * w;
    if (Math.abs(x - midDeckX - 0.8) < 1.8 && Math.abs(z) < 1.4) continue;
    if (mastInfo.some(m => Math.hypot(m.x - x, z) < 1.0)) continue;
    sailor(x, dm, z, r() * 6.28);
    placed++;
  }
  sailor(fore.x + 0.6, fore.lowTop - 0.8, 0.4, 1.2); // lookout in the fore top

  // ---- assemble ----
  const group = new THREE.Group();
  const shipMat = U.shipMat;
  const hull = new THREE.Mesh(g.build(), shipMat);
  hull.castShadow = true; hull.receiveShadow = true;
  group.add(hull);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sail.p, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(sail.c, 3));
  sg.setAttribute('aFlex', new THREE.Float32BufferAttribute(sail.f, 3));
  sg.setAttribute('aSurf', new THREE.Float32BufferAttribute(sail.s, 2));
  sg.computeVertexNormals();
  const sails = new THREE.Mesh(sg, U.sailMat);
  sails.castShadow = true; sails.receiveShadow = true;
  sails.customDepthMaterial = U.sailDepthMat;
  group.add(sails);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const rig = new THREE.LineSegments(lg, U.ropeMat);
  group.add(rig);
  group.add(new THREE.Mesh(gw.build(), U.glowMat));
  const gf = new Geo(seed + 5, 0.06); gf.surf(DS.CLOTH, 0.5);
  for (const [a, b, r0] of furls) { gf.rod(a, b, r0 * 0.7, r0 * 0.7, 6, col.sail2); const n = Math.max(2, Math.round(a.distanceTo(b) / 1.6)); for (let i = 0; i < n; i++) gf.ico(r0 * 1.1, 0, mat(...a.clone().lerp(b, (i + 0.5) / n).toArray(), i, i * 2, 0, 1.2, 0.9, 1), i % 2 ? col.sail : col.sail2); }
  const furled = new THREE.Mesh(gf.build(), U.shipMat); furled.castShadow = true; furled.visible = false; group.add(furled);
  // flags
  const mainTop = mastInfo.reduce((a, b) => (b.top > a.top ? b : a));
  const flag = makeFlag(LV.flag, S.L > 20 ? 3.6 : 2.6, S.L > 20 ? 2.3 : 1.7, U);
  flag.position.set(mainTop.x + 0.1, mainTop.top - 0.2, 0); flag.rotation.y = 0.75;
  group.add(flag);
  const ensign = makeFlag(LV.flag, S.L > 20 ? 4.4 : 3, S.L > 20 ? 2.8 : 1.9, U);
  ensign.position.copy(ensignBase).add(V(-0.55, 4.2, 0)); ensign.rotation.y = 0.85; ensign.rotation.z = -0.05;
  group.add(ensign);
  let pen = null;
  if (fore !== mainTop && fore.top > fore.lowTop) {
    pen = makeFlag('pennant', 7, 0.7, U);
    pen.position.set(fore.x + 0.1, fore.top - 0.25, 0); pen.rotation.y = 0.7;
    group.add(pen);
  }
  // torn sails: shot-through cloth loses whole facets in ragged patches (the same patches every time), by
  // collapsing triangles of this ship's own sail geometry, so the shared sail material stays untouched
  const sp = sg.attributes.position, sf = sg.attributes.aFlex, p0 = sp.array.slice(), f0 = sf.array.slice(), nTri = p0.length / 9;
  // big ragged patches: low-frequency noise over the sail's centroids, roughened a little per facet
  const tearAt = Float32Array.from({ length: nTri }, (_, i) => { const o = i * 9; return 0.8 * vnoise((p0[o] + p0[o + 3] + p0[o + 6]) * 0.12, (p0[o + 1] + p0[o + 4] + p0[o + 7]) * 0.12 + (p0[o + 2] + p0[o + 5] + p0[o + 8]) * 0.08, seed + 7) + 0.2 * (((i * 2654435761) >>> 0) % 1000) / 1000; });
  let torn = 0, far = false;
  return {
    group, spec: S, lanterns, guns, hull, sails, furled, flags: [flag, ensign], rails: F,
    setTorn(f) {
      f = Math.round(f * 20) / 20; if (f === torn) return; torn = f;
      const p = sp.array, fl = sf.array, cut = f * 0.55;
      for (let i = 0; i < nTri; i++) {
        const o = i * 9;
        if (tearAt[i] < cut) for (let k = 3; k < 9; k++) { p[o + k] = p0[o + (k % 3)]; fl[o + k] = f0[o + (k % 3)]; }
        else for (let k = 0; k < 9; k++) { p[o + k] = p0[o + k]; fl[o + k] = f0[o + k]; }
      }
      sp.needsUpdate = true; sf.needsUpdate = true;
    },
    get torn() { return torn; },
    // seen from chart height: no rigging and no flags (several draw calls a ship nobody can see)
    setLod(f) { if (f === far) return; far = f; rig.visible = !f; flag.visible = ensign.visible = !f; if (pen) pen.visible = !f; },
    setFurled(b) { sails.visible = !b; furled.visible = b; },
    setFlag(kind) { for (const f of [flag, ensign]) f.material.uniforms.tMap.value = flagTexture(kind); },
    mastTops: mastInfo.map(m => ({ x: m.x, top: m.top })),
    dims: { hl: L / 2, hb: S.B / 2 },
    sternLight: lanterns.reduce((a, b) => a.clone().add(b), V(0, 0, 0)).multiplyScalar(1 / Math.max(1, lanterns.length)),
  };
}
