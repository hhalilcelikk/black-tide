// The sea serpent: rises in storms (always in its own water, marked by a tavern rumour), circles a ship,
// rams her and dives, and comes up again somewhere else around her. Cannonballs that strike its back wound
// it; killing it pays a bounty and fame. Built in code from faceted segments, like everything else.
import * as THREE from 'three';
import { Geo, C, mat, roughen } from './geo.js';
import { mulberry32 } from './util.js';
import { S as DS } from './detail.js';

const N = 16, SC = 1.7, SPACING = 3.1 * SC, HP = 260; // SC: the whole beast is built at 1.7x its geometry
export const SERPENT_ZONE = { x: -270, z: 150, r: 150, name: 'west of Lantern Rock' };

function segmentGeo(seed, w, head) {
  const g = new Geo(seed, 0.04);
  g.surf(DS.ROCK, 0.6);
  const back = C('#2f5a52'), belly = C('#9fae86'), fin = C('#7a2e24');
  const body = roughen(new THREE.IcosahedronGeometry(1, 1), 0.12, seed);
  g.add(body, mat(0, 0, 0, 0, 0, 0, head ? 2.4 : 1.9, w * 0.9, w), back);
  g.add(roughen(new THREE.IcosahedronGeometry(1, 0), 0.1, seed + 1), mat(0, -w * 0.35, 0, 0, 0, 0, head ? 2.0 : 1.6, w * 0.5, w * 0.8), belly);
  if (head) {
    g.add(roughen(new THREE.IcosahedronGeometry(1, 0), 0.15, seed + 2), mat(2.2, -0.35, 0, 0, 0, -0.25, 1.5, 0.45, 0.9), back); // jaw
    for (const s of [-1, 1]) {
      g.add(new THREE.ConeGeometry(0.28, 1.6, 5), mat(-0.6, w * 0.8, s * 0.6, s * 0.5, 0, 0.9), C('#d9cfb0')); // horns
      g.add(new THREE.IcosahedronGeometry(0.22, 0), mat(1.3, w * 0.4, s * w * 0.75), C('#ffd24a')); // eyes
    }
  } else g.add(new THREE.ConeGeometry(w * 0.45, w * 1.3, 4), mat(0, w * 0.95, 0, 0, Math.PI / 4, 0, 1, 1, 0.35), fin);
  return g.build();
}

export function createSerpent({ scene, U, fx, G, api, seed }) {
  const srnd = mulberry32((seed ^ 0x5e4a) >>> 0);
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const material = U.enhance(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }), 'town');
  const segs = [];
  for (let i = 0; i < N; i++) {
    const w = i === 0 ? 1.5 : 1.6 * (1 - Math.pow(i / N, 1.6) * 0.75);
    const m = new THREE.Mesh(segmentGeo(31 + i, w, i === 0), material); m.castShadow = true; m.scale.setScalar(SC);
    group.add(m); segs.push({ m, w: w * SC, x: 0, y: -10, z: 0 });
  }
  const Sp = { state: 'hidden', hp: HP, t: 0, x: 0, z: 0, psi: 0, target: null, trail: [], kills: 0, known: false, phase: 0, angle: 0, dir: 1, sinceRam: 0, depth: 10 };
  G.serpent = Sp;

  const lay = () => { Sp.trail = []; for (let i = 0; i < N * 4; i++) Sp.trail.push([Sp.x - Math.cos(Sp.psi) * i * SPACING / 4, Sp.z + Math.sin(Sp.psi) * i * SPACING / 4]); };
  function rise(target, angle) {
    Sp.target = target; Sp.angle = angle; Sp.dir = srnd() < 0.5 ? -1 : 1;
    Sp.x = target.x + Math.cos(angle) * 70; Sp.z = target.z + Math.sin(angle) * 70; Sp.psi = Math.atan2(-(target.z - Sp.z), target.x - Sp.x) + Sp.dir * Math.PI / 2;
    lay(); Sp.state = 'rising'; Sp.t = 0; group.visible = true;
    fx.splash(new THREE.Vector3(Sp.x, 0, Sp.z), G.t, 2.2);
  }
  const inZone = s => Math.hypot(s.x - SERPENT_ZONE.x, s.z - SERPENT_ZONE.z) < SERPENT_ZONE.r;
  const farFromPorts = s => G.ports.every(P => Math.hypot(P.x - s.x, P.z - s.z) > 300);
  let check = 0;

  Sp.step = dt => {
    const P = G.player;
    if (Sp.state === 'hidden') {
      // its own water turns black when you sail into it; out there it only rises in a storm
      if (Sp.known && inZone(P) && !G.attract && G.weatherTarget < 1) { G.weatherTarget = 1; G.nextWeather = 240; api.say('The sky over the water ' + SERPENT_ZONE.name + ' turns black.', 'warn'); }
      check -= dt; if (check > 0) return; check = 4;
      const storm = G.weather > 0.55;
      if (!G.attract && storm && P.state !== 'docked' && farFromPorts(P) && (inZone(P) || srnd() < 0.06)) {
        Sp.hp = HP; rise(P, srnd() * Math.PI * 2);
        api.say('Something vast moves under the water…', 'warn'); api.flash('A sea serpent!', 'Broadsides to its back will wound it', 5); api.emit('serpent', Sp);
      }
      return;
    }
    const T = Sp.target;
    Sp.t += dt; Sp.phase += dt * 2.6;
    if (Sp.state === 'dead') { Sp.depth += dt * 1.6; if (Sp.depth > 12) { Sp.state = 'hidden'; group.visible = false; } return; }
    if (!T || !T.alive || T.state === 'sinking' || T.state === 'docked' || Math.hypot(T.x - Sp.x, T.z - Sp.z) > 600 || (G.weather < 0.3 && !inZone(T))) {
      if (Sp.state !== 'diving') { Sp.state = 'diving'; Sp.t = 0; Sp.leaving = true; }
    }
    let speed = 0, want = Sp.psi;
    if (Sp.state === 'rising') { Sp.depth = Math.max(0, 10 * (1 - Sp.t / 2.5)); speed = 6; if (Sp.t > 2.5) { Sp.state = 'circling'; Sp.t = 0; Sp.lap = 10 + srnd() * 6; } }
    if (Sp.state === 'circling') {
      Sp.depth = 0; speed = 9;
      Sp.angle += Sp.dir * dt * 9 / 45;
      const tx = T.x + Math.cos(Sp.angle) * 45, tz = T.z + Math.sin(Sp.angle) * 45;
      want = Math.atan2(-(tz - Sp.z), tx - Sp.x);
      if (Sp.t > Sp.lap) { Sp.state = 'ram'; Sp.t = 0; api.say('The serpent turns on the ' + T.name + '!', 'warn'); }
    }
    if (Sp.state === 'ram') {
      speed = 14; want = Math.atan2(-(T.z - Sp.z), T.x - Sp.x);
      if (Math.hypot(T.x - Sp.x, T.z - Sp.z) < T.T.L * 0.5 + 3) {
        T.hull -= 14; T.crew = Math.max(1, T.crew - 2); T.heel += 0.12 * (srnd() < 0.5 ? -1 : 1);
        fx.splash(new THREE.Vector3(Sp.x, 0, Sp.z), G.t, 2.6);
        api.say('The serpent rams the ' + T.name + '! Timbers split.', 'bad'); api.emit('hit', { s: T, x: Sp.x, z: Sp.z }); api.emit('ram', T);
        Sp.state = 'diving'; Sp.t = 0;
      } else if (Sp.t > 8) { Sp.state = 'diving'; Sp.t = 0; }
    }
    if (Sp.state === 'diving') {
      speed = 8; Sp.depth = Math.min(10, Sp.t * 5);
      if (Sp.t > (Sp.leaving ? 2 : 6)) {
        if (Sp.leaving) { Sp.state = 'hidden'; Sp.leaving = false; group.visible = false; api.say('The serpent is gone into the deep.', 'info'); return; }
        rise(T, Sp.angle + Math.PI * (0.6 + srnd() * 0.8));
      }
    }
    // swim: turn toward where it wants to go, lay down the trail the body follows
    const d = ((want - Sp.psi + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    Sp.psi += Math.max(-1.6 * dt, Math.min(1.6 * dt, d));
    Sp.x += Math.cos(Sp.psi) * speed * dt; Sp.z -= Math.sin(Sp.psi) * speed * dt;
    const last = Sp.trail[0];
    if (!last || Math.hypot(last[0] - Sp.x, last[1] - Sp.z) > SPACING / 4) { Sp.trail.unshift([Sp.x, Sp.z]); Sp.trail.length = Math.min(Sp.trail.length, N * 4 + 4); }
  };

  // segment positions: along the trail, arching in and out of the water
  Sp.place = () => {
    if (!group.visible) return;
    for (let i = 0; i < N; i++) {
      const s = segs[i], k = Math.min(Sp.trail.length - 1, i * 4), [x, z] = Sp.trail[k] || [Sp.x, Sp.z];
      const [nx, nz] = Sp.trail[Math.min(Sp.trail.length - 1, k + 2)] || [x - 1, z];
      const arch = i === 0 ? 1.6 : Math.sin(Sp.phase - i * 0.5) * 2.2 + 0.9; // fewer, taller humps
      s.x = x; s.z = z; s.y = arch - Sp.depth - (Sp.state === 'dead' ? i * 0.15 : 0);
      s.m.position.set(x, s.y, z);
      s.m.rotation.set(0, Math.atan2(-(z - nz), x - nx), i === 0 ? -0.15 : Math.cos(Sp.phase - i * 0.5) * 0.45);
    }
  };

  // a cannonball striking its back (the top of a surfaced segment) wounds it
  Sp.hitBall = (b, hullDamage) => {
    if (Sp.state === 'hidden' || Sp.state === 'dead' || Sp.depth > 2) return false;
    for (const s of segs) {
      if (s.y < -1.2) continue;
      const r = s.w * 1.5 + 0.4;
      if ((b.x - s.x) ** 2 + (b.z - s.z) ** 2 < r * r && b.y > s.y - 0.3 && b.y < s.y + s.w * 1.4) {
        Sp.hp -= hullDamage * 6;
        fx.splash(new THREE.Vector3(b.x, 0.5, b.z), G.t, 0.6);
        if (Sp.hp <= 0) {
          Sp.state = 'dead'; Sp.t = 0; Sp.kills++;
          api.kill(b.owner);
        } else if (Sp.state === 'circling' && srnd() < 0.15) { Sp.state = 'diving'; Sp.t = 0; } // wounded, it sounds
        api.emit('serpentHit', Sp);
        return true;
      }
    }
    return false;
  };

  // capture: pose it on the surface in a lazy arc
  Sp.stage = o => {
    Sp.x = o.x; Sp.z = o.z; Sp.psi = o.psi ?? 0; Sp.phase = o.phase ?? 1.2; Sp.depth = 0; Sp.state = 'circling';
    Sp.trail = [];
    for (let i = 0; i < N * 4 + 4; i++) { const a = Sp.psi + Math.PI - i * 0.025 * (o.curl ?? 1); const prev = Sp.trail[i - 1] || [Sp.x, Sp.z]; Sp.trail.push(i ? [prev[0] + Math.cos(a) * SPACING / 4, prev[1] - Math.sin(a) * SPACING / 4] : [Sp.x, Sp.z]); }
    group.visible = true; Sp.place();
  };
  // points on its surfaced back (for tests and for aiming)
  Sp.backs = () => Sp.depth > 2 || Sp.state === 'hidden' || Sp.state === 'dead' ? [] : segs.filter(s => s.y > -1.2).map(s => [s.x, s.y + s.w * 0.5, s.z]);
  Sp.hide = () => { group.visible = false; Sp.state = 'hidden'; };
  Sp.snapshot = () => ({ known: Sp.known, kills: Sp.kills, rng: srnd.getState() });
  Sp.restore = d => { if (!d) return; Sp.known = !!d.known; Sp.kills = d.kills || 0; if (Number.isFinite(d.rng)) srnd.setState(d.rng); Sp.hide(); };
  return Sp;
}
