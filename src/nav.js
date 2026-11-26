// Sea navigation: a fine depth grid for grounding and line-of-sight, a coarse grid for A* routes.
import { heightGrid } from './world.js';

// the fine grid is the world's shared height grid (1.25 m cells over the whole archipelago)
const HG = heightGrid();
const F = { x0: HG.x0, z0: HG.z0, n: HG.res, cell: HG.cell };
const fine = HG.data;

export function groundAt(x, z) {
  const fx = (x - F.x0) / F.cell - 0.5, fz = (z - F.z0) / F.cell - 0.5;
  if (fx < 0 || fz < 0 || fx > F.n - 1.001 || fz > F.n - 1.001) return -28;
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = fine[j * F.n + i], b = fine[j * F.n + i + 1], c = fine[(j + 1) * F.n + i], d = fine[(j + 1) * F.n + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function clearLine(x0, z0, x1, z1, depth = -3.2, step = 5) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / step));
  for (let k = 1; k <= n; k++) { const t = k / n; if (groundAt(x0 + dx * t, z0 + dz * t) > depth) return false; }
  return true;
}

// coarse grid for routes
const G = { x0: -960, z0: -960, size: 1920, n: 120 };
G.cell = G.size / G.n;
const blocked = new Uint8Array(G.n * G.n);
{
  const raw = new Uint8Array(G.n * G.n);
  for (let j = 0; j < G.n; j++) for (let i = 0; i < G.n; i++) {
    const cx = G.x0 + (i + 0.5) * G.cell, cz = G.z0 + (j + 0.5) * G.cell;
    let hmax = -99;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) hmax = Math.max(hmax, groundAt(cx + a * G.cell * 0.45, cz + b * G.cell * 0.45));
    raw[j * G.n + i] = hmax > -4.0 ? 1 : 0;
  }
  for (let j = 0; j < G.n; j++) for (let i = 0; i < G.n; i++) {
    let b = 0;
    for (let a = -1; a <= 1 && !b; a++) for (let c = -1; c <= 1 && !b; c++) {
      const ii = i + a, jj = j + c;
      if (ii >= 0 && jj >= 0 && ii < G.n && jj < G.n && raw[jj * G.n + ii]) b = 1;
    }
    blocked[j * G.n + i] = b;
  }
}
const cellOf = (x, z) => [Math.min(G.n - 1, Math.max(0, Math.floor((x - G.x0) / G.cell))), Math.min(G.n - 1, Math.max(0, Math.floor((z - G.z0) / G.cell)))];
const centre = (i, j) => [G.x0 + (i + 0.5) * G.cell, G.z0 + (j + 0.5) * G.cell];

function nearestFree(i, j) {
  if (!blocked[j * G.n + i]) return [i, j];
  for (let r = 1; r < 30; r++) for (let a = -r; a <= r; a++) for (const [ii, jj] of [[i + a, j - r], [i + a, j + r], [i - r, j + a], [i + r, j + a]]) {
    if (ii >= 0 && jj >= 0 && ii < G.n && jj < G.n && !blocked[jj * G.n + ii]) return [ii, jj];
  }
  return [i, j];
}

export function isWater(x, z, depth = -2.5) { return groundAt(x, z) < depth; }

// A* over the coarse grid, then pull the string tight with line-of-sight checks.
export function route(x0, z0, x1, z1) {
  if (clearLine(x0, z0, x1, z1)) return [[x1, z1]];
  const [si, sj] = nearestFree(...cellOf(x0, z0)), [gi, gj] = nearestFree(...cellOf(x1, z1));
  const N = G.n, start = sj * N + si, goal = gj * N + gi;
  const g = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
  // binary heap of [f, cell]
  const hf = [], hk = [];
  const push = (f, k) => { let i = hf.length; hf.push(f); hk.push(k); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [hf[p], hf[i]] = [hf[i], hf[p]]; [hk[p], hk[i]] = [hk[i], hk[p]]; i = p; } };
  const pop = () => { const k = hk[0], lf = hf.pop(), lk = hk.pop(); if (hf.length) { hf[0] = lf; hk[0] = lk; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hf.length && hf[l] < hf[m]) m = l; if (r < hf.length && hf[r] < hf[m]) m = r; if (m === i) break; [hf[m], hf[i]] = [hf[i], hf[m]]; [hk[m], hk[i]] = [hk[i], hk[m]]; i = m; } } return k; };
  g[start] = 0; push(0, start);
  const H = k => Math.hypot((k % N) - gi, Math.floor(k / N) - gj);
  let found = false;
  while (hf.length) {
    const cur = pop();
    if (closed[cur]) continue; closed[cur] = 1;
    if (cur === goal) { found = true; break; }
    const ci = cur % N, cj = Math.floor(cur / N);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue;
      const ii = ci + a, jj = cj + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const k = jj * N + ii; if (blocked[k] || closed[k]) continue;
      if (a && b && (blocked[cj * N + ii] || blocked[jj * N + ci])) continue;
      const ng = g[cur] + (a && b ? 1.4142 : 1);
      if (ng < g[k]) { g[k] = ng; from[k] = cur; push(ng + H(k), k); }
    }
  }
  if (!found) return [[x1, z1]];
  const cells = []; for (let k = goal; k !== -1; k = from[k]) cells.push(centre(k % N, Math.floor(k / N)));
  cells.reverse();
  cells[cells.length - 1] = isWater(x1, z1, -3.2) ? [x1, z1] : cells[cells.length - 1];
  // string pulling
  const out = []; let px = x0, pz = z0, i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clearLine(px, pz, cells[j][0], cells[j][1])) j--;
    out.push(cells[j]); px = cells[j][0]; pz = cells[j][1]; i = j + 1;
  }
  return out;
}
