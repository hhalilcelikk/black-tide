// Black Tide simulation: wind, sailing, broadsides, boarding, ports, traffic and the AI captain.
// Fixed 1/60 s steps with a seeded random generator. Heading psi: 0 = east (+x), pi/2 = north (-z).
import * as THREE from 'three';
import { buildShip, CLASSES, TYPES, LIVERIES, NATIONS } from './ship.js';
import { waveHeight } from './waves.js';
import { groundAt, route, clearLine, isWater } from './nav.js';
import { mulberry32 } from './util.js';
import { PORTS, PORT_BY_ID, nearestPort } from './ports.js';
import { createLadder, STYLES as RIVAL_STYLES, titleFor } from './ladder.js';
import { NATION_IDS, relation, atWar, friendly, MARQUE_AT, CLOSED_BELOW, BRETHREN_PRIZES, RANKS } from './nations.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180, KN = 0.75; // game metres per second per knot
export const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const headingTo = (dx, dz) => Math.atan2(-dz, dx);
export const compass = psi => ((90 - psi / D2R) % 360 + 360) % 360; // degrees clockwise from north (-z)
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compassName = deg => POINTS[Math.round(deg / 22.5) % 16];

export const GOODS = [
  { id: 'sugar', name: 'Sugar', base: 20 }, { id: 'rum', name: 'Rum', base: 26 }, { id: 'tobacco', name: 'Tobacco', base: 30 }, { id: 'cloth', name: 'Cloth', base: 34 },
  { id: 'spices', name: 'Spices', base: 62 }, { id: 'timber', name: 'Timber', base: 12 }, { id: 'powder', name: 'Powder', base: 40 }, { id: 'silver', name: 'Silver', base: 95 },
];
export const SHOTS = { round: { name: 'Round shot', range: 190, speed: 92, hull: 2.8, sails: 0.4, crew: 0.45 }, chain: { name: 'Chain shot', range: 140, speed: 84, hull: 0.4, sails: 5.2, crew: 0.2 }, grape: { name: 'Grape shot', range: 95, speed: 74, hull: 0.12, sails: 0.3, crew: 1.3 } };
const GUNW = { sloop: 0.8, schooner: 0.85, brigantine: 1, fluyt: 0.9, frigate: 1.1, galleon: 1.1, manowar: 1.3 };

// chart labels: islands, and every port at its town (port: the port's id)
export const ISLANDS = [
  { name: 'Isla Rosalind', x: -60, z: -190 }, { name: 'Lantern Rock', x: -186, z: 70 },
  { name: 'Cayo Palma', x: 152, z: 44 }, { name: 'Gull Cay', x: 36, z: 170 }, { name: 'The Teeth', x: 94, z: -30 },
  { name: 'Isla Catalina', x: -580, z: 320 }, { name: 'Île de Lys', x: 640, z: -40 }, { name: 'Meeuweneiland', x: 392, z: -610 }, { name: 'Isla Calavera', x: -612, z: -580 },
  ...PORTS.map(P => ({ name: P.name, x: P.x, z: P.zShore - 12, port: P.id, nation: P.nation })),
];
const TRADERS = PORTS.filter(P => P.nation !== 'pirate'); // merchant traffic sails between these
const EDGES = [[-760, 230], [760, -140], [760, 260], [-760, 60], [-700, -420], [720, 330], [740, -380], [-720, 300], [620, 520], [-620, 480], [760, 120], [-760, 260]];
const MERCHANT_CLS = { spanish: ['galleon', 'galleon', 'schooner', 'sloop'], dutch: ['fluyt', 'fluyt', 'schooner'], english: ['schooner', 'fluyt', 'sloop'], french: ['schooner', 'sloop', 'fluyt'] };
const NAMES = {
  spanish: ['Santa Rosa', 'San Felipe', 'La Concepción', 'Nuestra Señora del Mar', 'San Telmo', 'La Dorada', 'San Jerónimo', 'La Paloma', 'Santa Inés', 'El Halcón'],
  english: ['Swallow', 'Kingfisher', 'Resolution', 'Hart', 'Lark', 'Greyhound', 'Speedwell', 'Mary Rose', 'Diligence', 'Falcon'],
  french: ['Le Faucon', 'La Belle', "L'Hermine", 'Le Dauphin', 'La Licorne', 'Le Vautour', 'La Sirène', "L'Aigle"],
  dutch: ['Gouden Leeuw', 'De Zeemeeuw', 'Witte Valk', 'Hoop', 'Eendracht', 'De Liefde', 'Zwarte Arend', 'Vrede'],
  pirate: ['Revenge', 'Black Gull', 'Merry Widow', 'Sea Wolf', 'Night Heron', 'Rook', 'Bloody Mary', 'Gallows Bird'],
};

export function polar(off, C) {
  const p = C.point * D2R, b = C.best * D2R;
  if (off < p - 0.17) return 0.05;
  if (off < p) return 0.05 + 0.4 * (off - (p - 0.17)) / 0.17;
  if (off < b) { const t = (off - p) / (b - p); return 0.45 + 0.55 * (1 - (1 - t) * (1 - t)); }
  const t = (off - b) / (Math.PI - b); return 1 - 0.22 * t * t;
}
export function pointOfSail(off) {
  const d = off / D2R;
  if (d < 40) return 'In irons'; if (d < 65) return 'Close-hauled'; if (d < 80) return 'Close reach'; if (d < 105) return 'Beam reach'; if (d < 155) return 'Broad reach'; return 'Running';
}

export function createGame({ scene, U, fx, seed = 7 }) {
  const rnd = mulberry32(seed);
  const rr = (a, b) => a + (b - a) * rnd();
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const listeners = {};
  const emit = (ev, data) => { for (const f of listeners[ev] || []) f(data); };

  const G = {
    seed, slot: null, t: 0, phase: 0.6, daySpeed: 1 / 720, weather: 0, weatherTarget: 0, nextWeather: 300, paused: false, timeScale: 1,
    wind: { from: Math.PI / 2, speed: 1.0, gust: 0 }, windBase: Math.PI / 2,
    ships: [], balls: [], player: null, selected: null, log: [], banner: null,
    gold: 350, cargo: Object.fromEntries(GOODS.map(g => [g.id, 0])), fame: 0, prizes: 0, rank: null,
    autopilot: true, order: 'hunt', attract: true, docked: false, port: null,
    boarding: null, loot: null, course: null, sinking: null, standing: { english: 0, spanish: -10, french: 0, dutch: 0, pirate: 0 }, commission: null, brethren: false, stolen: {},
    tutorial: true, aggroT: -1e9, fleetFireT: -1e9,
    on(ev, f) { (listeners[ev] || (listeners[ev] = [])).push(f); },
  };
  // ---------------- markets ----------------
  // Each port makes some goods (cheap) and needs others (dear). Trading moves a port's price a little per
  // unit (k), and k drifts back to 1 with a four-minute time constant. A separate seeded stream sets the
  // small differences in the other prices, so the market never shifts the simulation's random numbers.
  const mrnd = mulberry32((seed ^ 0x6d61726b) >>> 0);
  G.markets = Object.fromEntries(PORTS.map(P => [P.id, Object.fromEntries(GOODS.map(g => [g.id, { mod: P.makes.includes(g.id) ? 0.62 : P.needs.includes(g.id) ? 1.5 : 0.9 + mrnd() * 0.2, k: 1 }]))]));
  const unitSell = (g, m) => Math.max(1, Math.round(g.base * m.mod * m.k));
  const unitBuy = (g, m) => { const s = unitSell(g, m); return Math.max(s + 1, Math.round(s * 1.12)); };
  G.prices = id => Object.fromEntries(GOODS.map(g => { const m = G.markets[id][g.id]; return [g.id, { sell: unitSell(g, m), buy: unitBuy(g, m) }]; }));
  G.marketT = 0;
  function stepMarkets(dt) {
    G.marketT += dt; if (G.marketT < 1) return;
    const f = 1 - Math.exp(-G.marketT / 240); G.marketT = 0;
    for (const id in G.markets) for (const g in G.markets[id]) { const m = G.markets[id][g]; m.k += (1 - m.k) * f; }
  }
  G.tradeProfit = 0; G.trades = []; G.ports = PORTS; G.arrivals = [];

  Object.defineProperty(G, 'upgrades', { enumerable: true, get() { return G.player ? G.player.up : { hull: 0, sails: 0, guns: 0 }; }, set(v) { if (G.player) G.player.up = v; } });
  // your fleet: the flagship (role 'player') and up to two consorts
  const isFleet = s => !!s && (s.role === 'player' || s.role === 'consort');
  G.isFleet = isFleet;
  G.consorts = () => G.ships.filter(s => s.role === 'consort' && s.alive && s.state !== 'sinking');
  const say = (text, kind = 'info') => { G.log.unshift({ text, kind, t: G.t }); G.log.length = Math.min(G.log.length, 6); emit('log', { text, kind }); };
  G.say = say;
  const flash = (text, sub, dur = 4) => { G.banner = { text, sub, t: G.t, dur }; };
  G.flash = flash;

  // ---------------- ships ----------------
  let nextId = 1;
  const freeName = n => { const list = NAMES[n] || NAMES.pirate, used = new Set(G.ships.map(s => s.name)); const free = list.filter(x => !used.has(x)); return pick(free.length ? free : list); };
  function spawn(o) {
    const cls = o.cls, C = CLASSES[cls], T = TYPES[cls];
    const mesh = buildShip(cls, o.nation, U, o.seed ?? Math.floor(rnd() * 1000) + 11);
    scene.add(mesh.group);
    const s = {
      id: o.id || 's' + nextId++, cls, C, T, nation: o.nation, flagKind: LIVERIES[o.nation].flag, name: o.name || freeName(o.nation), role: o.role || 'merchant', mesh,
      x: o.x, z: o.z, psi: o.psi ?? 0, v: o.v ?? 3, rudder: 0, sailSet: o.sailSet ?? 1, sailAmt: o.sailSet ?? 1, heel: 0, y: 0, roll: 0, pitch: 0,
      maxHull: C.hull, maxSails: C.sails, maxCrew: C.crew, hull: C.hull, sails: C.sails, crew: Math.round(C.crew * (o.crewFrac ?? 1)), morale: o.morale ?? 1,
      reload: { '-1': 0, '1': 0 }, shot: 'round', state: 'sail', gold: o.gold ?? 0, cargo: o.cargo || {}, dest: o.dest || null, path: null, wp: 0,
      up: { hull: 0, sails: 0, guns: 0 }, think: rnd() * 0.5, target: null, threat: null, threatT: -99, tack: 0, tackT: 0, struckT: 0, fires: [], sinkT: 0, hitT: -9, alive: true, aground: 0,
    };
    G.ships.push(s);
    return s;
  }
  G.spawn = spawn;
  function remove(s) {
    s.alive = false;
    fx.dropFires(s.fires); s.fires = [];
    scene.remove(s.mesh.group);
    s.mesh.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.isShaderMaterial && o.material.uniforms.tMap) o.material.dispose(); });
    const i = G.ships.indexOf(s); if (i >= 0) G.ships.splice(i, 1);
    if (G.selected === s) G.selected = null;
    for (const o of G.ships) { if (o.target === s) o.target = null; if (o.threat === s) o.threat = null; }
  }
  G.remove = remove;
  const hostile = (a, b) => {
    if (a === b || !b.alive) return false;
    if (isFleet(a)) return !isFleet(b);
    if (isFleet(b)) return a.role === 'navy' ? true : a.role === 'pirate' ? (a.rival ? true : !G.brethren) : (a.threat === b);
    if (b.rival && a.role === 'navy' && friendly(a.nation, b.nation)) return false; // a navy lets its own crown's famous captains be
    if (a.role === 'pirate') return b.role !== 'pirate';
    if (b.role === 'pirate') return a.role === 'navy';
    return a.threat === b;
  };
  G.hostile = hostile;
  G.speedKn = s => s.v / KN;
  G.reloadTime = s => 6.2 / Math.min(1, Math.max(0.35, 0.3 + 0.8 * s.crew / s.maxCrew)) * (isFleet(s) ? 1 / (1 + 0.1 * s.up.guns) : s.role === 'merchant' ? 1.5 : 1);

  // ---------------- wind and weather ----------------
  function stepWind(dt) {
    const w = G.wind, t = G.t;
    w.from = wrap(G.windBase + 0.38 * Math.sin(t * 0.0021) + 0.14 * Math.sin(t * 0.0067 + 1.3));
    const base = 1.0 + 0.12 * Math.sin(t * 0.013) + G.weather * 0.45;
    w.gust = G.weather > 0.3 ? 0.25 * G.weather * Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 0.37)) : 0;
    w.speed = base + w.gust;
    if (!G.attract) {
      G.nextWeather -= dt;
      if (G.nextWeather < 0) { const r = rnd(); G.weatherTarget = r < 0.6 ? 0 : r < 0.88 ? 0.5 : 1; G.nextWeather = rr(180, 320); if (G.weatherTarget > 0.7) say('The sky to windward turns black. A storm is coming.', 'warn'); }
    }
    G.weather += (G.weatherTarget - G.weather) * (1 - Math.exp(-dt / 25));
  }

  // ---------------- physics ----------------
  const Yax = new THREE.Vector3(0, 1, 0), Zax = new THREE.Vector3(0, 0, 1), Xax = new THREE.Vector3(1, 0, 0);
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
  function place(s) {
    const L = s.T.L, B = s.T.B, amp = U.uWaveAmp.value, t = G.t, x = s.x, z = s.z, psi = s.psi;
    const fx_ = Math.cos(psi), fz = -Math.sin(psi), rx = Math.sin(psi), rz = Math.cos(psi);
    const hb = waveHeight(x + fx_ * L * 0.4, z + fz * L * 0.4, t, amp), hs = waveHeight(x - fx_ * L * 0.4, z - fz * L * 0.4, t, amp);
    const hp = waveHeight(x - rx * B * 0.45, z - rz * B * 0.45, t, amp), hst = waveHeight(x + rx * B * 0.45, z + rz * B * 0.45, t, amp);
    s.y = (hb + hs + hp + hst) * 0.25 * 0.85;
    let pitch = Math.atan2(hb - hs, L * 0.8) * 0.75, roll = Math.atan2(hp - hst, B * 0.9) * 0.6 + s.heel;
    let y = s.y;
    if (s.state === 'sinking') { const k = Math.min(1, s.sinkT / 11); y -= k * k * (s.T.T + s.T.dMain + 6); roll += k * 0.55 * (s.id.charCodeAt(1) % 2 ? 1 : -1); pitch += k * 0.32; }
    s.mesh.group.position.set(x, y, z);
    _q1.setFromAxisAngle(Yax, psi); _q2.setFromAxisAngle(Zax, pitch); _q3.setFromAxisAngle(Xax, roll);
    s.mesh.group.quaternion.copy(_q1).multiply(_q2).multiply(_q3);
    s.mesh.group.updateMatrixWorld(true);
  }
  G.place = place;

  function physics(s, dt) {
    const C = s.C, w = G.wind;
    s.sailAmt += (s.sailSet - s.sailAmt) * (1 - Math.exp(-dt / 2.0));
    const off = Math.abs(wrap(s.psi - w.from));
    // a consort off her station crowds on sail to catch up (a fleet otherwise sails at its slowest ship's pace)
    const up = (isFleet(s) ? 1 + 0.06 * s.up.sails : 1) * (s.role === 'consort' && s.lag ? 1.2 : 1) * (s.role === 'player' && G.fleetWait ? 0.8 : 1);
    let target = C.knots * KN * up * polar(off, C) * s.sailAmt * Math.min(1.35, w.speed) * (0.3 + 0.7 * s.sails / s.maxSails);
    if (s.state === 'struck' || s.state === 'sinking' || s.state === 'docked') target = 0;
    if (s.state === 'boarding') target = Math.min(target, 0.6);
    const tau = 3 + C.hull / 70;
    s.v += (target - s.v) * (1 - Math.exp(-dt / tau));
    const rate = 0.3 * C.turn * Math.min(1, Math.max(s.tacking ? 0.6 : 0, 0.28 + s.v / 3.2)); // a ship in stays swings through on her headsails
    if (s.state !== 'docked' && s.state !== 'sinking') {
      s.psi = wrap(s.psi - s.rudder * rate * dt);
      // in irons the bows pay off on their own
      if (!s.tacking && !s.towed && off < (C.point - 4) * D2R && s.v < 2.2 && s.sailAmt > 0.2) s.psi = wrap(s.psi + (Math.sign(wrap(s.psi - w.from)) || 1) * 0.09 * dt);
    }
    const side = Math.sign(wrap(w.from - s.psi)) || 1;
    const heelT = side * 0.09 * s.sailAmt * Math.sin(off) * Math.min(1.3, w.speed) * (s.state === 'sail' || s.state === 'engage' || s.state === 'flee' ? 1 : 0.3);
    s.heel += (heelT - s.heel) * (1 - Math.exp(-dt / 1.5));
    if (s.state === 'docked') return;
    let nx = s.x + Math.cos(s.psi) * s.v * dt, nz = s.z - Math.sin(s.psi) * s.v * dt;
    // storms push everything downwind
    if (G.weather > 0.3) { const k = (G.weather - 0.3) * 0.9 * dt; nx += Math.cos(w.from + Math.PI) * k; nz -= Math.sin(w.from + Math.PI) * k; }
    // grounding: sample the bow and the hull's middle
    const L = s.T.L, draft = -(s.T.T * 0.8);
    const bx = nx + Math.cos(s.psi) * L * 0.46, bz = nz - Math.sin(s.psi) * L * 0.46;
    if (s.state !== 'sinking' && (groundAt(bx, bz) > draft || groundAt(nx, nz) > draft)) {
      if (s.v > 2.6 && G.t - s.aground > 4) { s.hull -= s.v * 1.1; s.aground = G.t; if (s.role === 'player') say('Ran aground! The hull groans.', 'bad'); emit('hit', { s, x: bx, z: bz }); }
      // back her off and swing the bow toward deeper water
      const gx = groundAt(bx + 3, bz) - groundAt(bx - 3, bz), gz = groundAt(bx, bz + 3) - groundAt(bx, bz - 3);
      if (gx || gz) { const away = headingTo(-gx, -gz); s.psi = wrap(s.psi + Math.max(-0.02, Math.min(0.02, wrap(away - s.psi)))); }
      s.v = -0.4; return;
    }
    s.x = nx; s.z = nz;
  }

  function separate() {
    const S = G.ships;
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const a = S[i], b = S[j];
      if (a.state === 'sinking' || b.state === 'sinking') continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), reach = (a.T.L + b.T.L) * 0.5;
      if (d > reach) continue;
      let best = 0, px = 0, pz = 0;
      for (const ua of [-0.36, 0, 0.36]) for (const ub of [-0.36, 0, 0.36]) {
        const ax = a.x + Math.cos(a.psi) * a.T.L * ua, az = a.z - Math.sin(a.psi) * a.T.L * ua;
        const bx = b.x + Math.cos(b.psi) * b.T.L * ub, bz = b.z - Math.sin(b.psi) * b.T.L * ub;
        const ex = bx - ax, ez = bz - az, e = Math.hypot(ex, ez), m = (a.T.B + b.T.B) * 0.55 - e;
        if (m > best) { best = m; px = ex / (e || 1); pz = ez / (e || 1); }
      }
      if (best <= 0) continue;
      const ma = a.C.hull, mb = b.C.hull, ka = a.state === 'docked' ? 0 : mb / (ma + mb), kb = b.state === 'docked' ? 0 : ma / (ma + mb);
      a.x -= px * best * ka; a.z -= pz * best * ka; b.x += px * best * kb; b.z += pz * best * kb;
      if (G.boarding && ((G.boarding.a === a && G.boarding.b === b) || (G.boarding.a === b && G.boarding.b === a))) continue;
      a.v *= 0.97; b.v *= 0.97;
    }
  }

  // ---------------- combat ----------------
  const _v = new THREE.Vector3(), _o = new THREE.Vector3();
  function inArc(s, o, side) {
    const r = wrap(headingTo(o.x - s.x, o.z - s.z) - s.psi);
    return Math.abs(Math.abs(r) - Math.PI / 2) < 0.36 && Math.sign(r) === -side;
  }
  G.inArc = inArc;
  function sideTo(s, o) { const r = wrap(headingTo(o.x - s.x, o.z - s.z) - s.psi); return r > 0 ? -1 : 1; }
  G.sideTo = sideTo;
  function fire(s, side, aimAt) {
    if (s.reload[side] > 0 || s.state === 'struck' || s.state === 'sinking' || s.state === 'docked' || s.state === 'boarding') return false;
    if (isFleet(s) && aimAt && !G.legal(aimAt)) G.aggroT = G.t;
    if (s.role === 'player') G.fleetFireT = G.t;
    s.shotsFired = (s.shotsFired || 0) + 1;
    const shot = SHOTS[s.shot];
    const guns = side > 0 ? s.mesh.guns.star : s.mesh.guns.port;
    let d = 150;
    if (aimAt) d = Math.hypot(aimAt.x - s.x, aimAt.z - s.z);
    else { // aim at the nearest hostile on that side, if any
      let bd = 1e9; for (const o of G.ships) if (o !== s && o.alive && o.state !== 'sinking' && hostile(s, o) && inArc(s, o, side)) { const dd = Math.hypot(o.x - s.x, o.z - s.z); if (dd < bd) { bd = dd; d = dd; } }
    }
    d = Math.min(Math.max(d, 25), shot.range);
    const v0 = shot.speed;
    let train = 0, lift = s.shot === 'chain' ? 0.03 : 0;
    const tgt = aimAt || G.ships.find(o => o !== s && o.alive && o.state !== 'sinking' && hostile(s, o) && inArc(s, o, side) && Math.hypot(o.x - s.x, o.z - s.z) < shot.range);
    if (tgt) {
      // lead the target, then train the guns up to 12 degrees toward it
      const tf = Math.hypot(tgt.x - s.x, tgt.z - s.z) / v0;
      const px = tgt.x + Math.cos(tgt.psi) * tgt.v * tf - Math.cos(s.psi) * s.v * tf, pz = tgt.z - Math.sin(tgt.psi) * tgt.v * tf + Math.sin(s.psi) * s.v * tf;
      d = Math.min(Math.max(Math.hypot(px - s.x, pz - s.z), 25), shot.range);
      const beam = wrap(s.psi - side * Math.PI / 2);
      train = Math.max(-0.3, Math.min(0.3, wrap(headingTo(px - s.x, pz - s.z) - beam)));
    }
    const el = 0.5 * Math.asin(Math.min(1, 9.8 * d / (v0 * v0))) + lift;
    const out = _o.set(0, 0, side).applyQuaternion(s.mesh.group.quaternion); out.y = 0; out.normalize();
    const fwd = new THREE.Vector3(Math.cos(s.psi), 0, -Math.sin(s.psi));
    // rotate the firing direction by the training angle (positive = toward the bow for starboard... use heading maths)
    if (train) { const a = -train; const c = Math.cos(a), sn = Math.sin(a); const ox = out.x * c - out.z * sn, oz = out.x * sn + out.z * c; out.set(ox, 0, oz); }
    const muzzles = fx.muzzle(s.mesh, side, G.t);
    const per = s.shot === 'grape' ? 3 : 1;
    muzzles.forEach((p, i) => {
      for (let k = 0; k < per; k++) {
        const yaw = (rnd() - 0.5) * (s.shot === 'grape' ? 0.2 : 0.07), pe = el + (rnd() - 0.5) * (s.shot === 'grape' ? 0.05 : 0.022);
        const dir = out.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(fwd, Math.sin(yaw));
        const vh = v0 * Math.cos(pe);
        G.balls.push({ x: p.x, y: p.y, z: p.z, vx: dir.x * vh + Math.cos(s.psi) * s.v, vy: v0 * Math.sin(pe), vz: dir.z * vh - Math.sin(s.psi) * s.v, owner: s, shot: s.shot, dist: 0, range: shot.range * 1.15, delay: i * 0.11 + rnd() * 0.04 });
      }
    });
    s.reload[side] = G.reloadTime(s);
    emit('fire', { s, side, n: guns.length });
    return true;
  }
  G.fire = fire;

  function damage(s, shot, by, px, py, pz, part) {
    const w = (GUNW[by.cls] || 1) * (by.role === 'merchant' ? 0.55 : 1), S = SHOTS[shot]; // merchant crews are poor gunners
    const shield = isFleet(s) ? 1 / (1 + 0.1 * s.up.hull) : 1;
    if (part === 'rig') { s.sails -= shot === 'chain' ? 5.2 * w : S.sails * 2 * w; s.crew -= shot === 'grape' ? S.crew * w : 0; s.hull -= S.hull * w * 0.2; }
    else { s.hull -= S.hull * w * shield; s.sails -= S.sails * w * 0.5; s.crew -= S.crew * w * (0.6 + rnd() * 0.8); }
    s.sails = Math.max(0, s.sails); s.crew = Math.max(0, s.crew);
    s.hitT = G.t;
    if (!isFleet(s) && by && (!s.threat || s.threat === by)) { s.threat = by; s.threatT = G.t; }
    if (isFleet(by) && !isFleet(s)) by.hits = (by.hits || 0) + 1;
    if (!isFleet(s) && isFleet(by) && s.nation !== 'pirate') G.standing[s.nation] = (G.standing[s.nation] || 0) - 0.4;
    fx.hit(new THREE.Vector3(px, py, pz), G.t, part === 'rig');
    emit('hit', { s, x: px, z: pz, part, by });
    if (s.hull < s.maxHull * 0.55 && s.fires.length < 2 && rnd() < 0.05 && part !== 'rig') {
      const lx = (rnd() - 0.5) * s.T.L * 0.6, f = fx.addFire(s.mesh.group, new THREE.Vector3(lx, s.T.dMain + 0.2, (rnd() - 0.5) * s.T.B * 0.4), 0.55 + rnd() * 0.25, 40 + Math.floor(rnd() * 50), false);
      s.fires.push(f);
      if (s.role === 'player') say('Fire on deck!', 'bad');
    }
  }

  function stepBalls(dt) {
    for (let i = G.balls.length - 1; i >= 0; i--) {
      const b = G.balls[i];
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.vy -= 9.8 * dt;
      const sx = b.vx * dt, sz = b.vz * dt;
      b.x += sx; b.y += b.vy * dt; b.z += sz; b.dist += Math.hypot(sx, sz);
      let gone = false;
      if (b.dist > b.range && b.shot === 'grape') gone = true;
      for (const s of G.ships) {
        if (s === b.owner || !s.alive || s.state === 'sinking') continue;
        const dx = b.x - s.x, dz = b.z - s.z;
        if (dx * dx + dz * dz > (s.T.L * 0.6) ** 2) continue;
        const c = Math.cos(s.psi), sn = Math.sin(s.psi);
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c, ly = b.y - s.y;
        const hl = s.T.L / 2, k = 1 - Math.pow(Math.min(1, Math.abs(lx) / hl), 4);
        const rail = s.T.dMain + 1.3 + (s.T.qd && lx < -hl + s.T.qd.u * s.T.L ? s.T.qd.h : 0);
        if (Math.abs(lx) < hl && Math.abs(lz) < s.T.B * 0.55 * Math.sqrt(Math.max(0, k)) + 0.2 && ly > -1.2 && ly < rail) { damage(s, b.shot, b.owner, b.x, b.y, b.z, b.shot === 'chain' ? 'rig' : 'hull'); gone = true; break; }
        const top = s.mesh.mastTops.reduce((m, q) => Math.max(m, q.top), 0);
        if (Math.abs(lx) < hl * 0.85 && Math.abs(lz) < s.T.B * 1.0 && ly >= rail && ly < top && (b.shot === 'chain' || rnd() < 0.35)) { damage(s, b.shot, b.owner, b.x, b.y, b.z, 'rig'); gone = true; break; }
      }
      if (!gone && b.y < -0.3) {
        if (isWater(b.x, b.z, -0.2)) { fx.splash(new THREE.Vector3(b.x, 0, b.z), G.t, b.shot === 'grape' ? 0.35 : 0.75); emit('splash', b); }
        gone = true;
      }
      if (gone) G.balls.splice(i, 1);
    }
  }

  function checkStates(s, dt) {
    for (const k of ['-1', '1']) s.reload[k] = Math.max(0, s.reload[k] - dt);
    if (s.state === 'sinking') { s.sinkT += dt; if (s.sinkT > 13) { for (const f of s.fires) f.grp.parent && f.grp.parent.remove(f.grp); fx.dropFires(s.fires); remove(s); } return; }
    if (s.hull <= 0) {
      s.state = 'sinking'; s.sinkT = 0; s.sailSet = 0;
      emit('sink', s);
      if (s.role === 'player') {
        const heir = G.consorts().sort((a, b) => b.C.guns - a.C.guns || b.hull - a.hull)[0];
        if (heir) { // the biggest consort takes the flag; no shipwreck while the fleet floats
          s.role = 'lost'; heir.role = 'player'; heir.state = 'sail'; G.player = heir; G.selected = null; trimHold(s);
          say('The ' + s.name + ' is going down! The ' + heir.name + ' is your flagship now.', 'bad');
          flash(s.name + ' is lost', 'The ' + heir.name + ' carries your flag', 5);
          emit('flagship', heir);
        } else { say('The ' + s.name + ' is going down!', 'bad'); G.sinking = { t: G.t }; }
      } else if (s.role === 'consort') { s.role = 'lost'; say('Your consort the ' + s.name + ' is going down!', 'bad'); trimHold(s); emit('consortLost', s); }
      else {
        const by = s.threat;
        if (isFleet(by)) { credit(s, 'sink'); if (s.rival) ladder.beat(s.rival, 'goes down under your guns'); const salvage = Math.round((s.gold || 100) * 0.25); G.gold += salvage; G.fame += 3; say('Sank the ' + s.name + '. Salvage: +' + salvage + ' gold', 'good'); flash(s.name + ' sinks', '+' + salvage + ' gold in salvage'); }
      }
      return;
    }
    if (isFleet(s) || s.role === 'lost' || s.state === 'struck' || s.state === 'boarding') return;
    const h = s.hull / s.maxHull, c = s.crew / s.maxCrew, sl = s.sails / s.maxSails;
    const lim = s.role === 'merchant' ? [0.55, 0.55, 0.35] : s.role === 'pirate' ? [0.32, 0.32, 0.1] : [0.24, 0.26, 0.08];
    if (G.t - s.threatT < 40 && (h < lim[0] || c < lim[1] || sl < lim[2])) {
      s.state = 'struck'; s.sailSet = 0; s.struckT = G.t; s.mesh.setFlag('white'); s.flagKind = 'white';
      if (isFleet(s.threat) && s.rival) ladder.beat(s.rival, 'strikes to you');
      if (isFleet(s.threat)) { say('The ' + s.name + ' strikes her colours!', 'good'); flash(s.name + ' strikes her colours', 'Come alongside and press B to board'); }
      emit('struck', s);
    }
  }

  // ---------------- helm control ----------------
  function steerTo(s, psiDes, gain = 2.4) {
    let d = wrap(psiDes - s.psi);
    // the short way round crosses the wind's eye: tack only with real way on, and once a tack has
    // begun see it through; a ship without way wears round downwind instead
    const a0 = wrap(s.psi - G.wind.from), a1 = wrap(psiDes - G.wind.from);
    const crossing = a0 * a1 < 0 && Math.abs(a0) + Math.abs(a1) < Math.PI && Math.abs(d) > 0.05;
    if (crossing) {
      const dir = Math.sign(d);
      if (s.tacking && s.tacking.dir === dir && G.t - s.tacking.t < 25) { /* keep turning through the wind */ }
      else if (s.v > s.C.knots * KN * 0.3 && Math.abs(d) < 2.3) s.tacking = { dir, t: G.t };
      else { s.tacking = null; d = d > 0 ? d - TAU : d + TAU; }
    } else s.tacking = null;
    s.rudder = Math.max(-1, Math.min(1, -d * gain));
  }
  const clearance = (s, a, max = 150) => { const c = Math.cos(a), sn = -Math.sin(a); for (let k = 12; k <= max; k += 12) if (groundAt(s.x + c * k, s.z + sn * k) > -4.5) return k; return max; };
  function sailable(s, psiDes) {
    const w = G.wind, p = (s.C.point + 6) * D2R;
    const d = wrap(psiDes - w.from);
    if (Math.abs(d) >= p) return psiDes;
    // dead to windward: beat up on the tack nearer the bearing. Go about when the bearing has crossed
    // the wind by a few degrees, or when this tack is running out of sea room and the other has more.
    const better = Math.sign(d) || s.tack || 1;
    if (!s.tack) s.tack = better;
    if (G.t > s.tackT) {
      const room = clearance(s, wrap(w.from + s.tack * p)), roomOther = clearance(s, wrap(w.from - s.tack * p));
      if ((better !== s.tack && Math.abs(d) > 0.12 && roomOther > 48) || (room < 84 && roomOther > room + 20)) { s.tack = -s.tack; s.tackT = G.t + 8; }
    }
    return wrap(w.from + s.tack * p);
  }
  // avoid land: test the desired heading, then fan out
  function avoid(s, psiDes) {
    const look = Math.max(36, s.v * 7 + s.T.L * 0.8);
    const ok = a => { const c = Math.cos(a), sn = -Math.sin(a); for (const k of [0.2, 0.45, 0.7, 1]) if (groundAt(s.x + c * look * k, s.z + sn * look * k) > -4.5) return false; return true; };
    if (ok(psiDes)) return psiDes;
    const nogo = a => Math.abs(wrap(a - G.wind.from)) < (s.C.point + 4) * D2R;
    const sideOf = a => Math.sign(wrap(a - G.wind.from)) || 1;
    const mine = sideOf(s.psi);
    // fan out from the wanted heading, keeping to our side of the wind if we can (no tack, no wear);
    // if only the other side is clear, go about properly so the next think keeps that tack
    let other = null;
    for (let i = 1; i <= 11; i++) for (const sg of [1, -1]) {
      const a = wrap(psiDes + sg * i * 0.26);
      if (!ok(a) || nogo(a)) continue;
      if (sideOf(a) === mine) return a;
      if (other === null) other = a;
    }
    if (other !== null) { s.tack = sideOf(other); s.tackT = G.t + 8; return other; }
    return wrap(s.psi + Math.PI * 0.5);
  }
  function followPath(s, arrive = 30) {
    if (!s.path || s.wp >= s.path.length) return true;
    const [tx, tz] = s.path[s.wp];
    const d = Math.hypot(tx - s.x, tz - s.z);
    if (d < (s.wp === s.path.length - 1 ? arrive : 45)) { s.wp++; return s.wp >= s.path.length; }
    const want = headingTo(tx - s.x, tz - s.z);
    steerTo(s, avoid(s, sailable(s, want)));
    return false;
  }
  G.sailable = sailable; G.avoid = avoid; G.engage = engage;
  G.setCourse = (s, x, z) => { s.path = route(s.x, s.z, x, z); s.wp = 0; if (s.role === 'player') G.course = { x, z }; };

  // ---------------- engagement (shared by NPCs and the AI captain) ----------------
  function engage(s, o, prefer) {
    const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz), b = headingTo(dx, dz);
    const shot = SHOTS[s.shot];
    let want;
    s.sailSet = 1;
    if (prefer === 'board') {
      // close in and lay her alongside
      const close = (s.T.L + o.T.L) * 0.5 + 4;
      if (d > close) want = b;
      else { want = o.psi; s.sailSet = 0.5; }
    } else if (d > shot.range * 1.25) {
      // chase, leading the target
      const tt = d / Math.max(4, s.v + 2);
      want = headingTo(o.x + Math.cos(o.psi) * o.v * tt * 0.7 - s.x, o.z - Math.sin(o.psi) * o.v * tt * 0.7 - s.z);
    } else {
      // beam pursuit: steer so she sits on our beam on the side already facing her,
      // turning in when too far and out when too close; a faster ship circles her and works both broadsides
      const side = sideTo(s, o);
      const ideal = Math.min(shot.range * 0.55, 85);
      // guns loaded and in range: swing her square on the beam for the shot; otherwise work the distance
      const ready = s.reload[side] <= 0 && d < shot.range * 0.95;
      const turnIn = ready ? 0 : Math.max(-0.5, Math.min(0.5, (d - ideal) / ideal * 0.9));
      want = wrap(b + side * (Math.PI / 2 - turnIn));
      s.sailSet = 1;
      if (o.v < 1 && d < 40) { want = wrap(b + side * Math.PI / 2); s.sailSet = 0.5; }
    }
    const psiDes = avoid(s, sailable(s, want));
    steerTo(s, psiDes);
    if (prefer !== 'board') for (const side of [-1, 1]) if (s.reload[side] <= 0 && inArc(s, o, side) && d < shot.range * 0.98) fire(s, side, o);
    return d;
  }

  // ---------------- boarding ----------------
  function odds(a, b) {
    const ma = a.morale * (a.role === 'player' ? 1.15 : 1), mb = b.morale * (b.state === 'struck' ? 0.3 : 1) * (b.role === 'navy' ? 1.2 : 1); // a crew that has struck fights half-heartedly
    const sa = Math.pow(Math.max(1, a.crew) * ma, 1.25), sb = Math.pow(Math.max(1, b.crew) * mb, 1.25);
    return sa / (sa + sb);
  }
  G.odds = odds;
  G.canBoard = (a, b) => {
    if (!b || !b.alive || b.state === 'sinking' || b.state === 'docked' || G.boarding) return false;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    return d < (a.T.L + b.T.L) * 0.5 + 6 && (b.state === 'struck' || Math.abs(a.v - b.v) < 2.2 || b.v < 1.6);
  };
  G.board = (a, b) => {
    if (!G.canBoard(a, b)) return false;
    G.boarding = { a, b, t: 0, p: odds(a, b), roll: G.attract && a.role === 'player' && !G.prizes ? 0 : rnd(), side: sideTo(a, b) }; // the trailer's first prize always falls
    a.state = 'boarding'; b.prevState = b.state; b.state = 'boarding'; a.sailSet = 0; a.rudder = 0; b.rudder = 0;
    if (a.role === 'player' && !G.legal(b)) G.aggroT = G.t;
    emit('board', G.boarding);
    if (a.role === 'player') say('Grapples away! Boarding the ' + b.name + '.', 'info');
    return true;
  };
  function stepBoarding(dt) {
    const B = G.boarding; if (!B) return;
    B.t += dt;
    const { a, b } = B;
    // pull the target alongside
    const side = B.side, gap = (a.T.B + b.T.B) * 0.5 + 2.2;
    const tx = a.x + Math.sin(a.psi) * side * gap, tz = a.z + Math.cos(a.psi) * side * gap;
    const k = 1 - Math.exp(-dt * 1.4);
    b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.psi = wrap(b.psi + wrap(a.psi - b.psi) * k);
    b.v *= 0.9; a.v *= 0.95;
    if (B.t > 0.6 && Math.floor(B.t * 7) !== Math.floor((B.t - dt) * 7)) {
      const u = (rnd() - 0.5) * Math.min(a.T.L, b.T.L) * 0.6;
      const p = new THREE.Vector3((a.x + b.x) / 2 + Math.cos(a.psi) * u, a.T.dMain + 1.6, (a.z + b.z) / 2 - Math.sin(a.psi) * u);
      fx.skirmish(p, G.t);
      emit('melee', p);
    }
    if (B.t > 3.6) {
      const win = B.roll < B.p;
      const lossA = Math.round(a.crew * (win ? 0.05 + 0.1 * (1 - B.p) : 0.25)), lossB = Math.round(b.crew * (win ? 0.6 : 0.2));
      a.crew = Math.max(4, a.crew - lossA); b.crew = Math.max(0, b.crew - lossB);
      a.state = a.role === 'player' ? 'sail' : 'engage';
      G.boarding = null;
      if (win) {
        b.state = 'struck'; b.mesh.setFlag(a.role === 'player' ? G.colours() : 'white'); b.flagKind = 'captured';
        if (a.role === 'player') {
          const goods = Object.entries(b.cargo).filter(([, n]) => n > 0);
          G.loot = { ship: b, gold: b.gold, goods, lost: lossA, t: G.t };
          G.prizes++; G.fame += 8 + Math.round(b.gold / 40);
          credit(b, 'prize');
          if (b.rival) ladder.beat(b.rival, 'is your prize');
          ladder.rerank(false);
          say('Took the ' + NATIONS[b.nation].adj + ' ' + b.C.name.toLowerCase() + ' ' + b.name + '. Lost ' + lossA + ' men.', 'good');
          emit('won', b);
        } else b.cargo = {};
      } else {
        b.state = b.prevState === 'struck' ? 'sail' : b.prevState || 'flee'; b.mesh.setFlag(LIVERIES[b.nation].flag);
        if (a.role === 'player') { say('Boarders thrown back! Lost ' + lossA + ' men.', 'bad'); flash('Boarding failed', 'The ' + b.name + ' fights you off'); }
        emit('lost', b);
      }
    }
  }
  G.takeLoot = (choice) => {
    const L = G.loot; if (!L) return;
    const b = L.ship;
    if (choice === 'cargo' || choice === 'ship') {
      G.gold += L.gold; b.gold = 0;
      let room = holdRoom();
      for (const [id, n] of L.goods) { const k = Math.min(n, room); G.cargo[id] += k; G.stolen[id] = (G.stolen[id] || 0) + k; room -= k; b.cargo[id] -= k; }
      if (L.gold) flash('+' + L.gold + ' gold', 'Cargo taken from the ' + b.name, 4);
    }
    if (choice === 'consort' && G.consorts().length < 2) {
      // a prize crew from the flagship, and a few of her own hands who sign on
      const P = G.player, k = Math.max(6, Math.round(P.crew * 0.2));
      P.crew = Math.max(4, P.crew - k);
      b.role = 'consort'; b.crew = Math.min(b.maxCrew, k + Math.round(b.crew * 0.3)); b.morale = 1; b.state = 'sail'; b.sailSet = 1; b.threat = null; b.target = null; b.path = null; b.looted = false; b.prize = false;
      b.hull = Math.max(b.hull, b.maxHull * 0.35); b.sails = Math.max(b.sails, b.maxSails * 0.35);
      applyColours(b);
      say('The ' + b.name + ' sails with you now: a ' + CLASSES[b.cls].name.toLowerCase() + ' under a prize crew of ' + b.crew + '.', 'good');
      flash('A new consort', 'The ' + b.name + ' joins your fleet', 4);
      emit('consort', b);
      G.loot = null;
      return;
    }
    if (choice === 'ship' && CLASSES[b.cls].guns >= G.player.C.guns * 0.8) {
      const old = G.player;
      b.role = 'player'; b.nation = 'pirate'; b.crew = Math.max(12, Math.round(old.crew * 0.85)); b.morale = 1; b.state = 'sail'; b.sailSet = 1; applyColours(b);
      b.hull = Math.max(b.hull, b.maxHull * 0.5); b.sails = Math.max(b.sails, b.maxSails * 0.5);
      old.role = 'merchant'; old.nation = 'pirate'; old.state = 'sail'; old.crew = Math.max(6, Math.round(old.crew * 0.15)); old.dest = 'port'; old.prize = true;
      const home = nearestPort(old.x, old.z, G.welcome) || nearestPort(old.x, old.z); old.path = route(old.x, old.z, home.x, home.z - 10); old.wp = 0;
      G.player = b; G.selected = null;
      say('The ' + b.name + ' is your flagship now. A prize crew takes the ' + old.name + ' to port.', 'good');
      emit('flagship', b);
    } else if (choice === 'free') {
      if (b.nation !== 'pirate') G.standing[b.nation] = (G.standing[b.nation] || 0) + 2;
      say('Let the ' + b.name + ' go. ' + (NATIONS[b.nation].name) + ' will remember it.', 'info');
    }
    if (b !== G.player) {
      b.state = 'sail'; b.sailSet = 1; b.threat = null; b.looted = true; b.mesh.setFlag(b.nation === 'pirate' ? 'jolly' : 'white');
      const a = Math.atan2(b.z + 40, b.x) || 0, ex = Math.cos(a) * 780, ez = Math.sin(a) * 780 - 40;
      b.path = route(b.x, b.z, ex, ez); b.wp = 0;
    }
    G.loot = null;
  };
  // one hold shared by the fleet
  const holdUsed = () => Object.values(G.cargo).reduce((a, b) => a + b, 0);
  const holdCap = () => Math.round(G.player.C.hold + G.consorts().reduce((a, s) => a + s.C.hold, 0));
  const holdRoom = () => Math.max(0, holdCap() - holdUsed());
  G.holdUsed = holdUsed; G.holdRoom = holdRoom; G.holdCap = holdCap;
  // a lost ship takes her share of the cargo down with her
  function trimHold(lost) {
    let over = holdUsed() - holdCap(); if (over <= 0) return;
    const gone = over;
    for (const g of [...GOODS].sort((a, b) => G.cargo[b.id] - G.cargo[a.id])) { const k = Math.min(over, G.cargo[g.id]); G.cargo[g.id] -= k; if (G.stolen[g.id]) G.stolen[g.id] = Math.min(G.stolen[g.id], G.cargo[g.id]); over -= k; if (!over) break; }
    say(gone + ' crates went down with the ' + lost.name + '.', 'warn');
  }
  // ---------------- the Ladder ----------------
  function spawnRival(r) {
    const p = G.player, rank = ladder.rankOf(r);
    const s = spawn({ cls: r.cls, nation: r.nation, role: 'pirate', name: r.name, x: r.x, z: r.z, psi: headingTo(p.x - r.x, p.z - r.z), v: 3, gold: Math.round(200 + r.fame * 0.4), cargo: { [pick(GOODS).id]: 14 }, morale: 1.1 });
    s.rival = r.id; s.style = r.style; s.shot = RIVAL_STYLES[r.style].shot;
    if (r.dest) { s.path = route(s.x, s.z, r.dest[0], r.dest[1]); s.wp = 0; }
    say('Sail ho! ' + r.name + ', #' + rank + ' on the Ladder, in a ' + CLASSES[r.cls].name.toLowerCase() + '.', 'warn');
    emit('rival', s);
    return s;
  }
  // a famous captain fights you when you are close to them on the Ladder (or you started it), and when the odds suit their style
  const rivalDuels = (s, P) => {
    const near = G.rank !== null && Math.abs(ladder.rankOf(ladder.byId(s.rival)) - G.rank) <= 15;
    return (s.threat === P || near) && P.C.guns <= s.C.guns * RIVAL_STYLES[s.style].duel;
  };
  const ladder = createLadder(G, { say, flash: (t, s, d) => flash(t, s, d), emit, remove, isWater: (x, z) => isWater(x, z, -6), spawnRival }, seed);

  // ---------------- nations ----------------
  const clampSt = n => { G.standing[n] = Math.max(-30, Math.min(30, G.standing[n] || 0)); };
  // a port lets you in unless its crown (or, at the cove, the Brethren) has turned hostile
  G.welcome = P => (G.standing[P.nation === 'pirate' ? 'pirate' : P.nation] || 0) >= CLOSED_BELOW;
  // a legal prize: a pirate (unless you are one of the Brethren), or an enemy of the crown whose letter you carry
  G.legal = b => b.nation === 'pirate' ? !G.brethren : !!(G.commission && atWar(G.commission.nation, b.nation));
  G.colours = () => G.commission ? LIVERIES[G.commission.nation].flag : 'jolly';
  function applyColours(s) { s.mesh.setFlag(G.colours()); s.flagKind = G.colours(); }
  G.applyColours = () => applyColours(G.player);
  G.rankName = () => G.commission ? RANKS[G.commission.rank].name : null;
  // what a prize or a sinking does to your name
  function credit(b, kind) {
    const X = b.nation, C = G.commission;
    if (X === 'pirate') {
      G.standing.pirate = (G.standing.pirate || 0) - (kind === 'prize' ? 5 : 7);
      for (const n of NATION_IDS) G.standing[n] = (G.standing[n] || 0) + 1.5;
      if (G.brethren) { G.brethren = false; say('The Brethren of the Coast cast you out for preying on your own.', 'bad'); flash('Cast out', 'The Brethren of the Coast will not forget it'); }
    } else {
      G.standing[X] = (G.standing[X] || 0) - (kind === 'prize' ? 4 : 6);
      for (const n of NATION_IDS) if (atWar(n, X)) G.standing[n] = (G.standing[n] || 0) + 2;
      if (C && atWar(C.nation, X)) {
        G.standing[C.nation] += 3; C.prizes++;
        const money = 100 + 50 * C.rank; G.gold += money;
        say(NATIONS[C.nation].name + ' pays ' + money + ' gold prize money for the ' + b.name + '.', 'good');
        while (C.rank < RANKS.length - 1 && C.prizes >= RANKS[C.rank + 1].prizes) {
          const R = RANKS[++C.rank]; G.gold += R.gold; G.fame += R.fame; ladder.rerank(false);
          say('Promoted to ' + R.name + ' by ' + NATIONS[C.nation].name + ': ' + R.gold + ' gold.', 'good');
          flash('Promoted to ' + R.name, NATIONS[C.nation].name + ' pays you ' + R.gold + ' gold', 5);
          emit('promoted', { nation: C.nation, rank: C.rank });
        }
      } else if (C && friendly(C.nation, X)) {
        G.standing[C.nation] -= 10;
        say(NATIONS[C.nation].name + ' will not forget an attack on ' + (C.nation === X ? 'its own flag' : 'an ally') + '.', 'bad');
      }
      if (C && G.standing[C.nation] < 0) { say('Your letter of marque from ' + NATIONS[C.nation].name + ' is revoked.', 'bad'); flash('Letter of marque revoked', 'You sail under the black flag again'); G.commission = null; applyColours(G.player); }
    }
    for (const n of [...NATION_IDS, 'pirate']) clampSt(n);
  }
  // offered by a governor in his own port once your standing is high enough; one letter at a time
  G.canMarque = () => { const P = G.docked && G.dockPort; return !!(P && P.nation !== 'pirate' && !G.brethren && (G.standing[P.nation] || 0) >= MARQUE_AT && (!G.commission || G.commission.nation !== P.nation)); };
  G.acceptMarque = () => {
    if (!G.canMarque()) return false;
    const n = G.dockPort.nation;
    if (G.commission) say('You return your letter from ' + NATIONS[G.commission.nation].name + '.', 'info');
    G.commission = { nation: n, rank: 0, prizes: 0 };
    applyColours(G.player);
    say('Letter of marque from ' + NATIONS[n].name + ': ' + NATION_IDS.filter(x => atWar(n, x)).map(x => NATIONS[x].adj).join(' and ') + ' ships are now your lawful prizes.', 'good');
    flash('Letter of marque', 'You sail as a Privateer of ' + NATIONS[n].name, 5);
    emit('marque', n);
    return true;
  };
  G.resignMarque = () => { if (!G.commission) return false; say('You return your letter of marque to ' + NATIONS[G.commission.nation].name + '.', 'info'); G.commission = null; applyColours(G.player); return true; };
  // the Brethren of the Coast: offered at the cove to captains who have taken a prize, and never with a letter
  G.canJoinBrethren = () => !!(G.docked && G.dockPort.nation === 'pirate' && !G.brethren && !G.commission && G.prizes >= BRETHREN_PRIZES && (G.standing.pirate || 0) >= 0);
  G.joinBrethren = () => {
    if (!G.canJoinBrethren()) return false;
    G.brethren = true; G.standing.pirate = Math.max(G.standing.pirate || 0, 10);
    say('You swear the articles of the Brethren of the Coast. Pirates will leave you be, and the cove pays well for stolen cargo.', 'good');
    flash('Brethren of the Coast', 'Pirate ships leave you alone', 5);
    emit('brethren', true);
    return true;
  };
  G.fenceRate = id => G.brethren && G.port && G.port.id === 'cove' && (G.stolen[id] || 0) > 0 ? 1.3 : 1;

  G.title = () => titleFor(G.rank);

  // ---------------- port ----------------
  G.portAt = s => { const P = nearestPort(s.x, s.z); return Math.hypot(s.x - P.x, s.z - P.z) < P.r ? P : null; };
  G.nearPort = s => !!G.portAt(s);
  G.dockPort = PORTS[0];
  G.moor = (s, P = G.dockPort) => ({ x: P.x, z: P.moorZ + s.T.B / 2 + 2.8, psi: 0 });
  const openPort = P => ({ id: P.id, screen: 'menu', t: G.t, rumourSeed: Math.floor(rnd() * 2 ** 32), get prices() { return G.prices(this.id); } });
  function stepDocking(s, dt) {
    const m = G.moor(s), d = Math.hypot(m.x - s.x, m.z - s.z);
    if (d > 9) {
      const want = headingTo(m.x - s.x, m.z - s.z);
      steerTo(s, d > 70 ? avoid(s, want) : want); s.sailSet = d > 40 ? 0.5 : 0.25;
      // the harbour boats take her in tow, so she reaches the quay whatever the wind (in irons she would stall)
      s.towed = true;
      s.v = Math.min(Math.max(s.v, Math.min(2.6, 0.8 + d * 0.03)), 1.2 + d * 0.05);
      return false;
    }
    const k = 1 - Math.exp(-dt * 1.2);
    s.x += (m.x - s.x) * k; s.z += (m.z - s.z) * k; s.psi = wrap(s.psi + wrap(m.psi - s.psi) * k); s.v *= 0.9; s.sailSet = 0; s.rudder = 0; s.tacking = null;
    return d < 1.2 && Math.abs(wrap(m.psi - s.psi)) < 0.06;
  }
  G.dock = () => { const p = G.player; if (G.docked || G.docking || p.state === 'sinking') return false; const P = G.portAt(p); if (!P) return false;
    if (!G.welcome(P)) { if (G.t - (G.refusedT || -99) > 8) { G.refusedT = G.t; say(P.name + ' has closed its harbour to you. Raise your standing with ' + (P.nation === 'pirate' ? 'the Brethren' : NATIONS[P.nation].name) + ' first.', 'warn'); emit('refused', P); } return false; } G.dockPort = P; G.docking = true; p.path = null; G.course = null; say('Making for the quay at ' + P.name + '.'); return true; };
  function arrive() {
    const p = G.player; G.docking = false; G.docked = true; p.towed = false; p.state = 'docked'; p.v = 0; p.rudder = 0; p.mesh.setFurled(true);
    G.port = openPort(G.dockPort);
    say('Docked at ' + G.dockPort.name + '.', 'good');
    emit('dock', p);
  }
  G.leavePort = () => {
    const p = G.player; if (!G.docked) return;
    G.docked = false; G.port = null; p.state = 'sail'; p.mesh.setFurled(false); p.sailSet = 0.5; p.psi = -Math.PI / 2 + 0.25; p.v = 1.5;
    G.setCourse(p, ...G.dockPort.exit);
    emit('undock', p);
  };
  // n > 0 buys, n < 0 sells, one unit at a time so a big lot moves the price as it goes; returns units traded
  G.trade = (id, n) => {
    if (!G.port) return 0;
    const g = GOODS.find(x => x.id === id), m = G.markets[G.port.id][id];
    let k = 0;
    if (n > 0) { for (; k < n && holdRoom() > 0 && G.gold >= unitBuy(g, m); k++) { G.gold -= unitBuy(g, m); G.cargo[id]++; m.k = Math.min(2.5, m.k * 1.004); } }
    else {
      for (; k < -n && G.cargo[id] > 0; k++) {
        G.gold += Math.round(unitSell(g, m) * G.fenceRate(id)); G.cargo[id]--; m.k = Math.max(0.4, m.k * 0.994);
        if (G.stolen[id] > 0) G.stolen[id]--;
        else { const nat = PORT_BY_ID[G.port.id].nation; if (nat !== 'pirate' && (G.standing[nat] || 0) < MARQUE_AT + 4) G.standing[nat] = (G.standing[nat] || 0) + 0.03; } // honest trade builds your name
      }
    }
    if (k) emit('coin', n);
    return k;
  };
  G.sellAll = () => { let total = 0; for (const g of GOODS) { const n = G.cargo[g.id]; if (n > 0) { const before = G.gold; G.trade(g.id, -n); total += G.gold - before; } } return total; };
  const fleet = () => [G.player, ...G.consorts()];
  G.fleet = fleet;
  G.repairCost = () => fleet().reduce((a, p) => a + Math.round((p.maxHull - p.hull) * 4 + (p.maxSails - p.sails) * 2.5), 0);
  G.repair = () => { const c = G.repairCost(); if (c <= 0 || G.gold < c) return false; G.gold -= c; for (const p of fleet()) { p.hull = p.maxHull; p.sails = p.maxSails; for (const f of p.fires) f.grp.parent && f.grp.parent.remove(f.grp); fx.dropFires(p.fires); p.fires = []; } say('Repaired the ' + (G.consorts().length ? 'fleet' : G.player.name) + ' for ' + c + ' gold.'); emit('coin', -c); return true; };
  // hands sign on for the whole fleet: the flagship first, then each consort
  G.hire = (n) => { let left = Math.floor(n), hired = 0; for (const p of fleet()) { p.crew = Math.floor(p.crew); const k = Math.min(left, p.maxCrew - p.crew, Math.floor(G.gold / 6)); if (k <= 0) continue; G.gold -= 6 * k; p.crew += k; left -= k; hired += k; } if (!hired) return false; say('Signed on ' + hired + ' hands.'); emit('coin', -6 * hired); return true; };
  G.upgradeCost = (k, s = G.player) => [600, 1200, 2400][s.up[k]] ?? null;
  G.upgrade = (k, s = G.player) => { const c = G.upgradeCost(k, s); if (c === null || G.gold < c) return false; G.gold -= c; s.up[k]++; if (k === 'hull') { s.maxHull = Math.round(s.C.hull * (1 + 0.1 * s.up.hull)); s.hull = s.maxHull; } say('Shipwright: the ' + s.name + '’s ' + k + ' upgraded.'); emit('coin', -c); return true; };
  G.buyShip = (cls) => {
    const C = CLASSES[cls], p = G.player; if (!C.price) return false;
    const tradeIn = Math.round(CLASSES[p.cls].price * 0.5 * (p.hull / p.maxHull));
    if (G.gold + tradeIn < C.price || cls === p.cls) return false;
    G.gold = G.gold + tradeIn - C.price;
    const m = G.moor({ T: TYPES[cls] });
    const n = spawn({ cls, nation: 'pirate', role: 'player', name: p.name, x: m.x, z: m.z, psi: 0, v: 0, sailSet: 0, crewFrac: 0, seed: 3 });
    n.crew = Math.min(n.maxCrew, p.crew); n.state = 'docked'; n.mesh.setFurled(true);
    remove(p); G.player = n;
    applyColours(n);
    say('Bought a ' + C.name.toLowerCase() + ' (trade-in ' + tradeIn + ' gold).', 'good'); emit('flagship', n); emit('coin', -C.price);
    return true;
  };

  // ---------------- traffic ----------------
  // Merchants sail from one trading port to another with the goods their home port makes. Navies sail
  // patrols between their own ports and the others; pirates put out from Hangman's Cove. A ship never
  // appears in a harbour the player can see: it comes in from the edge of the chart instead.
  const farFromPlayer = ([x, z]) => !G.player || Math.hypot(x - G.player.x, z - G.player.z) > 450;
  function spawnTraffic(role, near) {
    let from, to, nation;
    if (role === 'merchant') { from = pick(TRADERS); to = pick(TRADERS.filter(P => P !== from)); nation = from.nation; }
    else if (role === 'navy') { from = pick(TRADERS); to = pick(PORTS.filter(P => P !== from && P.nation !== 'pirate')); nation = from.nation; }
    else { from = PORT_BY_ID.cove; to = pick(TRADERS); nation = 'pirate'; }
    let start = from.exit;
    if (!farFromPlayer(start)) start = pick(EDGES.filter(farFromPlayer)) || pick(EDGES);
    let [x, z] = near || start;
    if (!isWater(x, z, -6)) [x, z] = start;
    const cls = role === 'navy' ? pick(['frigate', 'frigate', 'sloop', 'schooner']) : role === 'pirate' ? pick(['sloop', 'schooner', 'brigantine']) : pick(MERCHANT_CLS[nation]);
    const goods = {};
    if (role === 'merchant') for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) { const g = pick(from.makes.length && rnd() < 0.75 ? from.makes : GOODS.map(x => x.id)); goods[g] = (goods[g] || 0) + Math.round(rr(8, 26) * (cls === 'galleon' || cls === 'fluyt' ? 1.8 : 1)); }
    const gold = role === 'merchant' ? Math.round(cls === 'galleon' ? rr(600, 1300) : cls === 'fluyt' ? rr(350, 700) : rr(150, 360)) : Math.round(rr(80, 260));
    const b = role === 'merchant' ? [to.x + 10, to.z + 6] : to.exit;
    const s = spawn({ cls, nation, role, x, z, psi: headingTo(b[0] - x, b[1] - z), v: 3, gold, cargo: goods, morale: role === 'merchant' ? 0.7 : role === 'navy' ? 1.1 : 1 });
    s.dest = b; s.destPort = to.id; s.path = route(x, z, b[0], b[1]); s.wp = 0;
    return s;
  }
  // a patrol that reaches its port turns for another
  function nextPatrol(s) {
    const to = pick(PORTS.filter(P => P.id !== s.destPort && (s.role === 'pirate' ? P.nation !== 'pirate' : true)));
    s.destPort = to.id; s.dest = to.exit; s.path = route(s.x, s.z, ...to.exit); s.wp = 0;
  }
  G.spawnTraffic = spawnTraffic;
  function populate(dt) {
    G.spawnT = (G.spawnT || 0) - dt;
    if (G.spawnT > 0) return;
    G.spawnT = 4;
    const n = r => G.ships.filter(s => s.role === r && !s.rival && s.alive && s.state !== 'sinking').length;
    if (n('merchant') < 6) spawnTraffic('merchant');
    else if (n('navy') < 2 && G.t > 120) spawnTraffic('navy');
    else if (n('pirate') < 2 && G.t > 200) spawnTraffic('pirate');
    // drop ships that have left the chart
    for (const s of [...G.ships]) {
      if (isFleet(s) || G.boarding && (G.boarding.a === s || G.boarding.b === s)) continue;
      const far = Math.hypot(s.x, s.z + 40) > 1150, away = Math.hypot(s.x - G.player.x, s.z - G.player.z) > 420;
      if ((far && away) || (s.arrived && away)) remove(s);
    }
  }

  function npcThink(s) {
    const P = G.player;
    if (s.state === 'struck') {
      steerTo(s, s.psi); s.sailSet = 0;
      if (G.t - s.struckT > 50 && !(G.boarding)) { s.state = 'flee'; s.sailSet = 1; s.mesh.setFlag(LIVERIES[s.nation].flag); }
      return;
    }
    // who's around
    let foe = null, fd = 1e9;
    for (const o of G.ships) {
      if (o === s || !o.alive || o.state === 'sinking' || o.state === 'docked') continue;
      if (!hostile(s, o) && !(o === s.threat)) continue;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      if (d < fd) { fd = d; foe = o; }
    }
    if (s.role === 'merchant') {
      const threatened = (s.threat && s.threat.alive && G.t - s.threatT < 45) || (foe && fd < 130 && foe.role !== 'merchant');
      if (threatened && !s.prize) {
        const t = s.threat && s.threat.alive ? s.threat : foe;
        s.state = 'flee';
        const away = headingTo(s.x - t.x, s.z - t.z), down = G.wind.from + Math.PI;
        steerTo(s, avoid(s, sailable(s, wrap(away + wrap(down - away) * 0.4)))); s.sailSet = 1;
        if (s.C.guns >= 8) for (const side of [-1, 1]) if (s.reload[side] <= 0 && inArc(s, t, side) && fd < 150) fire(s, side, t);
        return;
      }
      s.state = 'sail'; s.sailSet = 1;
      if (followPath(s, 40)) { if (!s.arrived) { G.arrivals.push({ t: Math.round(G.t), ship: s.name, port: s.destPort }); emit('arrive', s); } s.arrived = true; s.sailSet = 0.3; }
      return;
    }
    // navy and pirates hunt
    const range = s.role === 'navy' ? 300 : 280;
    let tgt = null;
    if (s.threat && s.threat.alive && s.threat.state !== 'sinking' && G.t - s.threatT < 90) tgt = s.threat;
    else if (foe && fd < range && (s.role === 'pirate' ? foe.role === 'merchant' || (isFleet(foe) && (s.rival ? rivalDuels(s, foe) : !G.brethren && foe.C.guns <= s.C.guns * 1.2)) : isFleet(foe) || foe.role === 'pirate')) tgt = foe;
    // navies always hunt a pirate when their nation is hostile to you; otherwise only one that is wanted
    // (fired on or boarded an honest ship in the last ten minutes) and sails too close. Honest traders pass.
    // a navy also hunts the flag of a crown it is at war with, and never troubles its own or an ally's privateer
    if (s.role === 'navy' && isFleet(tgt) && !isFleet(s.threat)) {
      const C = G.commission, hostileNation = (G.standing[s.nation] || 0) < -2, wanted = G.t - G.aggroT < 600;
      const enemyFlag = C && atWar(C.nation, s.nation), ownFlag = C && friendly(C.nation, s.nation);
      if (!(hostileNation || enemyFlag || (!ownFlag && wanted && fd < 170))) tgt = null;
    }
    // the forts cover the harbours: hunters break off near any port, and give up a long stern chase
    if (tgt) { const hp = nearestPort(tgt.x, tgt.z); if (Math.hypot(tgt.x - hp.x, tgt.z - hp.z) < 150 || Math.hypot(tgt.x - s.x, tgt.z - s.z) > range * 1.35) { if (s.threat === tgt) s.threat = null; tgt = null; } }
    if (tgt && tgt.state !== 'docked') {
      s.state = 'engage'; s.target = tgt; s.shot = s.rival ? (s.style === 'boarder' && Math.hypot(tgt.x - s.x, tgt.z - s.z) > 90 ? 'round' : RIVAL_STYLES[s.style].shot) : 'round';
      if (s.role === 'pirate' && tgt.state === 'struck') { if (G.canBoard(s, tgt)) G.board(s, tgt); else engage(s, tgt, 'board'); }
      else engage(s, tgt);
      return;
    }
    s.state = 'sail'; s.sailSet = 0.8; s.target = null;
    if (followPath(s, 40)) { if (s.destPort) nextPatrol(s); else s.arrived = true; }
  }

  // ---------------- consorts ----------------
  // Station: echelon astern of the flagship. Fight: the flagship's target once she has opened fire, or anyone
  // attacking the fleet. In port: anchor off the pier head; sail again when the flagship does.
  const SLOTS = [[-34, -20], [-62, 20]]; // [astern, to starboard] in metres
  G.anchorFor = (s, P = G.dockPort) => { const i = G.consorts().indexOf(s); return { x: P.x + (i === 1 ? 38 : -38), z: P.moorZ + 34, psi: 0 }; };
  function fleetFoe(s) {
    let best = null, bd = 320;
    for (const o of G.ships) {
      if (!o.alive || isFleet(o) || o.state === 'sinking' || o.state === 'struck' || o.state === 'docked') continue;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      if (o.state === 'engage' && isFleet(o.target) && d < bd) { bd = d; best = o; }
    }
    if (best) return best;
    const t = G.selected;
    if (t && t.alive && !isFleet(t) && t.state !== 'sinking' && t.state !== 'struck' && G.t - G.fleetFireT < 30 && Math.hypot(t.x - s.x, t.z - s.z) < 420) return t;
    return null;
  }
  function consortThink(s) {
    const P = G.player;
    if (G.docked || G.docking) { // into the harbour, and anchor
      const a = G.anchorFor(s), d = Math.hypot(a.x - s.x, a.z - s.z);
      if (s.state === 'docked') return;
      if (d < 10) { s.state = 'docked'; s.v = 0; s.sailSet = 0; s.rudder = 0; s.psi = a.psi; s.mesh.setFurled(true); return; }
      // beat up to the harbour like any ship; inside it the harbour boats tow her to her anchorage
      s.state = 'sail'; s.towed = d < 160; const want = headingTo(a.x - s.x, a.z - s.z);
      steerTo(s, avoid(s, s.towed ? want : sailable(s, want))); s.sailSet = d > 60 ? 0.8 : 0.3;
      if (s.towed) s.v = Math.min(Math.max(s.v, Math.min(2.6, 0.8 + d * 0.03)), 1.2 + d * 0.05);
      return;
    }
    if (s.state === 'docked') { s.state = 'sail'; s.mesh.setFurled(false); s.towed = false; }
    const foe = fleetFoe(s);
    if (foe) { s.state = 'engage'; s.target = foe; s.shot = P.shot; s.lag = false; engage(s, foe); return; }
    s.state = 'sail'; s.target = null; s.towed = false;
    const i = Math.max(0, G.consorts().indexOf(s)), [back, side] = SLOTS[i];
    const fx_ = Math.cos(P.psi), fz = -Math.sin(P.psi), rx = Math.sin(P.psi), rz = Math.cos(P.psi);
    const tx = P.x + fx_ * back + rx * side, tz = P.z + fz * back + rz * side;
    const d = Math.hypot(tx - s.x, tz - s.z), ahead = (s.x - tx) * fx_ + (s.z - tz) * fz;
    s.lag = d > 50 && ahead < 0;
    G.fleetWait = G.consorts().some(c => c.lag && Math.hypot(c.x - P.x, c.z - P.z) > 90); // the flagship eases off until her consorts are up
    steerTo(s, avoid(s, sailable(s, d > 14 ? headingTo(tx - s.x, tz - s.z) : P.psi)));
    s.sailSet = ahead > 10 ? 0.5 : d > 45 ? 1 : Math.min(1, Math.max(0.3, P.sailSet + (d - 15) * 0.02));
  }

  // ---------------- AI captain ----------------
  G.ai = { phase: 'look', target: null, msg: 'Looking for a prize', t: 0, portT: 0 };
  function scoreTarget(p, o) {
    if (!o.alive || isFleet(o) || o.role === 'lost' || o.state === 'sinking' || o.looted || o.prize || o.state === 'docked') return -1;
    if (o.role === 'navy' && o.C.guns > p.C.guns * 0.9) return -1;
    if (o.C.guns * (o.role === 'merchant' ? 0.55 : 1) > p.C.guns * (0.6 + 0.6 * p.hull / p.maxHull)) return -1; // too heavy a broadside for us today
    const d = Math.hypot(o.x - p.x, o.z - p.z); if (d > 700) return -1;
    const od = odds(p, { ...o, crew: o.crew * 0.55, state: 'struck' });
    if (od < 0.55) return -1;
    const value = (o.gold || 50) + Object.values(o.cargo || {}).reduce((a, b) => a + b, 0) * 25;
    return value * od / (80 + d);
  }
  // ---- trade runs: buy what is cheap here, sail to the port that pays most for it, sell, repeat ----
  const goodName = id => GOODS.find(g => g.id === id).name.toLowerCase();
  const legDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // the best cargo to carry from port `here` (by expected profit per metre, with price slippage), or, when
  // nothing pays from here, the port to sail to empty because the best cargo waits there; null if nothing pays
  function planTrade(here) {
    const reserve = 120, room = holdRoom();
    let best = null;
    // at sea (here.id null) there is nothing to buy where we are: only the empty-run plan below applies
    if (here.id) for (const g of GOODS) for (const Q of PORTS) {
      const P0 = G.prices(here.id);
      if (Q === here || !G.welcome(Q)) continue;
      const buy = P0[g.id].buy, sell = G.prices(Q.id)[g.id].sell;
      const qty = Math.min(room, Math.floor((G.gold - reserve) / (buy * 1.05)));
      if (qty < 5) continue;
      const profit = qty * (sell * (1 - 0.003 * qty) - buy * (1 + 0.002 * qty));
      const score = profit / (legDist(here, Q) + 250);
      if (profit > qty * 3 && (!best || score > best.score)) best = { good: g.id, dest: Q.id, qty, score, profit };
    }
    if (best) return best;
    let empty = null;
    for (const R of PORTS) {
      if (R === here || !G.welcome(R)) continue;
      const PR = G.prices(R.id);
      for (const g of GOODS) for (const Q of PORTS) {
        if (Q === R || !G.welcome(Q)) continue;
        const units = Math.min(room, Math.floor((G.gold - 120) / (PR[g.id].buy * 1.05)));
        if (units < 5) continue;
        const spread = G.prices(Q.id)[g.id].sell * 0.85 - PR[g.id].buy * 1.1;
        const score = spread * units / (legDist(here, R) + legDist(R, Q) + 500);
        if (spread > 4 && (!empty || score > empty.score)) empty = { good: null, dest: R.id, next: g.id, score };
      }
    }
    return empty;
  }
  // handed a trade run at sea: take what we carry where it sells best, or go where the best cargo is
  function planAtSea(p) {
    if (holdUsed() > 0) {
      let best = null;
      for (const Q of PORTS.filter(G.welcome)) { const P = G.prices(Q.id), v = GOODS.reduce((a, g) => a + G.cargo[g.id] * P[g.id].sell, 0) / (Math.hypot(Q.x - p.x, Q.z - p.z) + 250); if (!best || v > best.v) best = { dest: Q.id, v }; }
      return { good: null, dest: best.dest, cost: null };
    }
    const near = nearestPort(p.x, p.z, P => P.nation !== 'pirate' && G.welcome(P)) || nearestPort(p.x, p.z, G.welcome);
    if (planTrade(near)) return { good: null, dest: near.id }; // something worth buying at the nearest port: start there
    return planTrade({ id: null, x: p.x, z: p.z }) || { good: null, dest: near.id };
  }
  function tradeInPort(dt) {
    const p = G.player, A = G.ai, here = G.dockPort;
    if (A.portT > 1.5 && !A.sold) {
      const T = A.trade;
      // a stop for repairs on the way: the cargo stays aboard for the port that pays for it
      if (T && T.bought && T.dest !== here.id && G.cargo[T.good] > 0) {
        if (p.hull < p.maxHull * 0.9 && G.gold > G.repairCost()) G.repair();
        if (p.crew < p.maxCrew * 0.5) G.hire(Math.round(p.maxCrew * 0.6 - p.crew));
      }
      // ...unless she still is not fit for sea: then the cargo is sold here to pay for the refit
      if (T && T.bought && T.dest !== here.id && G.cargo[T.good] > 0 && p.hull >= p.maxHull * 0.6 && p.crew >= p.maxCrew * 0.45) {
        say('Trade run: refitting in ' + here.name + '. The ' + goodName(T.good) + ' stays aboard for ' + PORT_BY_ID[T.dest].name + '.', 'info');
        A.sold = true; A.tradeWait = 0;
        return;
      }
      const carried = holdUsed(), sold = G.sellAll();
      if (sold > 0) {
        const profit = T && T.cost != null ? sold - T.cost : null;
        if (profit !== null) G.tradeProfit += profit;
        G.trades.push({ t: Math.round(G.t), port: here.id, good: T && T.good, sold, profit });
        say('Trade run: sold ' + carried + ' ' + (T && T.good ? goodName(T.good) : 'goods') + ' in ' + here.name + ' for ' + sold + ' gold' + (profit !== null ? ' (' + (profit >= 0 ? '+' : '') + profit + ')' : '') + '.', profit === null || profit >= 0 ? 'good' : 'warn');
        emit('trade', { port: here.id, sold, profit });
      }
      if (p.hull < p.maxHull * 0.9 && (G.gold - G.repairCost() > 200 || p.hull < p.maxHull * 0.6)) G.repair();
      if (p.crew < p.maxCrew * 0.5) G.hire(Math.round(p.maxCrew * 0.6 - p.crew));
      A.sold = true; A.trade = planTrade(here); A.tradeWait = 0;
      if (!A.trade) say('Trade run: no cargo pays from ' + here.name + '. Waiting for prices to recover.', 'warn');
    }
    if (!A.sold || A.portT < 4) return;
    if (!A.trade) { // prices recover over minutes: look again every 20 s
      A.msg = 'Trade run: waiting in ' + here.name + ' for prices to recover';
      A.tradeWait += dt; if (A.tradeWait > 20) { A.tradeWait = 0; A.trade = planTrade(here); }
      return;
    }
    const T = A.trade, dest = PORT_BY_ID[T.dest];
    if (T.bought) { /* resuming after a refit: the cargo is already aboard */ }
    else if (T.good) {
      const before = G.gold, k = G.trade(T.good, T.qty);
      T.cost = before - G.gold; T.qty = k; T.bought = true;
      say('Trade run: bought ' + k + ' ' + goodName(T.good) + ' in ' + here.name + ' at ' + Math.round(T.cost / Math.max(1, k)) + ' a unit, for ' + dest.name + '.', 'info');
    } else say('Trade run: sailing empty to ' + dest.name + ' for its ' + (T.next ? goodName(T.next) : 'cargo') + '.', 'info');
    A.sold = false; A.pathFor = null; G.leavePort();
  }

  function captain(dt) {
    const p = G.player, A = G.ai;
    if (G.docked) {
      A.portT += dt;
      if (G.order === 'trade' && !G.attract) tradeInPort(dt);
      else if (G.attract || G.order === 'hunt') {
        if (A.portT > 1.5 && !A.sold) { const s = G.sellAll(); if (s > 0) say('Sold the cargo for ' + s + ' gold.', 'good'); A.sold = true; A.toPort = false; if (p.hull < p.maxHull * 0.95) G.repair(); if (p.crew < p.maxCrew * 0.9) G.hire(Math.round(p.maxCrew - p.crew)); }
        if (A.portT > (G.attract ? 9 : 4)) { A.sold = false; G.leavePort(); A.phase = 'look'; }
      }
      return;
    }
    A.portT = 0;
    if (G.docking) return;
    if (G.loot) { A.lootT = (A.lootT || 0) + dt; if (A.lootT > 1.6) { G.takeLoot('cargo'); A.lootT = 0; if (G.attract && G.prizes === 1) A.toPort = true; } return; }
    if (p.state === 'boarding') return;
    // a heavier warship on our tail: run, for port if it lies away from her, firing when she comes abeam
    const trader = G.order === 'trade' && !G.attract;
    let danger = null, dd = 320;
    for (const o of G.ships) {
      if (!o.alive || o.state !== 'engage' || o.target !== p || (o.role !== 'navy' && o.role !== 'pirate') || (!trader && o.C.guns <= p.C.guns * 0.9)) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < dd) { dd = d; danger = o; }
    }
    if (danger) {
      A.phase = 'flee'; A.msg = 'Running from the ' + danger.name; A.pathFor = null; p.path = null; G.selected = danger;
      const away = headingTo(p.x - danger.x, p.z - danger.z);
      // the nearest harbour that does not lie behind the hunter; its fort makes him break off
      const hp = nearestPort(p.x, p.z, P => G.welcome(P) && Math.abs(wrap(headingTo(P.x - p.x, P.z - p.z) - away)) < 1.6) || nearestPort(p.x, p.z, G.welcome) || nearestPort(p.x, p.z);
      if (Math.hypot(p.x - hp.x, p.z - hp.z) < 60) { G.dock(); return; }
      const home = headingTo(hp.x - p.x, hp.z - p.z);
      const want = Math.abs(wrap(home - away)) < (trader ? 1.6 : 1.1) ? home : wrap(away + wrap(G.wind.from + Math.PI - away) * 0.3);
      p.sailSet = 1; p.shot = 'chain';
      steerTo(p, avoid(p, sailable(p, want)));
      for (const side of [-1, 1]) if (p.reload[side] <= 0 && inArc(p, danger, side) && dd < SHOTS[p.shot].range) fire(p, side, danger);
      return;
    }
    const warships = G.ships.some(o => o.alive && (o.role === 'navy' || o.role === 'pirate') && o.state === 'engage' && o.target === p && Math.hypot(o.x - p.x, o.z - p.z) < 260);
    const trading = G.order === 'trade' && !G.attract;
    const needPort = p.hull < p.maxHull * (warships ? 0.6 : 0.45) || (!trading && holdRoom() < 8) || p.crew < p.maxCrew * 0.35 || A.toPort;
    const sailFor = (P, key) => {
      if (G.nearPort(p) && Math.hypot(p.x - P.x, p.z - P.z) < 60) { G.dock(); return; }
      if (!p.path || A.pathFor !== key + P.id) { G.setCourse(p, P.x + 10, P.z + 6); A.pathFor = key + P.id; }
      p.sailSet = 1; followPath(p, 25);
    };
    if (G.order === 'port' || needPort) {
      const home = nearestPort(p.x, p.z, G.welcome) || nearestPort(p.x, p.z);
      const P = G.order === 'port' && !needPort ? PORT_BY_ID[A.portGoal] || home : home;
      A.msg = needPort && G.order !== 'port' ? 'Heading to ' + P.name + ' to ' + (A.toPort ? 'sell the prize cargo' : p.hull < p.maxHull * 0.4 ? 'repair' : holdRoom() < 8 ? 'sell the cargo' : 'hire crew') : 'Sailing to ' + P.name;
      A.phase = 'port';
      sailFor(P, 'port:');
      return;
    }
    if (trading) {
      if (!A.trade) A.trade = planAtSea(p);
      const T = A.trade, P = PORT_BY_ID[T.dest];
      A.phase = 'trade'; G.selected = null;
      A.msg = T.good ? 'Trade run: ' + T.qty + ' ' + goodName(T.good) + ' for ' + P.name : holdUsed() ? 'Trade run: taking the cargo to ' + P.name : 'Trade run: sailing to ' + P.name + (T.next ? ' for ' + goodName(T.next) : '');
      sailFor(P, 'trade:');
      return;
    }
    A.pathFor = null;
    // hunting
    let t = A.target && A.target.alive && !A.target.looted && A.target.state !== 'sinking' ? A.target : null;
    if (!t || (G.t - A.t > 6 && A.phase === 'look')) {
      A.t = G.t;
      let best = null, bs = 0;
      for (const o of G.ships) { const sc = scoreTarget(p, o); if (sc > bs) { bs = sc; best = o; } }
      if (best && best !== t) { t = best; A.target = t; say('Sail ho! A ' + NATIONS[t.nation].adj + ' ' + t.C.name.toLowerCase() + ', the ' + t.name + '.', 'info'); }
    }
    if (!t) {
      A.phase = 'look'; A.msg = 'Looking for a prize';
      // patrol the trade lanes: a point on the line between two trading ports, not too far from here
      if (!p.path || p.wp >= p.path.length) {
        let best = null;
        for (let k = 0; k < 6; k++) { const a = pick(TRADERS), b = pick(TRADERS.filter(P => P !== a)), f = 0.3 + rnd() * 0.4, x = a.exit[0] + (b.exit[0] - a.exit[0]) * f, z = a.exit[1] + (b.exit[1] - a.exit[1]) * f, d = Math.hypot(x - p.x, z - p.z); if (isWater(x, z, -6) && (!best || d < best.d)) best = { x, z, d }; }
        if (best) G.setCourse(p, best.x, best.z); else { const a = rnd() * TAU; G.setCourse(p, 40 + Math.cos(a) * 240, 40 + Math.sin(a) * 200); }
      }
      p.sailSet = 1; followPath(p, 40);
      return;
    }
    G.selected = t;
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    const tc = t.crew / t.maxCrew, ts = t.sails / t.maxSails;
    if (t.state === 'struck' || (odds(p, t) > 0.72 && t.v < 2)) {
      A.phase = 'board'; A.msg = 'Coming alongside the ' + t.name;
      if (G.canBoard(p, t)) { G.board(p, t); return; }
      engage(p, t, 'board');
      return;
    }
    p.shot = ts > 0.55 ? 'chain' : tc > 0.6 ? 'grape' : 'round';
    A.phase = 'fight'; A.msg = 'Engaging the ' + t.name + ' with ' + SHOTS[p.shot].name.toLowerCase();
    engage(p, t);
    if (d > 200) { A.msg = 'Chasing the ' + t.name; }
  }

  // ---------------- player helm ----------------
  G.input = { left: 0, right: 0 };
  function playerHelm(dt) {
    const p = G.player;
    if (p.state === 'sinking' || p.state === 'docked') return;
    if (G.docking) { if (stepDocking(p, dt)) arrive(); return; }
    if (G.autopilot) return;
    const manual = G.input.right - G.input.left;
    if (manual !== 0) { p.rudder += (manual - p.rudder) * Math.min(1, dt * 4); p.path = null; G.course = null; return; }
    if (p.path && p.wp < p.path.length) { if (followPath(p, 18)) { p.path = null; G.course = null; if (G.autoDock) { G.autoDock = false; G.dock(); } } return; }
    p.rudder += (0 - p.rudder) * Math.min(1, dt * 3);
  }

  // ---------------- main step ----------------
  G.step = function (dt) {
    if (G.paused || G.loot && !G.autopilot) return;
    G.t += dt; G.phase = (G.phase + dt * G.daySpeed) % 1;
    stepWind(dt);
    stepMarkets(dt);
    ladder.step(dt);
    const P = G.player;
    for (const s of G.ships) { s.think -= dt; if (s.role !== 'player' && s.role !== 'lost' && s.think <= 0 && s.state !== 'boarding' && s.state !== 'sinking') { s.think = 0.35; if (s.role === 'consort') consortThink(s); else npcThink(s); } }
    if (G.autopilot && P.state !== 'sinking') { G.aiThink = (G.aiThink || 0) - dt; if (G.aiThink <= 0 || G.docking) { G.aiThink = 0.3; captain(dt * 0 + 0.3); } }
    playerHelm(dt);
    stepBoarding(dt);
    for (const s of G.ships) { physics(s, dt); }
    separate();
    stepBalls(dt);
    for (const s of [...G.ships]) checkStates(s, dt);
    for (const s of G.ships) place(s); // keep hulls, muzzles and lanterns in step with the simulation
    if (!G.attract) populate(dt); else populateAttract(dt);
    // player loss
    if (G.sinking && G.t - G.sinking.t > 7) {
      G.sinking = null;
      const half = Math.floor(G.gold / 2); G.gold -= half;
      for (const g of GOODS) G.cargo[g.id] = 0;
      G.stolen = {};
      G.dockPort = nearestPort(P.x, P.z, G.welcome) || PORTS[0];
      const m = G.moor({ T: TYPES.sloop });
      const n = spawn({ cls: 'sloop', nation: 'pirate', role: 'player', name: 'Second Chance', x: m.x, z: m.z, psi: 0, v: 0, sailSet: 0, seed: 3 });
      n.crew = Math.round(n.maxCrew * 0.7);
      if (P.alive) remove(P);
      G.player = n; applyColours(n);
      n.state = 'docked'; n.mesh.setFurled(true); G.docked = true; G.port = openPort(G.dockPort);
      say('You wash up in ' + G.dockPort.name + ' with half your gold (' + half + ' lost) and a free sloop.', 'bad');
      flash('Shipwrecked', 'Half your gold is gone. The governor lends you a sloop.', 6);
      emit('flagship', n); emit('dock', n);
    }
  };
  G.placeAll = () => { for (const s of G.ships) place(s); };

  // ---------------- saves ----------------
  // A career as plain data: everything that carries over (the flagship, purse, hold, upgrades, standing,
  // fame and rank, the time of day and weather, every market, and the random stream's exact position).
  // Traffic is not saved: the sea refills around you. You always resume moored in the port you saved at.
  G.snapshot = () => {
    const p = G.player;
    return {
      v: 1, game: 'black-tide', seed: G.seed, slot: G.slot, savedAt: Date.now(), // savedAt is for the menu only, never the sim
      t: G.t, phase: G.phase, weather: G.weather, weatherTarget: G.weatherTarget, nextWeather: G.nextWeather, windBase: G.windBase,
      gold: G.gold, cargo: { ...G.cargo }, fame: G.fame, prizes: G.prizes, rank: G.rank, standing: { ...G.standing }, upgrades: { ...G.upgrades },
      tradeProfit: G.tradeProfit, port: G.dockPort.id, rng: rnd.getState(),
      commission: G.commission && { ...G.commission }, brethren: G.brethren, stolen: { ...G.stolen }, ladder: ladder.snapshot(),
      markets: Object.fromEntries(Object.entries(G.markets).map(([id, m]) => [id, Object.fromEntries(Object.entries(m).map(([g, v]) => [g, { mod: v.mod, k: v.k }]))])),
      ship: { cls: p.cls, name: p.name, hull: p.hull, sails: p.sails, crew: p.crew, maxHull: p.maxHull, morale: p.morale, up: { ...p.up } },
      consorts: G.consorts().map(s => ({ cls: s.cls, name: s.name, nation: s.nation, hull: s.hull, sails: s.sails, crew: s.crew, maxHull: s.maxHull, up: { ...s.up } })),
    };
  };
  // throws on anything that is not a Black Tide save, before touching the game
  G.validate = d => {
    const ok = d && d.game === 'black-tide' && d.v === 1 && PORT_BY_ID[d.port] && CLASSES[d.ship && d.ship.cls] && Number.isFinite(d.gold) && Number.isFinite(d.t) && Number.isFinite(d.rng);
    if (!ok) throw new Error('That file is not a Black Tide save.');
    return d;
  };
  // slot: which save slot this career writes to from now on (decided by the caller before the 'dock' autosave)
  G.restore = (d, slot = d.slot ?? null) => {
    G.validate(d);
    for (const s of [...G.ships]) remove(s);
    G.balls.length = 0; fx.clear();
    Object.assign(G, {
      t: d.t, phase: d.phase, weather: d.weather, weatherTarget: d.weatherTarget, nextWeather: d.nextWeather, windBase: d.windBase,
      gold: d.gold, fame: d.fame, prizes: d.prizes, rank: d.rank, slot, tradeProfit: d.tradeProfit || 0,
      cargo: Object.fromEntries(GOODS.map(g => [g.id, d.cargo[g.id] || 0])), standing: { ...G.standing, ...d.standing },
      commission: d.commission ? { ...d.commission } : null, brethren: !!d.brethren, stolen: { ...(d.stolen || {}) },
      attract: false, autopilot: false, order: 'hunt', boarding: null, loot: null, sinking: null, docking: false, course: null, selected: null, banner: null, autoDock: false, spawnT: 0,
    });
    for (const id in d.markets) if (G.markets[id]) for (const g in d.markets[id]) if (G.markets[id][g]) Object.assign(G.markets[id][g], d.markets[id][g]);
    G.ai = { phase: 'look', target: null, msg: 'Looking for a prize', t: 0, portT: 0 };
    rnd.setState(d.rng);
    ladder.restore(d.ladder); ladder.rerank(true);
    const P = PORT_BY_ID[d.port]; G.dockPort = P;
    const m = G.moor({ T: TYPES[d.ship.cls] });
    const n = spawn({ id: 'player', cls: d.ship.cls, nation: 'pirate', role: 'player', name: d.ship.name, x: m.x, z: m.z, psi: 0, v: 0, sailSet: 0, seed: 3 });
    n.up = { hull: 0, sails: 0, guns: 0, ...(d.ship.up || d.upgrades) };
    n.maxHull = d.ship.maxHull || n.maxHull; n.hull = Math.min(n.maxHull, d.ship.hull); n.sails = Math.min(n.maxSails, d.ship.sails); n.crew = Math.min(n.maxCrew, d.ship.crew); n.morale = d.ship.morale ?? 1;
    n.state = 'docked'; n.mesh.setFurled(true); applyColours(n);
    G.player = n; G.docked = true; G.port = openPort(P);
    for (const c of d.consorts || []) { // consorts come back at anchor off the pier
      const s = spawn({ cls: c.cls, nation: c.nation || 'pirate', role: 'consort', name: c.name, x: P.x, z: P.moorZ + 34, psi: 0, v: 0, sailSet: 0 });
      const a = G.anchorFor(s); s.x = a.x; s.z = a.z;
      Object.assign(s, { hull: c.hull, sails: c.sails, crew: c.crew, maxHull: c.maxHull || s.maxHull, up: { hull: 0, sails: 0, guns: 0, ...c.up }, state: 'docked' });
      s.mesh.setFurled(true); applyColours(s);
    }
    say('Welcome back, captain. The ' + n.name + ' is moored at ' + P.name + '.', 'good');
    G.placeAll();
    emit('flagship', n); emit('dock', n); emit('restored', d);
  };

  // ---------------- attract mode: a staged first minute ----------------
  function populateAttract(dt) {
    G.spawnT = (G.spawnT || 0) - dt;
    if (G.spawnT > 0) return;
    G.spawnT = 5;
    const merchants = G.ships.filter(s => s.role === 'merchant' && s.alive && !s.looted && s.state !== 'sinking').length;
    if (merchants < 2) spawnTraffic('merchant');
    for (const s of [...G.ships]) if (!isFleet(s) && Math.hypot(s.x, s.z + 40) > 1150 && Math.hypot(s.x - G.player.x, s.z - G.player.z) > 420) remove(s);
  }
  G.setupAttract = () => {
    G.phase = 0.5; G.windBase = -Math.PI / 2; G.wind.from = -Math.PI / 2; // a southerly: the chase is a reach, the run home to port is downwind
    const p = spawn({ id: 'player', cls: 'brigantine', nation: 'pirate', role: 'player', name: 'Black Tide', x: 230, z: 262, psi: Math.PI + 0.12, v: 5, seed: 3, gold: 0 });
    p.crew = 74;
    G.player = p;
    const g = spawn({ id: 'galleon', cls: 'galleon', nation: 'spanish', role: 'merchant', name: 'Santa Rosa', x: -60, z: 335, psi: 0.05, v: 4, seed: 9, gold: 820, cargo: { silver: 18, sugar: 30 }, morale: 0.7, crewFrac: 0.8 });
    g.dest = [760, 300]; g.path = route(g.x, g.z, 760, 300); g.wp = 0;
    const e = spawn({ id: 'escort', cls: 'sloop', nation: 'english', role: 'merchant', name: 'Lark', x: -150, z: -40, psi: 0.1, v: 3, seed: 5, gold: 180, cargo: { rum: 14 } });
    const home = PORTS[0]; e.dest = [home.x, home.z]; e.path = route(e.x, e.z, home.x, home.z); e.wp = 0;
    const f = spawn({ id: 'fluyt', cls: 'fluyt', nation: 'dutch', role: 'merchant', name: 'Gouden Leeuw', x: 420, z: -330, psi: 2.4, v: 3, gold: 420, cargo: { cloth: 24, spices: 10 } });
    f.dest = [-760, 260]; f.path = route(f.x, f.z, -760, 260); f.wp = 0;
    G.ai.target = null; G.autopilot = true; G.attract = true; G.order = 'hunt';
    G.placeAll();
  };
  G.setupFree = () => { // a calm start without the trailer
    G.phase = 0.3;
    const p = spawn({ id: 'player', cls: 'sloop', nation: 'pirate', role: 'player', name: 'Black Tide', x: 40, z: 60, psi: 1.2, v: 3, seed: 3 });
    G.player = p; G.autopilot = false; G.attract = false;
    for (let i = 0; i < 5; i++) spawnTraffic('merchant');
    G.placeAll();
  };
  G.takeHelm = () => {
    if (!G.autopilot) return;
    G.autopilot = false;
    if (G.attract) { G.attract = false; G.nextWeather = 240; say('You have the helm. WASD to sail, Q/E to fire, Space to pause.', 'good'); }
    else say('You have the helm.', 'info');
    const p = G.player; if (!G.docking) { p.path = null; G.course = null; }
    G.ai.target = null;
  };
  G.handHelm = (order) => {
    const p = G.player, A = G.ai;
    G.order = order; G.autopilot = true; A.phase = 'look'; A.t = -99; A.pathFor = null; p.path = null;
    A.trade = null; A.sold = false; A.portT = 0;
    if (order === 'port') A.portGoal = (nearestPort(p.x, p.z, G.welcome) || nearestPort(p.x, p.z)).id;
    say(order === 'hunt' ? 'AI captain: hunting nearby prizes.' : order === 'trade' ? 'AI captain: on a trade run. Buy cheap, sell dear.' : 'AI captain: sailing to ' + PORT_BY_ID[A.portGoal].name + '.', 'info');
  };
  return G;
}
