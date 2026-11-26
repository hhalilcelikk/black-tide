// The Ladder of Famous Captains: fifty named rivals ranked by fame, with you among them once you are known.
// The top twenty are at sea. Each has a ship, a flag and a fighting style, and sails the lanes between the
// ports on the chart. When one comes within sight of you they become a real ship. Beat a ranked rival
// (sink, capture, or make them strike) to take their place. Rivals raid merchants off-screen and climb
// back, so the ladder never stops moving. All of it runs on its own seeded stream, saved with the career.
import { mulberry32 } from './util.js';
import { PORTS } from './ports.js';

export const ROSTER = [
  ['Calico Ned Rourke', 'pirate'], ['Anne Mercer', 'english'], ['Jean-Baptiste Larue', 'french'], ['Diego Salas, el Cuervo', 'spanish'], ['Hendrik de Vries', 'dutch'],
  ['Mad Isabeau', 'pirate'], ['Silas Thorne', 'pirate'], ['Red Kate Doyle', 'pirate'], ['Tom Gallows', 'pirate'], ['Bartholomew Crane', 'english'],
  ['Lucas van Aert', 'dutch'], ['Mateo Ibarra', 'spanish'], ['Old Pew Harrow', 'pirate'], ['Josiah Blackwood', 'english'], ['Celeste Marchand', 'french'],
  ['Jonah Fenwick', 'pirate'], ['Inés de la Vega', 'spanish'], ['Pieter Kool', 'dutch'], ['Mercy Hale', 'english'], ['Gaspard Roux', 'french'],
  ['Long Ben Tully', 'pirate'], ['Sebastián Ortega', 'spanish'], ['Willem Brandt', 'dutch'], ['Hester Quinn', 'pirate'], ['Ambrose Pike', 'english'],
  ['Luc Delacroix', 'french'], ['Scurvy Joe Mallow', 'pirate'], ['Rafael Moreno', 'spanish'], ['Jan Visser', 'dutch'], ['Nell Carver', 'pirate'],
  ['Edmund Swale', 'english'], ['Antoine Ferrand', 'french'], ['One-Eyed Sal', 'pirate'], ['Tomás Arriaga', 'spanish'], ['Klaas Hoek', 'dutch'],
  ['Barnaby Rook', 'pirate'], ['Thomas Lyle', 'english'], ['Rémy Dufort', 'french'], ['Bess Morrow', 'pirate'], ['Álvaro Cruz', 'spanish'],
  ['Joris Smit', 'dutch'], ['Ned Pickering', 'pirate'], ['Walter Haines', 'english'], ['Yves Kerbrat', 'french'], ['Patch Malone', 'pirate'],
  ['Lope Herrera', 'spanish'], ['Daan Mulder', 'dutch'], ['Kit Hollis', 'pirate'], ['Samuel Dyer', 'english'], ['Martin Bastide', 'french'],
];
// fighting styles: raiders take merchants and avoid a fair fight, gunners stand off with round shot, boarders close with grape
export const STYLES = {
  raider: { label: 'a raider who runs from a fair fight', shot: 'chain', duel: 0.8 },
  gunner: { label: 'a gunner who fights at long range', shot: 'round', duel: 1.2 },
  boarder: { label: 'a boarder who closes with grape shot', shot: 'grape', duel: 1.5 },
};
// a title for every ten places, and the reward the first time you reach it
export const TITLES = [
  { upTo: 1, name: 'Legend of the Caribbean', gold: 5000 }, { upTo: 10, name: 'Scourge of the Main', gold: 2500 },
  { upTo: 20, name: 'Captain of Renown', gold: 1200 }, { upTo: 30, name: 'Buccaneer', gold: 600 },
  { upTo: 40, name: 'Freebooter', gold: 300 }, { upTo: 50, name: 'Sea Rat', gold: 100 },
];
export const titleFor = rank => rank === null ? 'Nobody' : (TITLES.find(t => rank <= t.upTo) || TITLES[TITLES.length - 1]).name;
const fameAt = r => Math.round(20 + 1880 * Math.pow((50 - r) / 49, 2.2)); // #50 has 20 fame, #1 has 1900
const SAILING = 20, SPAWN_IN = 420, SPAWN_OUT = 650, MAX_LIVE = 2;

export function createLadder(G, api, seed) {
  const lrnd = mulberry32((seed ^ 0x1add3) >>> 0);
  const styles = Object.keys(STYLES);
  const clsFor = r => r < 5 ? ['frigate', 'brigantine'][r % 2] : r < 12 ? ['brigantine', 'schooner'][r % 2] : ['schooner', 'sloop'][r % 2];
  const L = {
    rivals: ROSTER.map(([name, nation], i) => {
      const P = PORTS[(i * 3) % PORTS.length];
      return { id: 'r' + i, name, nation, fame: fameAt(i + 1), cls: clsFor(i), style: styles[i % 3], x: P.exit[0] + ((i * 37) % 120) - 60, z: P.exit[1] + ((i * 53) % 120), dest: null, lurk: null, beatenT: -1e9, ship: null };
    }),
    sightings: [], best: null, t: 0,
  };
  G.ladder = L;
  const byId = id => L.rivals.find(r => r.id === id);
  L.byId = byId;

  // everyone ranked by fame; you appear once your fame passes the fiftieth captain's
  L.table = () => {
    const rows = L.rivals.map(r => ({ r, fame: r.fame }));
    if (G.prizes > 0 || G.fame > 0) rows.push({ you: true, fame: G.fame });
    rows.sort((a, b) => b.fame - a.fame || (a.you ? -1 : 1));
    return rows.slice(0, 50);
  };
  L.rankOf = r => { const i = L.table().findIndex(x => x.r === r); return i < 0 ? null : i + 1; };
  const top20 = () => L.table().filter(x => x.r).slice(0, 20).map(x => x.r);
  L.top20 = top20;

  function rerank(quiet) {
    const i = L.table().findIndex(x => x.you), rank = i < 0 ? null : i + 1;
    const was = G.rank;
    G.rank = rank;
    if (quiet || rank === was || rank === null) return;
    if (was === null) { api.say('You enter the Ladder of Famous Captains at #' + rank + '.', 'good'); api.flash('Ladder of Famous Captains: #' + rank, 'Title: ' + titleFor(rank), 5); }
    else if (rank < was) api.say('You climb the Ladder to #' + rank + '.', 'good');
    else api.say('Rivals pass you on the Ladder: you fall to #' + rank + '.', 'warn');
    // a new title, rewarded the first time
    // every bracket of ten passed pays its reward once, even when one victory jumps several
    const ti = TITLES.findIndex(t => rank <= t.upTo);
    if (ti >= 0 && (L.best === null || ti < L.best)) {
      let paid = 0;
      for (let k = (L.best === null ? TITLES.length : L.best) - 1; k >= ti; k--) paid += TITLES[k].gold;
      const T = TITLES[ti]; L.best = ti; G.gold += paid;
      api.flash('Title: ' + T.name, '#' + rank + ' on the Ladder · +' + paid + ' gold', 5);
      api.say('Your new title, ' + T.name + ', earns ' + paid + ' gold from the harbour boards.', 'good');
      api.emit('title', { rank, title: T.name, gold: paid });
    }
  }
  L.rerank = rerank;

  // you beat a ranked rival: you take their place and they fall
  L.beat = (id, how) => {
    const r = byId(id); if (!r || G.t - r.beatenT < 120) return;
    const theirs = L.rankOf(r), ours = G.rank;
    r.beatenT = G.t;
    if (theirs !== null && (ours === null || theirs < ours)) G.fame = Math.max(G.fame, r.fame + 1);
    else G.fame += 10;
    r.fame = Math.round(r.fame * 0.65);
    rerank(false); // announces the climb and pays every title bracket passed
    api.say('You ' + how + ' ' + r.name + (theirs ? ' (#' + theirs + ')' : '') + '. Their place on the Ladder is yours: #' + G.rank + '.', 'good');
    api.flash('#' + G.rank + ' on the Ladder', 'You took ' + r.name + '’s place', 5);
    api.emit('rivalBeaten', { id, rank: G.rank, theirs });
    rerank(false);
  };

  // where a rival goes next: another port's approaches
  const nextDest = r => { const P = PORTS[Math.floor(lrnd() * PORTS.length)]; r.dest = [P.exit[0] + (lrnd() - 0.5) * 160, P.exit[1] + lrnd() * 120]; };

  L.step = dt => {
    L.t += dt; if (L.t < 2) return;
    const tick = L.t; L.t = 0;
    const p = G.player, live = L.rivals.filter(r => r.ship && r.ship.alive);
    // the top twenty sail the chart; a ship that is in sight carries its rival's position with it
    for (const r of top20()) {
      if (r.ship && r.ship.alive) { r.x = r.ship.x; r.z = r.ship.z; continue; }
      r.ship = null;
      if (r.lurk && G.t < r.lurk.until) { // a rumoured rival loiters where they were seen
        if (!r.dest || Math.hypot(r.dest[0] - r.x, r.dest[1] - r.z) < 20) r.dest = [r.lurk.x + (lrnd() - 0.5) * 220, r.lurk.z + (lrnd() - 0.5) * 220];
      } else if (!r.dest || Math.hypot(r.dest[0] - r.x, r.dest[1] - r.z) < 30) nextDest(r);
      const d = Math.hypot(r.dest[0] - r.x, r.dest[1] - r.z), step = Math.min(d, 4.2 * tick);
      r.x += (r.dest[0] - r.x) / (d || 1) * step; r.z += (r.dest[1] - r.z) / (d || 1) * step;
      // within sight: put the ship in the water (never during the trailer, at most two at a time)
      const lurking = r.lurk && G.t < r.lurk.until; // a rumoured rival always gets a ship: you came looking for them
      if (!G.attract && live.length < MAX_LIVE + (lurking ? 1 : 0) && G.t - r.beatenT > 300 && Math.hypot(r.x - p.x, r.z - p.z) < SPAWN_IN && api.isWater(r.x, r.z)) {
        r.ship = api.spawnRival(r); live.push(r);
        L.sightings = L.sightings.filter(s => s.id !== r.id); // in sight now: the chart mark has done its job
      }
    }
    // out of sight again: back to the chart
    for (const r of live) if (r.ship && r.ship.alive && Math.hypot(r.ship.x - p.x, r.ship.z - p.z) > SPAWN_OUT && r.ship.state !== 'struck' && !(G.boarding && (G.boarding.b === r.ship))) {
      r.x = r.ship.x; r.z = r.ship.z; api.remove(r.ship); r.ship = null;
    }
    // off-screen raids: about one rival in three wins a fight every minute
    L.raidT = (L.raidT || 0) + tick;
    if (L.raidT >= 60) {
      L.raidT -= 60;
      for (const r of L.rivals) { if (r.ship && !r.ship.alive) r.ship = null; if (!r.ship && lrnd() < 0.35) r.fame += Math.round(3 + r.fame * 0.02 * lrnd()); }
      rerank(false);
    }
    L.sightings = L.sightings.filter(s => G.t < s.until);
  };

  // a tavern rumour: where a top-twenty rival was last seen; they linger there for ten minutes
  L.rumour = (pickSeed) => {
    const pick = mulberry32(pickSeed >>> 0);
    const pool = top20().filter(r => !r.ship && G.t - r.beatenT > 300);
    if (!pool.length) return null;
    const r = pool[Math.floor(pick() * pool.length)];
    r.lurk = { x: r.x, z: r.z, until: G.t + 600 };
    if (!L.sightings.some(s => s.id === r.id)) L.sightings.push({ id: r.id, x: r.x, z: r.z, until: G.t + 600 });
    return r;
  };

  L.snapshot = () => ({ rng: lrnd.getState(), best: L.best, raidT: L.raidT || 0, sightings: L.sightings.map(s => ({ ...s })), rivals: L.rivals.map(r => ({ id: r.id, fame: r.fame, x: r.x, z: r.z, dest: r.dest, lurk: r.lurk, beatenT: r.beatenT })) });
  L.restore = d => {
    if (!d) return;
    lrnd.setState(d.rng); L.best = d.best ?? null; L.raidT = d.raidT || 0; L.sightings = (d.sightings || []).map(s => ({ ...s })); L.t = 0;
    for (const s of d.rivals || []) { const r = byId(s.id); if (r) Object.assign(r, { fame: s.fame, x: s.x, z: s.z, dest: s.dest, lurk: s.lurk, beatenT: s.beatenT, ship: null }); }
  };
  return L;
}
