// One wave model shared by the GPU ocean and the CPU buoyancy of ships and props.
import { Vector4 } from 'three';
export const WAVES = [
  { dir: [0.80, 0.60], L: 46, A: 0.52, Q: 0.62 },
  { dir: [0.18, 0.98], L: 27, A: 0.30, Q: 0.55 },
  { dir: [0.96, -0.28], L: 15.5, A: 0.17, Q: 0.5 },
  { dir: [-0.45, 0.89], L: 8.7, A: 0.085, Q: 0.45 },
  { dir: [0.62, -0.78], L: 5.1, A: 0.045, Q: 0.4 },
];
for (let i = 0; i < WAVES.length; i++) {
  const w = WAVES[i];
  const n = Math.hypot(w.dir[0], w.dir[1]);
  w.dir = [w.dir[0] / n, w.dir[1] / n];
  w.k = 2 * Math.PI / w.L;
  w.w = Math.sqrt(9.81 * w.k);
  w.ph = i * 1.7;
}

export function waveHeight(x, z, t, amp = 1) {
  let y = 0;
  for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i]; y += w.A * (i < 2 ? amp : Math.min(amp, 1.25)) * Math.sin(w.k * (w.dir[0] * x + w.dir[1] * z) - w.w * t + w.ph); }
  return y;
}

export function waveUniforms() {
  return {
    uWa: { value: WAVES.map(w => new Vector4(w.dir[0], w.dir[1], w.k, w.A)) },
    uWb: { value: WAVES.map(w => new Vector4(w.Q, w.w, w.ph, 0)) },
  };
}

export const GLSL_WAVES = /* glsl */`
#define NW ${WAVES.length}
uniform vec4 uWa[NW];
uniform vec4 uWb[NW];
uniform float uWaveAmp;
vec3 gerstner(vec2 xz, float t, float amp) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < NW; i++) {
    vec4 a = uWa[i]; vec4 b = uWb[i];
    float th = a.z * dot(a.xy, xz) - b.y * t + b.z;
    float A = a.w * (i < 2 ? amp : min(amp, 1.25)); // storms raise the swell, not the chop
    d.xz += a.xy * (b.x * A) * cos(th);
    d.y += A * sin(th);
  }
  return d;
}
vec3 gerstnerN(vec2 xz, float t, float amp) {
  vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < NW; i++) {
    vec4 a = uWa[i]; vec4 b = uWb[i];
    float th = a.z * dot(a.xy, xz) - b.y * t + b.z;
    float kA = a.z * a.w * (i < 2 ? amp : min(amp, 1.25));
    n.xz -= a.xy * kA * cos(th);
    n.y -= b.x * kA * sin(th);
  }
  return normalize(n);
}
`;
