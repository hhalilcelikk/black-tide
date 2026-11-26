// Nations: who is at war with whom, what standing means, and the ranks of a letter of marque.
export const NATION_IDS = ['english', 'spanish', 'french', 'dutch'];

// each pair of crowns is at war, at peace or allied (fixed for v1; DESIGN.md has them shift in v2)
const RELATIONS = {
  'english|spanish': 'war', 'english|french': 'peace', 'dutch|english': 'allied',
  'french|spanish': 'war', 'dutch|spanish': 'peace', 'dutch|french': 'war',
};
export const relation = (a, b) => a === b ? 'self' : RELATIONS[[a, b].sort().join('|')] || 'peace';
export const atWar = (a, b) => relation(a, b) === 'war';
export const friendly = (a, b) => a === b || relation(a, b) === 'allied';

export const MARQUE_AT = 8;     // standing a governor wants before he offers a letter of marque
export const HUNT_BELOW = -12;  // below this a crown's navy hunts you on sight (Spain starts at -10: closed, but not hunted)
export const CLOSED_BELOW = -8; // below this a port closes its harbour to you (two prizes from a neutral crown)
export const BRETHREN_PRIZES = 1; // the cove only takes captains who have taken a prize

export const standingWord = v => v >= MARQUE_AT ? 'Friendly' : v >= -2 ? 'Neutral' : v >= CLOSED_BELOW ? 'Suspicious' : 'Hostile';

// a letter of marque's ranks: prizes taken under it, and the reward paid at each promotion
export const RANKS = [
  { name: 'Privateer', prizes: 0, gold: 0, fame: 0 },
  { name: 'Captain', prizes: 2, gold: 500, fame: 10 },
  { name: 'Commodore', prizes: 5, gold: 1000, fame: 20 },
  { name: 'Admiral', prizes: 9, gold: 2000, fame: 40 },
];
