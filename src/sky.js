// Sky dome (gradient, sun, moon, stars) and a ring of low-poly cumulus.
import * as THREE from 'three';
import { Geo, C, mat, roughen } from './geo.js';
import { mulberry32 } from './util.js';

export function makeSky(U) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(3000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uZenith: U.uZenith, uHorizon: U.uHorizon, uSunCol: U.uSunCol,
        uGlow: U.uSkyGlow, uNight: U.uNight, uTime: U.uTime, uStorm: U.uStorm, uFlash: U.uFlash,
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uSunCol, uGlow;
        uniform float uNight, uTime, uStorm, uFlash;
        varying vec3 vDir;
        float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
        void main(){
          vec3 d = normalize(vDir);
          float e = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(e, 0.0, 1.0), 0.45));
          col = mix(col, uHorizon * 0.8, smoothstep(0.0, -0.1, e));
          float sd = max(dot(d, uSunDir), 0.0);
          float clear = 1.0 - uStorm * 0.85;
          col += uGlow * (pow(sd, 5.0) * 0.5 + pow(sd, 40.0) * 0.9) * clear;
          col += uGlow * 0.22 * exp(-abs(e) * 16.0) * (1.0 - uNight * 0.6) * clear;
          col += uSunCol * smoothstep(0.99905, 0.99945, sd) * 5.0 * clear;
          if (uNight > 0.01) {
            vec3 sp = d * 300.0; vec3 cell = floor(sp); float h = hash13(cell);
            float star = smoothstep(0.22, 0.0, length(fract(sp) - 0.5)) * step(0.982, h) * (0.55 + 0.45 * sin(uTime * 1.7 + h * 80.0));
            col += vec3(0.85, 0.9, 1.0) * star * uNight * smoothstep(0.03, 0.3, e) * 1.6 * clear;
            float md = max(dot(d, uMoonDir), 0.0);
            col += vec3(0.9, 0.92, 1.0) * (smoothstep(0.99945, 0.9997, md) * 2.6 + pow(md, 90.0) * 0.18 + pow(md, 8.0) * 0.04) * uNight * clear;
          }
          col += vec3(0.65, 0.7, 0.9) * uFlash;
          gl_FragColor = vec4(col, 0.0);
        }`,
      depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    }),
  );
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}

export function makeClouds(seed = 7) {
  const r = mulberry32(seed);
  const g = new Geo(seed, 0.04);
  const white = C('#f4f1ea');
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.25;
    const dist = 1150 + r() * 650;
    const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist, cy = 150 + r() * 260;
    const n = 4 + Math.floor(r() * 5);
    const big = 38 + r() * 40;
    for (let k = 0; k < n; k++) {
      const s = big * (0.55 + r() * 0.6);
      const geo = roughen(new THREE.IcosahedronGeometry(1, 1), 0.22, i * 31 + k);
      const ox = (k - n / 2) * big * 0.7 + (r() - 0.5) * big * 0.5;
      const m = mat(cx + Math.cos(a + 1.57) * ox, cy + (r() - 0.3) * s * 0.4, cz + Math.sin(a + 1.57) * ox, 0, r() * 6, 0, s, s * (0.45 + r() * 0.25), s);
      g.add(geo, m, white, 0.05);
    }
  }
  const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false }));
  mesh.frustumCulled = false;
  return mesh;
}
