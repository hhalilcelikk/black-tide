// Career saves: three slots in localStorage, written on every docking and every departure, plus export and
// import as a JSON file so a browser wipe never loses a career. Every storage call is wrapped: private
// windows, blocked storage or a full quota just mean no save, never a broken game.
const KEY = n => 'blacktide.save.' + n;
export const SLOTS = [1, 2, 3];

export function readSlot(n) {
  try { const s = localStorage.getItem(KEY(n)); const d = s ? JSON.parse(s) : null; return d && d.game === 'black-tide' ? d : null; } catch { return null; }
}
function writeSlot(n, d) {
  try { localStorage.setItem(KEY(n), JSON.stringify(d)); return true; } catch { return false; }
}
export function listSaves() { return SLOTS.map(slot => ({ slot, d: readSlot(slot) })); }
export function newestSave() {
  let best = null;
  for (const s of listSaves()) if (s.d && (!best || s.d.savedAt > best.d.savedAt)) best = s;
  return best;
}
// a new career takes the first empty slot, or else the one saved longest ago
function freeSlot() {
  const all = listSaves(), empty = all.find(s => !s.d);
  return empty ? empty.slot : all.reduce((a, b) => (a.d.savedAt <= b.d.savedAt ? a : b)).slot;
}

// The AI captain's trailer is not a career: nothing is saved until you have taken the helm.
export function autosave(G) {
  if (G.attract || !G.player || G.player.state === 'sinking') return false;
  if (!G.slot) G.slot = freeSlot();
  return writeSlot(G.slot, G.snapshot());
}

export function loadSlot(G, n) {
  const d = readSlot(n); if (!d) return false;
  G.restore(d, n);
  return true;
}

export function exportCareer(G) {
  const d = G.snapshot(), port = G.dockPort.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `black-tide-${d.ship.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${port}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return a.download;
}

// an imported career gets a slot of its own; returns an error message, or null when it loaded
export async function importCareer(G, file) {
  let d;
  try { d = G.validate(JSON.parse(await file.text())); } catch (e) { return e instanceof SyntaxError ? 'That file is not a Black Tide save.' : e.message; }
  G.restore(d, freeSlot()); // restoring docks, and docking autosaves into that slot
  return null;
}
