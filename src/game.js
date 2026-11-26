// Black Tide simulation: wind, sailing, broadsides, boarding, ports, traffic and the AI captain.
// Fixed 1/60 s steps with a seeded random generator. Heading psi: 0 = east (+x), pi/2 = north (-z).
import * as THREE from 'three';
import { buildShip, CLASSES, TYPES, LIVERIES, NATIONS } from './ship.js';
import { waveHeight } from './waves.js';
import { groundAt, route, clearLine, isWater } from './nav.js';
import { mulberry32 } from './util.js';

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

export const PORT = { name: 'Port Rosalind', nation: 'english', x: -40, z: -48, r: 70, moorZ: -63.2 };
export const ISLANDS = [
  { name: 'Isla Rosalind', x: -60, z: -190 }, { name: 'Port Rosalind', x: -40, z: -108, port: true }, { name: 'Lantern Rock', x: -186, z: 70 },
  { name: 'Cayo Palma', x: 152, z: 44 }, { name: 'Gull Cay', x: 36, z: 170 }, { name: 'The Teeth', x: 94, z: -30 },
];
export const RIVALS = [
  ['Calico Ned Rourke', 'pirate'], ['Anne Mercer', 'english'], ['Jean-Baptiste Larue', 'french'], ['Diego Salas, el Cuervo', 'spanish'], ['Hendrik de Vries', 'dutch'],
  ['Mad Isabeau', 'pirate'], ['Silas Thorne', 'pirate'], ['Red Kate Doyle', 'pirate'], ['Tom Gallows', 'pirate'], ['Bartholomew Crane', 'english'],
  ['Lucas van Aert', 'dutch'], ['Mateo Ibarra', 'spanish'], ['Old Pew Harrow', 'pirate'], ['Josiah Blackwood', 'english'], ['Celeste Marchand', 'french'],
];
const NAMES = {
  spanish: ['Santa Rosa', 'San Felipe', 'La Concepción', 'Nuestra Señora del Mar', 'San Telmo', 'La Dorada'],
  english: ['Swallow', 'Kingfisher', 'Resolution', 'Hart', 'Lark', 'Greyhound'],
  french: ['Le Faucon', 'La Belle', "L'Hermine", 'Le Dauphin'], dutch: ['Gouden Leeuw', 'De Zeemeeuw', 'Witte Valk', 'Hoop'],
  pirate: ['Revenge', 'Black Gull', 'Merry Widow', 'Sea Wolf'],
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
    t: 0, phase: 0.6, daySpeed: 1 / 720, weather: 0, weatherTarget: 0, nextWeather: 300, paused: false, timeScale: 1,
    wind: { from: Math.PI / 2, speed: 1.0, gust: 0 }, windBase: Math.PI / 2,
    ships: [], balls: [], player: null, selected: null, log: [], banner: null,
    gold: 350, cargo: Object.fromEntries(GOODS.map(g => [g.id, 0])), fame: 0, prizes: 0, rank: null,
    autopilot: true, order: 'hunt', attract: true, docked: false, port: null,
    boarding: null, loot: null, course: null, sinking: null, standing: { english: 0, spanish: -10, french: 0, dutch: 0 },
    upgrades: { hull: 0, sails: 0, guns: 0 }, tutorial: true,
    on(ev, f) { (listeners[ev] || (listeners[ev] = [])).push(f); },
  };
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
      think: rnd() * 0.5, target: null, threat: null, threatT: -99, tack: 0, tackT: 0, struckT: 0, fires: [], sinkT: 0, hitT: -9, alive: true, aground: 0,
    };
    G.ships.push(s);
    return s;
  }
  G.spawn = spawn;
  function remove(s) {
    s.alive = false;
    scene.remove(s.mesh.group);
    s.mesh.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.isShaderMaterial && o.material.uniforms.tMap) o.material.dispose(); });
    const i = G.ships.indexOf(s); if (i >= 0) G.ships.splice(i, 1);
    if (G.selected === s) G.selected = null;
    for (const o of G.ships) { if (o.target === s) o.target = null; if (o.threat === s) o.threat = null; }
  }
  G.remove = remove;
  const hostile = (a, b) => {
    if (a === b || !b.alive) return false;
    if (a.role === 'player') return b.role !== 'player';
    if (b.role === 'player') return a.role === 'navy' ? true : a.role === 'pirate' ? true : (a.threat === b);
    if (a.role === 'pirate') return b.role !== 'pirate';
    if (b.role === 'pirate') return a.role === 'navy';
    return a.threat === b;
  };
  G.hostile = hostile;
  G.speedKn = s => s.v / KN;
  G.reloadTime = s => 6.2 / Math.min(1, Math.max(0.35, 0.3 + 0.8 * s.crew / s.maxCrew)) * (s.role === 'player' ? 1 / (1 + 0.1 * G.upgrades.guns) : s.role === 'merchant' ? 1.5 : 1);

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
    const up = s.role === 'player' ? 1 + 0.06 * G.upgrades.sails : 1;
    let target = C.knots * KN * up * polar(off, C) * s.sailAmt * Math.min(1.35, w.speed) * (0.3 + 0.7 * s.sails / s.maxSails);
    if (s.state === 'struck' || s.state === 'sinking' || s.state === 'docked') target = 0;
    if (s.state === 'boarding') target = Math.min(target, 0.6);
    const tau = 3 + C.hull / 70;
    s.v += (target - s.v) * (1 - Math.exp(-dt / tau));
    const rate = 0.3 * C.turn * Math.min(1, Math.max(s.tacking ? 0.6 : 0, 0.28 + s.v / 3.2)); // a ship in stays swings through on her headsails
    if (s.state !== 'docked' && s.state !== 'sinking') {
      s.psi = wrap(s.psi - s.rudder * rate * dt);
      // in irons the bows pay off on their own
      if (!s.tacking && off < (C.point - 4) * D2R && s.v < 2.2 && s.sailAmt > 0.2) s.psi = wrap(s.psi + (Math.sign(wrap(s.psi - w.from)) || 1) * 0.09 * dt);
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
    const shield = s.role === 'player' ? 1 / (1 + 0.1 * G.upgrades.hull) : 1;
    if (part === 'rig') { s.sails -= shot === 'chain' ? 5.2 * w : S.sails * 2 * w; s.crew -= shot === 'grape' ? S.crew * w : 0; s.hull -= S.hull * w * 0.2; }
    else { s.hull -= S.hull * w * shield; s.sails -= S.sails * w * 0.5; s.crew -= S.crew * w * (0.6 + rnd() * 0.8); }
    s.sails = Math.max(0, s.sails); s.crew = Math.max(0, s.crew);
    s.hitT = G.t;
    if (s.role !== 'player' && by && (!s.threat || s.threat === by)) { s.threat = by; s.threatT = G.t; }
    if (s.role !== 'player' && by.role === 'player' && s.nation !== 'pirate') G.standing[s.nation] = (G.standing[s.nation] || 0) - 0.4;
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
      if (s.role === 'player') { say('The ' + s.name + ' is going down!', 'bad'); G.sinking = { t: G.t }; }
      else {
        const by = s.threat;
        if (by && by.role === 'player') { const salvage = Math.round((s.gold || 100) * 0.25); G.gold += salvage; G.fame += 3; say('Sank the ' + s.name + '. Salvage: +' + salvage + ' gold', 'good'); flash(s.name + ' sinks', '+' + salvage + ' gold in salvage'); }
      }
      return;
    }
    if (s.role === 'player' || s.state === 'struck' || s.state === 'boarding') return;
    const h = s.hull / s.maxHull, c = s.crew / s.maxCrew, sl = s.sails / s.maxSails;
    const lim = s.role === 'merchant' ? [0.55, 0.55, 0.35] : s.role === 'pirate' ? [0.32, 0.32, 0.1] : [0.24, 0.26, 0.08];
    if (G.t - s.threatT < 40 && (h < lim[0] || c < lim[1] || sl < lim[2])) {
      s.state = 'struck'; s.sailSet = 0; s.struckT = G.t; s.mesh.setFlag('white'); s.flagKind = 'white';
      if (s.threat && s.threat.role === 'player') { say('The ' + s.name + ' strikes her colours!', 'good'); flash(s.name + ' strikes her colours', 'Come alongside and press B to board'); }
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
        b.state = 'struck'; b.mesh.setFlag(a.role === 'player' ? 'jolly' : 'white'); b.flagKind = 'captured';
        if (a.role === 'player') {
          const goods = Object.entries(b.cargo).filter(([, n]) => n > 0);
          G.loot = { ship: b, gold: b.gold, goods, lost: lossA, t: G.t };
          G.prizes++; G.fame += 8 + Math.round(b.gold / 40);
          updateRank();
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
      for (const [id, n] of L.goods) { const k = Math.min(n, room); G.cargo[id] += k; room -= k; b.cargo[id] -= k; }
      if (L.gold) flash('+' + L.gold + ' gold', 'Cargo taken from the ' + b.name, 4);
    }
    if (choice === 'ship' && CLASSES[b.cls].guns >= G.player.C.guns * 0.8) {
      const old = G.player;
      b.role = 'player'; b.nation = 'pirate'; b.crew = Math.max(12, Math.round(old.crew * 0.85)); b.morale = 1; b.state = 'sail'; b.sailSet = 1; b.mesh.setFlag('jolly'); b.flagKind = 'jolly';
      b.hull = Math.max(b.hull, b.maxHull * 0.5); b.sails = Math.max(b.sails, b.maxSails * 0.5);
      old.role = 'merchant'; old.nation = 'pirate'; old.state = 'sail'; old.crew = Math.max(6, Math.round(old.crew * 0.15)); old.dest = 'port'; old.prize = true;
      old.path = route(old.x, old.z, PORT.x, PORT.z - 10); old.wp = 0;
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
  const holdUsed = () => Object.values(G.cargo).reduce((a, b) => a + b, 0);
  const holdRoom = () => Math.max(0, Math.round(G.player.C.hold) - holdUsed());
  G.holdUsed = holdUsed; G.holdRoom = holdRoom;
  function updateRank() {
    if (G.prizes < 1) return;
    const r = Math.max(1, 50 - Math.floor(G.fame / 9));
    if (G.rank === null) { G.rank = r; say('You enter the Ladder of Famous Captains at #' + r + '.', 'good'); flash('Ladder of Famous Captains: #' + r, 'Title: Sea Rat', 5); }
    else if (r < G.rank) { G.rank = r; say('You climb the Ladder to #' + r + '.', 'good'); }
  }
  G.title = () => G.rank === null ? 'Nobody' : G.rank > 40 ? 'Sea Rat' : G.rank > 20 ? 'Freebooter' : G.rank > 5 ? 'Captain of Renown' : 'Legend of the Caribbean';

  // ---------------- port ----------------
  G.nearPort = s => Math.hypot(s.x - PORT.x, s.z - PORT.z) < PORT.r;
  G.moor = (s) => {
    const z = PORT.moorZ + s.T.B / 2 + 2.8;
    return { x: PORT.x, z, psi: 0 };
  };
  function stepDocking(s, dt) {
    const m = G.moor(s), d = Math.hypot(m.x - s.x, m.z - s.z);
    if (d > 9) {
      const want = headingTo(m.x - s.x, m.z - s.z);
      steerTo(s, d > 70 ? avoid(s, want) : want); s.sailSet = d > 40 ? 0.5 : 0.25;
      s.v = Math.min(s.v, 1.2 + d * 0.05);
      return false;
    }
    const k = 1 - Math.exp(-dt * 1.2);
    s.x += (m.x - s.x) * k; s.z += (m.z - s.z) * k; s.psi = wrap(s.psi + wrap(m.psi - s.psi) * k); s.v *= 0.9; s.sailSet = 0; s.rudder = 0; s.tacking = null;
    return d < 1.2 && Math.abs(wrap(m.psi - s.psi)) < 0.06;
  }
  G.dock = () => { const p = G.player; if (G.docked || G.docking || p.state === 'sinking') return false; if (!G.nearPort(p)) return false; G.docking = true; p.path = null; G.course = null; say('Making for the quay at ' + PORT.name + '.'); return true; };
  function arrive() {
    const p = G.player; G.docking = false; G.docked = true; p.state = 'docked'; p.v = 0; p.rudder = 0; p.mesh.setFurled(true);
    G.port = { screen: 'menu', t: G.t, prices: portPrices() };
    // sell everything automatically for the AI captain
    say('Docked at ' + PORT.name + '.', 'good');
    emit('dock', p);
  }
  G.leavePort = () => {
    const p = G.player; if (!G.docked) return;
    G.docked = false; G.port = null; p.state = 'sail'; p.mesh.setFurled(false); p.sailSet = 0.5; p.psi = -Math.PI / 2 + 0.25; p.v = 1.5;
    G.setCourse(p, PORT.x + 30, PORT.z + 110);
    emit('undock', p);
  };
  function portPrices() {
    const mod = { sugar: 0.8, rum: 0.9, tobacco: 1.25, cloth: 1.3, spices: 1.15, timber: 0.85, powder: 1.0, silver: 1.05 };
    return Object.fromEntries(GOODS.map(g => { const p = Math.round(g.base * mod[g.id] * (0.94 + rnd() * 0.12)); return [g.id, { buy: Math.round(p * 1.12), sell: p }]; }));
  }
  G.trade = (id, n) => { // n > 0 buy, n < 0 sell
    const P = G.port && G.port.prices[id]; if (!P) return;
    if (n > 0) { const k = Math.min(n, holdRoom(), Math.floor(G.gold / P.buy)); if (k <= 0) return; G.cargo[id] += k; G.gold -= k * P.buy; P.buy = Math.round(P.buy * (1 + 0.004 * k)); P.sell = Math.round(P.sell * (1 + 0.003 * k)); }
    else { const k = Math.min(-n, G.cargo[id]); if (k <= 0) return; G.cargo[id] -= k; G.gold += k * P.sell; P.sell = Math.max(1, Math.round(P.sell * (1 - 0.006 * k))); P.buy = Math.max(P.sell + 1, Math.round(P.buy * (1 - 0.004 * k))); }
    emit('coin', n);
  };
  G.sellAll = () => { let total = 0; for (const g of GOODS) { const n = G.cargo[g.id]; if (n > 0) { const before = G.gold; G.trade(g.id, -n); total += G.gold - before; } } return total; };
  G.repairCost = () => { const p = G.player; return Math.round((p.maxHull - p.hull) * 4 + (p.maxSails - p.sails) * 2.5); };
  G.repair = () => { const p = G.player, c = G.repairCost(); if (c <= 0 || G.gold < c) return false; G.gold -= c; p.hull = p.maxHull; p.sails = p.maxSails; for (const f of p.fires) f.grp.parent && f.grp.parent.remove(f.grp); fx.dropFires(p.fires); p.fires = []; say('Repaired the ' + p.name + ' for ' + c + ' gold.'); emit('coin', -c); return true; };
  G.hire = (n) => { const p = G.player; p.crew = Math.floor(p.crew); const k = Math.min(Math.floor(n), p.maxCrew - p.crew, Math.floor(G.gold / 6)); if (k <= 0) return false; G.gold -= 6 * k; p.crew += k; say('Signed on ' + k + ' hands.'); emit('coin', -6 * k); return true; };
  G.upgradeCost = k => [600, 1200, 2400][G.upgrades[k]] ?? null;
  G.upgrade = k => { const c = G.upgradeCost(k); if (c === null || G.gold < c) return false; G.gold -= c; G.upgrades[k]++; if (k === 'hull') { G.player.maxHull = Math.round(G.player.C.hull * (1 + 0.1 * G.upgrades.hull)); G.player.hull = G.player.maxHull; } say('Shipwright: ' + k + ' upgraded.'); emit('coin', -c); return true; };
  G.buyShip = (cls) => {
    const C = CLASSES[cls], p = G.player; if (!C.price) return false;
    const tradeIn = Math.round(CLASSES[p.cls].price * 0.5 * (p.hull / p.maxHull));
    if (G.gold + tradeIn < C.price || cls === p.cls) return false;
    G.gold = G.gold + tradeIn - C.price;
    const m = G.moor({ T: TYPES[cls] });
    const n = spawn({ cls, nation: 'pirate', role: 'player', name: p.name, x: m.x, z: m.z, psi: 0, v: 0, sailSet: 0, crewFrac: 0, seed: 3 });
    n.crew = Math.min(n.maxCrew, p.crew); n.state = 'docked'; n.mesh.setFurled(true);
    remove(p); G.player = n; G.upgrades = { hull: 0, sails: 0, guns: 0 };
    say('Bought a ' + C.name.toLowerCase() + ' (trade-in ' + tradeIn + ' gold).', 'good'); emit('flagship', n); emit('coin', -C.price);
    return true;
  };

  // ---------------- traffic ----------------
  const LANES = [
    [[-760, 230], [760, -140]], [[760, 260], [-760, 60]], [[-700, -420], [720, 330]], [[740, -380], [-720, 300]],
    [[620, 520], [PORT.x, PORT.z]], [[-620, 480], [PORT.x, PORT.z]], [[PORT.x, PORT.z], [760, 120]], [[PORT.x, PORT.z], [-760, 260]],
  ];
  function spawnTraffic(role, near) {
    let lane = pick(LANES);
    let [a, b] = lane;
    const cls = role === 'navy' ? pick(['frigate', 'frigate', 'sloop', 'schooner']) : role === 'pirate' ? pick(['sloop', 'schooner', 'brigantine']) : pick(['fluyt', 'galleon', 'galleon', 'fluyt', 'schooner', 'sloop']);
    const nation = role === 'pirate' ? 'pirate' : role === 'navy' ? pick(['english', 'english', 'spanish', 'french']) : cls === 'fluyt' ? 'dutch' : cls === 'galleon' ? 'spanish' : pick(['english', 'french', 'spanish', 'dutch']);
    let [x, z] = a;
    if (near) { x = near[0]; z = near[1]; }
    if (!isWater(x, z, -6)) { x = a[0]; z = a[1]; }
    const goods = {}; if (role === 'merchant') for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) { const g = pick(GOODS); goods[g.id] = (goods[g.id] || 0) + Math.round(rr(8, 26) * (cls === 'galleon' || cls === 'fluyt' ? 1.8 : 1)); }
    const gold = role === 'merchant' ? Math.round(cls === 'galleon' ? rr(600, 1300) : cls === 'fluyt' ? rr(350, 700) : rr(150, 360)) : Math.round(rr(80, 260));
    const s = spawn({ cls, nation, role, x, z, psi: headingTo(b[0] - x, b[1] - z), v: 3, gold, cargo: goods, morale: role === 'merchant' ? 0.7 : role === 'navy' ? 1.1 : 1 });
    s.dest = b; s.path = route(x, z, b[0], b[1]); s.wp = 0;
    return s;
  }
  G.spawnTraffic = spawnTraffic;
  function populate(dt) {
    G.spawnT = (G.spawnT || 0) - dt;
    if (G.spawnT > 0) return;
    G.spawnT = 4;
    const n = r => G.ships.filter(s => s.role === r && s.alive && s.state !== 'sinking').length;
    if (n('merchant') < 3) spawnTraffic('merchant');
    else if (n('navy') < 1 && G.t > 120) spawnTraffic('navy');
    else if (n('pirate') < 1 && G.t > 200) spawnTraffic('pirate');
    // drop ships that have left the chart
    for (const s of [...G.ships]) {
      if (s.role === 'player' || G.boarding && (G.boarding.a === s || G.boarding.b === s)) continue;
      const far = Math.hypot(s.x, s.z + 40) > 820, away = Math.hypot(s.x - G.player.x, s.z - G.player.z) > 420;
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
      if (followPath(s, 40)) { s.arrived = true; s.sailSet = 0.3; }
      return;
    }
    // navy and pirates hunt
    const range = s.role === 'navy' ? 300 : 280;
    let tgt = null;
    if (s.threat && s.threat.alive && s.threat.state !== 'sinking' && G.t - s.threatT < 90) tgt = s.threat;
    else if (foe && fd < range && (s.role === 'pirate' ? foe.role === 'merchant' || (foe.role === 'player' && foe.C.guns <= s.C.guns * 1.2) : foe.role === 'player' || foe.role === 'pirate')) tgt = foe;
    // navies chase a pirate that has been preying on their flag, or one that sails too close
    if (s.role === 'navy' && tgt === P && s.threat !== P && !((G.standing[s.nation] || 0) < -2 || fd < 170)) tgt = null;
    // the fort covers the harbour: hunters break off near Port Rosalind, and give up a long stern chase
    if (tgt && (Math.hypot(tgt.x - PORT.x, tgt.z - PORT.z) < 150 || Math.hypot(tgt.x - s.x, tgt.z - s.z) > range * 1.35)) { if (s.threat === tgt) s.threat = null; tgt = null; }
    if (tgt && tgt.state !== 'docked') {
      s.state = 'engage'; s.target = tgt; s.shot = 'round';
      if (s.role === 'pirate' && tgt.state === 'struck') { if (G.canBoard(s, tgt)) G.board(s, tgt); else engage(s, tgt, 'board'); }
      else engage(s, tgt);
      return;
    }
    s.state = 'sail'; s.sailSet = 0.8; s.target = null;
    if (followPath(s, 40)) { s.arrived = true; }
  }

  // ---------------- AI captain ----------------
  G.ai = { phase: 'look', target: null, msg: 'Looking for a prize', t: 0, portT: 0 };
  function scoreTarget(p, o) {
    if (!o.alive || o.role === 'player' || o.state === 'sinking' || o.looted || o.prize || o.state === 'docked') return -1;
    if (o.role === 'navy' && o.C.guns > p.C.guns * 0.9) return -1;
    if (o.C.guns * (o.role === 'merchant' ? 0.55 : 1) > p.C.guns * (0.6 + 0.6 * p.hull / p.maxHull)) return -1; // too heavy a broadside for us today
    const d = Math.hypot(o.x - p.x, o.z - p.z); if (d > 700) return -1;
    const od = odds(p, { ...o, crew: o.crew * 0.55, state: 'struck' });
    if (od < 0.55) return -1;
    const value = (o.gold || 50) + Object.values(o.cargo || {}).reduce((a, b) => a + b, 0) * 25;
    return value * od / (80 + d);
  }
  function captain(dt) {
    const p = G.player, A = G.ai;
    if (G.docked) {
      A.portT += dt;
      if (G.attract || G.order === 'hunt') {
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
    let danger = null, dd = 320;
    for (const o of G.ships) {
      if (!o.alive || o.state !== 'engage' || o.target !== p || (o.role !== 'navy' && o.role !== 'pirate') || o.C.guns <= p.C.guns * 0.9) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < dd) { dd = d; danger = o; }
    }
    if (danger) {
      A.phase = 'flee'; A.msg = 'Running from the ' + danger.name; A.pathFor = null; p.path = null; G.selected = danger;
      if (Math.hypot(p.x - PORT.x, p.z - PORT.z) < 60) { G.dock(); return; }
      const away = headingTo(p.x - danger.x, p.z - danger.z), home = headingTo(PORT.x - p.x, PORT.z - p.z);
      const want = Math.abs(wrap(home - away)) < 1.1 ? home : wrap(away + wrap(G.wind.from + Math.PI - away) * 0.3);
      p.sailSet = 1; p.shot = 'chain';
      steerTo(p, avoid(p, sailable(p, want)));
      for (const side of [-1, 1]) if (p.reload[side] <= 0 && inArc(p, danger, side) && dd < SHOTS[p.shot].range) fire(p, side, danger);
      return;
    }
    const warships = G.ships.some(o => o.alive && (o.role === 'navy' || o.role === 'pirate') && o.state === 'engage' && o.target === p && Math.hypot(o.x - p.x, o.z - p.z) < 260);
    const needPort = p.hull < p.maxHull * (warships ? 0.6 : 0.45) || holdRoom() < 8 || p.crew < p.maxCrew * 0.35 || A.toPort;
    if (G.order === 'port' || needPort) {
      A.msg = needPort && G.order !== 'port' ? 'Heading to port to ' + (A.toPort ? 'sell the prize cargo' : p.hull < p.maxHull * 0.4 ? 'repair' : holdRoom() < 8 ? 'sell the cargo' : 'hire crew') : 'Sailing to ' + PORT.name;
      A.phase = 'port';
      if (G.nearPort(p) && Math.hypot(p.x - PORT.x, p.z - PORT.z) < 60) { G.dock(); return; }
      if (!p.path || A.pathFor !== 'port') { G.setCourse(p, PORT.x + 10, PORT.z + 6); A.pathFor = 'port'; }
      p.sailSet = 1; followPath(p, 25);
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
      // patrol the lanes off the port
      if (!p.path || p.wp >= p.path.length) { const a = rnd() * TAU; G.setCourse(p, 40 + Math.cos(a) * 240, 40 + Math.sin(a) * 200); }
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
    const P = G.player;
    for (const s of G.ships) { s.think -= dt; if (s.role !== 'player' && s.think <= 0 && s.state !== 'boarding' && s.state !== 'sinking') { s.think = 0.35; npcThink(s); } }
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
      const m = G.moor({ T: TYPES.sloop });
      const n = spawn({ cls: 'sloop', nation: 'pirate', role: 'player', name: 'Second Chance', x: m.x, z: m.z, psi: 0, v: 0, sailSet: 0, seed: 3 });
      n.crew = Math.round(n.maxCrew * 0.7);
      if (P.alive) remove(P);
      G.player = n; G.upgrades = { hull: 0, sails: 0, guns: 0 };
      n.state = 'docked'; n.mesh.setFurled(true); G.docked = true; G.port = { screen: 'menu', t: G.t, prices: portPrices() };
      say('You wash up in ' + PORT.name + ' with half your gold (' + half + ' lost) and a free sloop.', 'bad');
      flash('Shipwrecked', 'Half your gold is gone. The governor lends you a sloop.', 6);
      emit('flagship', n); emit('dock', n);
    }
  };
  G.placeAll = () => { for (const s of G.ships) place(s); };

  // ---------------- attract mode: a staged first minute ----------------
  function populateAttract(dt) {
    G.spawnT = (G.spawnT || 0) - dt;
    if (G.spawnT > 0) return;
    G.spawnT = 5;
    const merchants = G.ships.filter(s => s.role === 'merchant' && s.alive && !s.looted && s.state !== 'sinking').length;
    if (merchants < 2) spawnTraffic('merchant');
    for (const s of [...G.ships]) if (s.role !== 'player' && Math.hypot(s.x, s.z + 40) > 820 && Math.hypot(s.x - G.player.x, s.z - G.player.z) > 420) remove(s);
  }
  G.setupAttract = () => {
    G.phase = 0.5; G.windBase = -Math.PI / 2; G.wind.from = -Math.PI / 2; // a southerly: the chase is a reach, the run home to port is downwind
    const p = spawn({ id: 'player', cls: 'brigantine', nation: 'pirate', role: 'player', name: 'Black Tide', x: 230, z: 262, psi: Math.PI + 0.12, v: 5, seed: 3, gold: 0 });
    p.crew = 74;
    G.player = p;
    const g = spawn({ id: 'galleon', cls: 'galleon', nation: 'spanish', role: 'merchant', name: 'Santa Rosa', x: -60, z: 335, psi: 0.05, v: 4, seed: 9, gold: 820, cargo: { silver: 18, sugar: 30 }, morale: 0.7, crewFrac: 0.8 });
    g.dest = [760, 300]; g.path = route(g.x, g.z, 760, 300); g.wp = 0;
    const e = spawn({ id: 'escort', cls: 'sloop', nation: 'english', role: 'merchant', name: 'Lark', x: -150, z: -40, psi: 0.1, v: 3, seed: 5, gold: 180, cargo: { rum: 14 } });
    e.dest = [PORT.x, PORT.z]; e.path = route(e.x, e.z, PORT.x, PORT.z); e.wp = 0;
    const f = spawn({ id: 'fluyt', cls: 'fluyt', nation: 'dutch', role: 'merchant', name: 'Gouden Leeuw', x: 420, z: -330, psi: 2.4, v: 3, gold: 420, cargo: { cloth: 24, spices: 10 } });
    f.dest = [-760, 260]; f.path = route(f.x, f.z, -760, 260); f.wp = 0;
    G.ai.target = null; G.autopilot = true; G.attract = true; G.order = 'hunt';
    G.placeAll();
  };
  G.setupFree = () => { // a calm start without the trailer
    G.phase = 0.3;
    const p = spawn({ id: 'player', cls: 'sloop', nation: 'pirate', role: 'player', name: 'Black Tide', x: 40, z: 60, psi: 1.2, v: 3, seed: 3 });
    G.player = p; G.autopilot = false; G.attract = false;
    for (let i = 0; i < 3; i++) spawnTraffic('merchant');
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
    G.order = order; G.autopilot = true; G.ai.phase = 'look'; G.ai.t = -99; G.ai.pathFor = null; G.player.path = null;
    say(order === 'hunt' ? 'AI captain: hunting nearby prizes.' : 'AI captain: sailing to ' + PORT.name + '.', 'info');
  };
  return G;
}
