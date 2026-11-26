// Faceted low-poly ocean: Gerstner waves on a grid that is fine near the bay and coarse far out,
// with shallows, shore foam, crest foam, ship wakes and glittering lantern reflections.
import * as THREE from 'three';
import { GLSL_WAVES, waveUniforms } from './waves.js';

export const NL = 14; // point lights reflected on water and lit in the mist
export const NS = 4;  // ships with wakes

export function makeOcean(U) {
  const coords = [0];
  let x = 0;
  while (x < 3600) { x += 1.9 * (1 + Math.pow(x / 240, 1.7)); coords.push(x); }
  const axis = [...coords.slice(1).reverse().map(v => -v), ...coords];
  const n = axis.length;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j * n + i) * 3; pos[k] = axis[i]; pos[k + 1] = 0; pos[k + 2] = axis[j];
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let p = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if ((i + j) & 1) { idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
    else { idx[p++] = a; idx[p++] = c; idx[p++] = d; idx[p++] = a; idx[p++] = d; idx[p++] = b; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5000);

  const uniforms = {
    ...waveUniforms(),
    uTime: U.uTime, uWaveAmp: U.uWaveAmp, uCrestFoam: U.uCrestFoam,
    uSunDir: U.uSunDir, uSunCol: U.uSunCol, uSunVis: U.uSunVis, uAmb: U.uAmb,
    uZenith: U.uZenith, uHorizon: U.uHorizon, uFogCol: U.uFogCol, uFogDensity: U.uFogDensity,
    uDeep: U.uDeep, uShallow: U.uShallow, uFoamCol: U.uFoamCol, uNight: U.uNight, uFlash: U.uFlash,
    uLightPos: U.uLightPos, uLightCol: U.uLightCol,
    uShips: U.uShips, uShipDim: U.uShipDim,
    uHeight: U.uHeight, uHeightArea: U.uHeightArea, uFacet: U.uFacet,
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      ${GLSL_WAVES}
      uniform float uTime;
      uniform sampler2D uHeight; uniform vec4 uHeightArea;
      varying vec3 vWorld; varying float vDepth; varying float vCrest; varying vec3 vNs; flat varying vec2 vCell;
      void main(){
        vCell = position.xz; // the grid vertex, unmoved by the waves: a stable id for each triangle
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        vec2 huv = (wp.xz - uHeightArea.xy) / uHeightArea.z;
        float th = -40.0;
        if (huv.x > 0.0 && huv.y > 0.0 && huv.x < 1.0 && huv.y < 1.0) th = texture2D(uHeight, huv).r;
        float depth = -th;
        float calm = 0.2 + 0.8 * smoothstep(0.0, 8.0, depth);
        float far = 1.0 - smoothstep(700.0, 2600.0, length(wp.xz - cameraPosition.xz));
        vec3 d = gerstner(wp.xz, uTime, uWaveAmp * calm * far);
        vNs = gerstnerN(wp.xz, uTime, uWaveAmp * calm * far);
        wp += d;
        vWorld = wp; vDepth = depth; vCrest = d.y / max(uWaveAmp * 0.9, 0.05);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      #define NL ${NL}
      #define NS ${NS}
      uniform float uTime, uWaveAmp, uCrestFoam, uSunVis, uNight, uFlash, uFogDensity;
      uniform vec3 uSunDir, uSunCol, uAmb, uZenith, uHorizon, uFogCol, uDeep, uShallow, uFoamCol;
      uniform vec3 uLightPos[NL]; uniform vec3 uLightCol[NL];
      uniform vec4 uShips[NS]; uniform vec4 uShipDim[NS];
      uniform float uFacet;
      varying vec3 vWorld; varying float vDepth; varying float vCrest; varying vec3 vNs; flat varying vec2 vCell;
      float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
      float wake(vec2 p, float n){
        float f = 0.0;
        for (int s = 0; s < NS; s++) {
          vec4 sh = uShips[s]; vec4 dm = uShipDim[s];
          if (dm.z < 0.5) continue;
          vec2 fw = vec2(cos(sh.z), -sin(sh.z)), rt = vec2(sin(sh.z), cos(sh.z));
          vec2 r = p - sh.xy; float al = dot(r, fw), ac = dot(r, rt);
          float hl = dm.x, hb = dm.y, spd = sh.w;
          float e = (al*al)/(hl*hl*1.08) + (ac*ac)/(hb*hb*1.6);
          float collar = smoothstep(1.7, 1.0, e) * smoothstep(0.7, 1.0, e) * (0.45 + 0.55 * smoothstep(-0.4, 0.9, al / hl));
          float w = 0.0;
          float bh = -(al - hl * 0.8);
          if (bh > 0.0) {
            float ww = bh * 0.34 + hb * 0.75;
            float t = abs(ac) / ww;
            float arm = smoothstep(0.78, 0.97, t + n * 0.08) * smoothstep(1.16, 0.98, t);
            w = arm * exp(-bh / (7.0 + spd * 2.0)) * clamp(spd * 0.35, 0.0, 1.0);
            float bs = -(al + hl * 0.92);
            if (bs > 0.0) {
              float tw = hb * (0.6 + bs * 0.012);
              w = max(w, smoothstep(1.0, 0.15, abs(ac) / tw) * exp(-bs / (8.0 + spd * 2.4)) * clamp(spd * 0.3, 0.0, 0.95));
            }
          }
          f = max(f, max(collar * clamp(0.25 + spd * 0.3, 0.0, 1.0), w));
        }
        return f;
      }
      void main(){
        vec3 Nf = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (Nf.y < 0.0) Nf = -Nf;
        vec3 N = normalize(mix(normalize(vNs), Nf, uFacet));
        vec3 V = normalize(cameraPosition - vWorld);
        float shallow = 1.0 - smoothstep(0.4, 12.0, vDepth);
        vec3 base = mix(uDeep, uShallow, shallow * shallow * (3.0 - 2.0 * shallow));
        float ndl = max(dot(N, uSunDir), 0.0);
        vec3 col = base * (uAmb * 0.9 + uSunCol * (0.25 + ndl * 0.5) * uSunVis);
        float crest = clamp(vCrest * 0.7 + 0.2, 0.0, 1.0);
        float back = pow(max(dot(-V, uSunDir), 0.0) * 0.5 + 0.5, 3.0);
        col += uShallow * uSunCol * uSunVis * 0.22 * crest * back;
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.45));
        col = mix(col, sky, min(fres, 0.42) * 0.62);
        vec3 H = normalize(uSunDir + V);
        float nh = max(dot(N, H), 0.0);
        // glitter: facets flash one by one (mostly the flat facet normal), plus a faint broad sheen
        float nhf = max(dot(normalize(mix(normalize(vNs), Nf, 0.72)), H), 0.0);
        float storm = smoothstep(0.45, 1.0, uCrestFoam);
        float mpp = length(fwidth(vWorld.xz)); // metres per pixel: zoomed far out, single facets turn to noise
        // only a scattering of facets may flash at once, or a low sun turns the sea to tinfoil
        float spark = step(0.86, hash12(vCell * 0.37 + 11.0)); // one triangle in six may flash, twinkling as it tilts
        col += uSunCol * uSunVis * (pow(nhf, 800.0) * 1.4 * spark * (1.0 - 0.9 * storm) * (1.0 - smoothstep(0.3, 1.1, mpp)) + pow(nh, 40.0) * 0.07);
        for (int i = 0; i < NL; i++) {
          vec3 Ld = uLightPos[i] - vWorld; float d2 = dot(Ld, Ld);
          vec3 L = Ld * inversesqrt(d2);
          float s = pow(max(dot(N, normalize(L + V)), 0.0), 70.0);
          col += uLightCol[i] * (s * 16.0 + max(dot(N, L), 0.0) * 0.45) / (1.0 + d2 * 0.019);
        }
        float n = vn(vWorld.xz * 0.45 + vec2(uTime * 0.13, -uTime * 0.07)) * 0.6 + vn(vWorld.xz * 1.3 - uTime * 0.2) * 0.4;
        float shore = 1.0 - smoothstep(0.0, 0.8, vDepth);
        float bands = smoothstep(0.62, 0.95, sin(vDepth * 2.6 - uTime * 1.3 + n * 2.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.2, 3.8, vDepth));
        float foam = smoothstep(0.4, 0.75, shore + n * 0.35);
        foam = max(foam, bands * smoothstep(0.35, 0.7, n));
        foam = max(foam, smoothstep(0.93, 1.0, crest) * smoothstep(0.55, 0.85, n) * uCrestFoam);
        // storms: wind-driven streaks of white water along the swell
        if (storm > 0.0) {
          vec2 sd = vec2(0.8, 0.6), sp = vec2(-0.6, 0.8);
          float st = vn(vec2(dot(vWorld.xz, sd) * 0.045 - uTime * 0.35, dot(vWorld.xz, sp) * 0.42)) * 0.7 + vn(vWorld.xz * 0.21 + uTime * 0.05) * 0.3;
          foam = max(foam, smoothstep(0.62, 0.86, st) * (0.45 + 0.55 * crest) * storm * 0.75);
        }
        foam = max(foam, smoothstep(0.26, 0.6, wake(vWorld.xz, n) * (0.5 + 0.9 * n)) * 0.62);
        vec3 foamLit = uFoamCol * (uAmb * 1.2 + uSunCol * uSunVis * (0.35 + ndl * 0.65));
        for (int i = 0; i < NL; i++) { vec3 Ld = uLightPos[i] - vWorld; foamLit += uLightCol[i] * 0.8 / (1.0 + dot(Ld, Ld) * 0.02); }
        col = mix(col, foamLit, foam * 0.92);
        col += uAmb * uFlash * 0.8;
        float dist = length(vWorld - cameraPosition);
        float fog = 1.0 - exp(-(dist * uFogDensity) * (dist * uFogDensity));
        col = mix(col, uFogCol, fog);
        gl_FragColor = vec4(col, 0.3 + 0.5 * shallow);
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
