// The five ports: who owns them, how their towns are laid out, and what their markets make and need.
// world.js builds the towns from this, game.js runs the harbours and markets, hud.js shows them.
// Every harbour faces south: the pier runs south (+z) from the shore at dock.x and ships moor along its head.
import { heightAt } from './world.js';

// town styles: walls, roofs, house heights and how many windows glow at night
export const STYLES = {
  // flag: the fort's colours
  english: { flag: 'stgeorge', walls: ['#f1e3c2', '#e9c88e', '#e8b7a0', '#b8d3c9', '#dca660', '#f3ebd8', '#c5d6e0', '#e6d27a'], roofs: ['#b4533a', '#a2452f', '#c46a48', '#8f3f2e', '#b65c3c'], tall: 0.35, glow: 0.55 },
  spanish: { flag: 'burgundy', walls: ['#f4ecdc', '#efe2c4', '#e8cf9c', '#f1d9b0', '#f6f0e4', '#e2c08a'], roofs: ['#c0573a', '#b4533a', '#cc6a44', '#b8603e'], tall: 0.25, glow: 0.5 },
  french: { flag: 'fleur', walls: ['#e9e4d8', '#d8e0e6', '#efdcc4', '#c9d6dc', '#e6d9c2', '#d2c4a8'], roofs: ['#5c6670', '#4f5862', '#6b7380', '#58606b'], tall: 0.45, glow: 0.55 },
  dutch: { flag: 'prinsen', walls: ['#a2523c', '#b56548', '#8f4a37', '#c9b18c', '#9c5a40', '#d8c7a0'], roofs: ['#3d3a38', '#7a3b2a', '#55403a', '#4a4442'], tall: 0.6, glow: 0.6 },
  pirate: { flag: 'jolly', walls: ['#8c7458', '#7a6650', '#9b8466', '#6f5f4c', '#a08b6a'], roofs: ['#9c8a5c', '#6f5a48', '#8a6a42', '#5e5040'], tall: 0.05, glow: 0.7 },
};

const DEFS = [
  {
    id: 'rosalind', name: 'Port Rosalind', nation: 'english', island: 'Isla Rosalind', governor: 'Governor Ashby',
    blurb: 'English colony on Isla Rosalind', dock: { x: -40, zIn: -125 },
    makes: ['sugar', 'rum', 'timber'], needs: ['cloth', 'tobacco', 'spices'],
    harbour: 'Gulls on the warehouses, tar on the air. A clerk with a ledger waits at the foot of the pier.',
    govLine: '“Letters of marque are for captains with a name. Come back when the harbour board knows yours.”',
    tavern: 'The Drowned Lantern', tavernLine: 'Low beams, loud dice, a fiddler who knows four tunes. Every one of them is a shanty.',
  },
  {
    id: 'catalina', name: 'Santa Catalina', nation: 'spanish', island: 'Isla Catalina', governor: 'Don Esteban Ruiz',
    blurb: 'Spanish silver port on Isla Catalina', dock: { x: -560, zIn: 360 },
    makes: ['silver', 'tobacco', 'sugar'], needs: ['cloth', 'rum', 'powder'],
    harbour: 'White walls, a bell that never rests, and a customs officer who counts every barrel twice.',
    govLine: '“His Majesty’s silver sails under His Majesty’s guns. Remember that, capitán.”',
    tavern: 'La Sirena', tavernLine: 'Cool tiles, sour wine and guitar. The talk is all of silver and who is stealing it.',
    town: { x: [-62, 34], z: [-46, -4], houses: 22, church: [-28, -30], lamps: [-32, 16] },
    fort: [-494, 410], isle: { x0: -730, x1: -450, z0: 245, z1: 545 }, seed: 21,
  },
  {
    id: 'lys', name: 'Port Lys', nation: 'french', island: 'Île de Lys', governor: 'Madame de Valcourt',
    blurb: 'French colony on the Île de Lys', dock: { x: 618, zIn: 0 },
    makes: ['cloth', 'powder'], needs: ['sugar', 'timber', 'silver'],
    harbour: 'Fishing boats painted blue and gold, and a quay swept twice a day by order of the governor.',
    govLine: '“France pays well for captains who trouble Spain. Quietly, of course.”',
    tavern: 'Le Chat Noir', tavernLine: 'Smoke, cards and an accordion. Half the room are smugglers and the other half pretend not to know.',
    town: { x: [-30, 62], z: [-44, -4], houses: 20, church: [30, -32], lamps: [-14, 30] },
    fort: [556, 48], isle: { x0: 510, x1: 750, z0: -160, z1: 95 }, seed: 31,
  },
  {
    id: 'vlieg', name: 'Vlieghaven', nation: 'dutch', island: 'Meeuweneiland', governor: 'Governor Joost Verbeek',
    blurb: 'Dutch trading post on Meeuweneiland', dock: { x: 398, zIn: -560 },
    makes: ['spices', 'cloth'], needs: ['sugar', 'tobacco', 'timber'],
    harbour: 'Tall narrow warehouses, a crane on the quay and clerks who weigh everything, even the gulls.',
    govLine: '“The Company does not care what flag you fly, only what you carry.”',
    tavern: 'De Gouden Haring', tavernLine: 'Gin, pipes and long tables. Every merchant here knows every price in the Caribbean.',
    town: { x: [-62, 30], z: [-48, -4], houses: 22, church: [-30, -34], lamps: [-30, 18] },
    fort: [470, -530], isle: { x0: 280, x1: 510, z0: -685, z1: -480 }, seed: 41,
  },
  {
    id: 'cove', name: "Hangman's Cove", nation: 'pirate', island: 'Isla Calavera', governor: 'Mother Quill',
    blurb: 'Pirate haven on Isla Calavera', dock: { x: -604, zIn: -530 },
    makes: ['rum'], needs: ['powder', 'spices', 'silver'],
    harbour: 'Patched sails, loud boots on loose planks, and nobody asks where your cargo came from.',
    govLine: '“No flags, no papers, no questions. Pay the cove its share and you are welcome.”',
    tavern: 'The Hanged Man', tavernLine: 'A tavern with no door, a cook with one eye and the best rum on the sea.',
    town: { x: [-50, 30], z: [-40, -4], houses: 16, church: null, lamps: [-24] },
    fort: [-524, -484], isle: { x0: -730, x1: -440, z0: -640, z1: -440 }, seed: 51,
  },
];

// The pier runs 30 m south from the shoreline at dock.x. Ships moor along its head (moorZ),
// and the harbour (x, z) is the open water the docking radius r is measured from.
export const PORTS = DEFS.map(d => {
  let zs = d.dock.zIn;
  while (zs < d.dock.zIn + 85 && heightAt(d.dock.x, zs) > 0.15) zs += 0.5;
  const moorZ = zs + 32.3, x = d.dock.x, z = moorZ + 15.2;
  return { ...d, style: STYLES[d.nation], zShore: zs, moorZ, x, z, r: 70, exit: [x + 30, z + 110] };
});
export const PORT_BY_ID = Object.fromEntries(PORTS.map(p => [p.id, p]));
export const nearestPort = (x, z, ok = () => true) => {
  let best = null, bd = Infinity;
  for (const p of PORTS) { if (!ok(p)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
  return best;
};
