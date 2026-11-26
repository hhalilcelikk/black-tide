// Times of day and weather. Cinderwatch-style: cool moonlit ambience, warm firelight.
// sun: [colour, intensity, elevation deg, azimuth deg]; mist: [density, height, glow, amount]
import * as THREE from 'three';

export const LOOKS = {
  dawn: { sun: ['#ffc39a', 1.7, 14, 30], fill: ['#5a86b8', 0.34, 24, 210], hemi: ['#8a8fc4', '#3e3540', 1.05], zenith: '#3b4a7a', horizon: '#e7a98f', glow: '#ffb48a', deep: '#0d2c3a', shallow: '#2a7c80', foam: '#f1e6de', wave: 0.9, crest: 0.2, lamps: 0.55, windows: 0.6, exposure: 1.0, sat: 0.96, lift: [0.014, 0.014, 0.03], mist: [0.005, 2.2, 0.35, 0.42], mistCol: '#5d5a78', mistNoise: 1, fogD: 0.0003, fogC: '#6d6a86', night: 0.2, storm: 0, sunVis: 1, rain: 0 },
  day: { sun: ['#fff0d2', 3.2, 48, 205], fill: ['#9fc6e8', 0.4, 30, 30], hemi: ['#bcd7ee', '#a08d6a', 1.2], zenith: '#3f86cc', horizon: '#cfe5ef', glow: '#ffe7b8', deep: '#0f5468', shallow: '#38c4b5', foam: '#f6f8f6', wave: 1.0, crest: 0.35, lamps: 0, windows: 0, exposure: 1.0, sat: 0.98, lift: [0.01, 0.012, 0.02], mist: [0.002, 2.0, 0.0, 0.25], mistCol: '#c8dbe6', mistNoise: 1, fogD: 0.0003, fogC: '#c6dce7', night: 0, storm: 0, sunVis: 1, rain: 0 },
  dusk: { sun: ['#ffb27e', 1.9, 15, 150], fill: ['#2f8f9a', 0.36, 22, 45], hemi: ['#6a6fc0', '#3c3040', 1.05], zenith: '#2a2f5c', horizon: '#c98272', glow: '#ff9a5a', deep: '#0b2531', shallow: '#1d6d72', foam: '#efe2d8', wave: 1.0, crest: 0.22, lamps: 0.95, windows: 1.0, exposure: 1.0, sat: 0.96, lift: [0.014, 0.012, 0.03], mist: [0.0045, 1.8, 0.4, 0.38], mistCol: '#2b2a44', mistNoise: 1, fogD: 0.0003, fogC: '#3a3550', night: 0.3, storm: 0, sunVis: 1, rain: 0 },
  night: { sun: ['#a9c0f6', 1.5, 48, 300], fill: ['#4a5f96', 0.3, 25, 120], hemi: ['#6d83bd', '#1c1f2a', 0.95], zenith: '#070b1c', horizon: '#1a2444', glow: '#2a3a6a', deep: '#04121a', shallow: '#0c3a44', foam: '#4c6672', wave: 0.85, crest: 0.18, lamps: 1.15, windows: 1.3, exposure: 1.05, sat: 0.94, lift: [0.008, 0.013, 0.026], mist: [0.005, 1.6, 0.5, 0.32], mistCol: '#0d1426', mistNoise: 1, fogD: 0.0003, fogC: '#0b1020', night: 1, storm: 0, sunVis: 0.7, rain: 0 },
  storm: { sun: ['#9fb4d0', 1.15, 40, 250], fill: ['#3f566e', 0.34, 20, 70], hemi: ['#61738c', '#1a1f26', 1.05], zenith: '#151b22', horizon: '#46525a', glow: '#5a6a78', deep: '#07181d', shallow: '#22524f', foam: '#e3ecee', wave: 2.3, crest: 1.0, lamps: 1.25, windows: 1.0, exposure: 1.08, sat: 0.84, lift: [0.014, 0.019, 0.028], mist: [0.009, 4.0, 0.45, 0.58], mistCol: '#26313a', mistNoise: 1, fogD: 0.0006, fogC: '#1c242a', night: 0.55, storm: 1, sunVis: 0.3, rain: 1 },
};

// day cycle: phase 0..1 -> look name
export const CYCLE = [[0.0, 'dawn'], [0.06, 'day'], [0.5, 'day'], [0.6, 'dusk'], [0.68, 'night'], [0.93, 'night'], [1.0, 'dawn']];
export const PHASES = { dawn: 0.015, day: 0.3, dusk: 0.6, night: 0.8 };

const isHex = v => typeof v === 'string' && v[0] === '#';
const res = v => (isHex(v) ? new THREE.Color(v) : Array.isArray(v) ? v.map(res) : v);
export const resolve = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, res(v)]));
export const RESOLVED = Object.fromEntries(Object.entries(LOOKS).map(([k, v]) => [k, resolve(v)]));

function mixVal(a, b, t) {
  if (a && a.isColor) return a.clone().lerp(b, t);
  if (Array.isArray(a)) return a.map((x, i) => mixVal(x, b[i], t));
  if (typeof a === 'number') return a + (b - a) * t;
  return t < 0.5 ? a : b;
}
export function blend(a, b, t) {
  const o = {};
  for (const k in a) {
    if (k === 'sun' || k === 'fill') { // swing azimuth the short way round
      let az0 = a[k][3], az1 = b[k][3];
      let d = ((az1 - az0 + 540) % 360) - 180;
      o[k] = [a[k][0].clone().lerp(b[k][0], t), a[k][1] + (b[k][1] - a[k][1]) * t, a[k][2] + (b[k][2] - a[k][2]) * t, az0 + d * t];
    } else o[k] = mixVal(a[k], b[k], t);
  }
  return o;
}
const smooth = t => t * t * (3 - 2 * t);
export function lookAt(phase, weather) {
  phase = ((phase % 1) + 1) % 1;
  let i = 0;
  while (i < CYCLE.length - 2 && phase > CYCLE[i + 1][0]) i++;
  const [p0, n0] = CYCLE[i], [p1, n1] = CYCLE[i + 1];
  const t = p1 > p0 ? smooth(Math.min(1, Math.max(0, (phase - p0) / (p1 - p0)))) : 0;
  let L = n0 === n1 ? RESOLVED[n0] : blend(RESOLVED[n0], RESOLVED[n1], t);
  if (weather > 0.001) {
    // storms keep the hour's darkness: a night storm is darker than a day storm
    const S = blend(RESOLVED.storm, L, 0.25);
    L = blend(L, S, Math.min(1, weather));
    L.rain = Math.max(0, (weather - 0.35) / 0.65);
    L.storm = weather;
  }
  return L;
}
export function phaseName(phase) {
  phase = ((phase % 1) + 1) % 1;
  if (phase < 0.04 || phase > 0.97) return 'Dawn';
  if (phase < 0.55) return 'Day';
  if (phase < 0.66) return 'Dusk';
  return 'Night';
}
