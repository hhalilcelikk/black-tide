// The Black Tide look: a miniature diorama. Half-res render, lantern-lit sea haze and contact shadows,
// optional tilt-shift (off by default), bloom, filmic grade and an ordered-dither posterise,
// then a crisp pixel upscale with grain. (Pipeline shape after Cinderwatch by kevintngo, MIT.)
import * as THREE from 'three';
import { NL } from './ocean.js';

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const COMMON = /* glsl */`
precision highp float;
varying vec2 vUv;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm3(vec2 p){ return vn(p) * 0.5 + vn(p * 2.03 + 7.1) * 0.3 + vn(p * 4.1 + 3.3) * 0.2; }
float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }
vec3 aces(vec3 x){ x = max(x, 0.0); return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
uniform float uNear, uFar, uOrtho;
float linZ(float d){ return uOrtho > 0.5 ? uNear + d * (uFar - uNear) : (uNear * uFar) / (uFar - d * (uFar - uNear)); }
`;

function fsMat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: COMMON + frag, uniforms: { uNear: { value: 0.3 }, uFar: { value: 5000 }, uOrtho: { value: 0 }, ...uniforms }, depthTest: false, depthWrite: false, toneMapped: false });
}

const ATMO = /* glsl */`
#define NL ${NL}
uniform sampler2D tColor, tDepth; uniform mat4 uInvVP; uniform vec3 uCamPos; uniform vec2 uPx;
uniform vec3 uLP[NL]; uniform vec3 uLC[NL];
uniform vec4 uMist; uniform vec3 uMistCol, uSunDir, uSunCol; uniform float uAO, uAORad, uMistNoise; uniform vec2 uWind;
vec3 wpos(vec2 uv, float d){ vec4 p = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
void main(){
  vec4 c4 = texture2D(tColor, vUv); vec3 col = c4.rgb; float a = c4.a;
  float d = texture2D(tDepth, vUv).x;
  bool sky = d > 0.99999;
  vec3 O = uOrtho > 0.5 ? wpos(vUv, 0.0) : uCamPos;
  vec3 P = sky ? O + normalize(wpos(vUv, 0.9999) - O) * 3000.0 : wpos(vUv, d);
  vec3 rd = normalize(P - O); float tP = length(P - O);
  if (!sky && a > 0.9 && uAO > 0.0) {
    float dr = texture2D(tDepth, vUv + vec2(uPx.x, 0.0)).x, dl = texture2D(tDepth, vUv - vec2(uPx.x, 0.0)).x;
    float du = texture2D(tDepth, vUv + vec2(0.0, uPx.y)).x, dd = texture2D(tDepth, vUv - vec2(0.0, uPx.y)).x;
    vec3 ddx = abs(dr - d) < abs(d - dl) ? wpos(vUv + vec2(uPx.x, 0.0), dr) - P : P - wpos(vUv - vec2(uPx.x, 0.0), dl);
    vec3 ddy = abs(du - d) < abs(d - dd) ? wpos(vUv + vec2(0.0, uPx.y), du) - P : P - wpos(vUv - vec2(0.0, uPx.y), dd);
    vec3 N = normalize(cross(ddx, ddy)); if (dot(N, rd) > 0.0) N = -N;
    float occ = 0.0, ang = bayer4(gl_FragCoord.xy) * 6.2831853;
    float rad = uOrtho > 0.5 ? uAORad : clamp(9.0 / max(tP, 1.0), 0.002, 0.03);
    for (int i = 0; i < 10; i++) {
      float fi = (float(i) + 0.5) / 10.0, aa = ang + float(i) * 2.39996;
      vec2 suv = vUv + vec2(cos(aa), sin(aa) * uPx.y / uPx.x) * rad * sqrt(fi);
      vec3 Vv = wpos(suv, texture2D(tDepth, suv).x) - P;
      float vv = dot(Vv, Vv);
      occ += max(0.0, dot(Vv, N) - 0.03) / (vv + 0.05) * step(vv, 4.0);
    }
    col *= clamp(1.0 - occ * uAO * 0.09, 0.25, 1.0);
  }
  vec3 glow = vec3(0.0), lit = vec3(0.0);
  vec3 Pm = P + vec3(0.0, 0.8, 0.0);
  for (int i = 0; i < NL; i++) {
    vec3 L = uLP[i]; float t = clamp(dot(L - O, rd), 0.0, tP);
    vec3 q = O + rd * t - L; float d2 = dot(q, q);
    glow += uLC[i] / (d2 * 1.3 + 0.75) * smoothstep(0.5, 6.0, t);
    vec3 dv = L - Pm; lit += uLC[i] / (dot(dv, dv) * 0.08 + 1.6);
  }
  col += glow * uMist.z;
  if (!sky) {
    float h = uOrtho > 0.5 ? max(P.y, 0.0) : max(min(O.y, P.y) + abs(O.y - P.y) * 0.25, 0.0);
    float n = vn(P.xz * 0.045 + uWind) * 0.65 + vn(P.xz * 0.13 - uWind * 1.7) * 0.35;
    float tau = (uOrtho > 0.5 ? uMist.x * 70.0 : uMist.x * tP) * exp(-h / uMist.y) * mix(1.0, smoothstep(0.32, 0.82, n) * 1.6, uMistNoise);
    float f = 1.0 - exp(-tau);
    vec3 hc = uMistCol + lit * 0.6 + uSunCol * pow(max(dot(rd, uSunDir), 0.0), 6.0) * 0.35;
    col = mix(col, hc, clamp(f * uMist.w, 0.0, 0.85));
  }
  gl_FragColor = vec4(col, a);
}`;

const DOF = /* glsl */`
uniform sampler2D tColor, tDepth; uniform vec2 uPx; uniform vec4 uDof; // focus, near range, far range, max radius (px)
float coc(float z){ float dz = z - uDof.x; float a = max(abs(dz) - uDof.y, 0.0); return clamp(a / uDof.z, 0.0, 1.0) * uDof.w; }
void main(){
  float zc = linZ(texture2D(tDepth, vUv).x), cc = coc(zc);
  vec4 c0 = texture2D(tColor, vUv);
  vec3 acc = c0.rgb; float tot = 1.0;
  float ang = bayer4(gl_FragCoord.xy) * 6.2831853, rad = 0.8;
  for (int i = 0; i < 44; i++) {
    ang += 2.39996323;
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * uPx * rad;
    float zs = linZ(texture2D(tDepth, tc).x), cs = coc(zs);
    if (zs > zc) cs = min(cs, cc * 2.0);
    float m = smoothstep(rad - 0.5, rad + 0.5, cs);
    acc += mix(acc / tot, texture2D(tColor, tc).rgb, m); tot += 1.0;
    rad += 1.25 / rad; if (rad > uDof.w) break;
  }
  gl_FragColor = vec4(acc / tot, c0.a);
}`;

const BRIGHT = /* glsl */`
uniform sampler2D tColor; uniform vec2 uPx; uniform vec2 uThr;
void main(){
  vec3 c = texture2D(tColor, vUv + uPx * vec2(-0.5, -0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(0.5, -0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(-0.5, 0.5)).rgb + texture2D(tColor, vUv + uPx * vec2(0.5, 0.5)).rgb;
  c *= 0.25; float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(min(c * smoothstep(uThr.x, uThr.x + uThr.y, l), vec3(30.0)), 1.0);
}`;
const BLUR = /* glsl */`
uniform sampler2D tColor; uniform vec2 uDir;
void main(){
  vec4 c = texture2D(tColor, vUv) * 0.227027;
  c += (texture2D(tColor, vUv + uDir * 1.3846) + texture2D(tColor, vUv - uDir * 1.3846)) * 0.316216;
  c += (texture2D(tColor, vUv + uDir * 3.2308) + texture2D(tColor, vUv - uDir * 3.2308)) * 0.070270;
  gl_FragColor = c;
}`;

const LANTERN_COMP = /* glsl */`
uniform sampler2D tColor, tBloomA, tBloomB; uniform float uExposure, uSat, uVig, uLevels; uniform vec3 uLift, uWarm; uniform vec2 uBloom;
void main(){
  vec3 c = texture2D(tColor, vUv).rgb;
  c += texture2D(tBloomA, vUv).rgb * uBloom.x + texture2D(tBloomB, vUv).rgb * uBloom.y;
  c *= uExposure;
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.9);
  float vig = smoothstep(0.95, 0.25, length(q) * 1.3);
  c *= mix(1.0 - uVig, 1.0, vig);
  c = aces(c);
  float l = luma(c);
  c = mix(vec3(l), c, uSat);
  c += uLift * (1.0 - smoothstep(0.0, 0.35, l)) * mix(0.6, 1.0, vig);
  c = mix(c, c * uWarm, smoothstep(0.45, 1.0, l));
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  c = floor(c * uLevels + bayer8(gl_FragCoord.xy)) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}`;
const UPSCALE = /* glsl */`
uniform sampler2D tColor; uniform vec2 uTex, uOut; uniform float uGrain, uSeed;
void main(){
  vec2 texel = vUv * uTex, scale = max(uOut / uTex, vec2(1.0));
  vec2 tf = floor(texel), f = texel - tf, region = 0.5 - 0.5 / scale, cen = f - 0.5;
  vec2 off = (cen - clamp(cen, -region, region)) * scale + 0.5;
  vec3 c = texture2D(tColor, (tf + off) / uTex).rgb;
  float g = hash12(gl_FragCoord.xy + uSeed) - 0.5;
  c += g * uGrain * (0.4 + 0.6 * (1.0 - luma(c)));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.fsScene = new THREE.Scene(); this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fs = new THREE.Mesh(g, null); this.fs.frustumCulled = false; this.fsScene.add(this.fs);
    const lp = Array.from({ length: NL }, () => new THREE.Vector3()), lc = Array.from({ length: NL }, () => new THREE.Vector3());
    this.M = {
      atmo: fsMat(ATMO, { tColor: { value: null }, tDepth: { value: null }, uInvVP: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() }, uPx: { value: new THREE.Vector2() }, uLP: { value: lp }, uLC: { value: lc }, uMist: { value: new THREE.Vector4() }, uMistCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uAO: { value: 1 }, uAORad: { value: 0.01 }, uMistNoise: { value: 0 }, uWind: { value: new THREE.Vector2() } }),
      dof: fsMat(DOF, { tColor: { value: null }, tDepth: { value: null }, uPx: { value: new THREE.Vector2() }, uDof: { value: new THREE.Vector4() } }),
      bright: fsMat(BRIGHT, { tColor: { value: null }, uPx: { value: new THREE.Vector2() }, uThr: { value: new THREE.Vector2(1.0, 1.4) } }),
      blur: fsMat(BLUR, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } }),
      comp: fsMat(LANTERN_COMP, { tColor: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, uExposure: { value: 1 }, uSat: { value: 0.95 }, uVig: { value: 0.68 }, uLevels: { value: 30 }, uLift: { value: new THREE.Vector3(0.012, 0.018, 0.034) }, uWarm: { value: new THREE.Vector3(1.04, 0.99, 0.9) }, uBloom: { value: new THREE.Vector2(0.34, 0.26) } }),
      up: fsMat(UPSCALE, { tColor: { value: null }, uTex: { value: new THREE.Vector2() }, uOut: { value: new THREE.Vector2() }, uGrain: { value: 0.04 }, uSeed: { value: 0 } }),
    };
    this.rt = {};
    this.style = null;
  }

  setSize(w, h, scale = 0.5, maxH = 620) {
    let ih = Math.round(h * scale), iw = Math.round(w * scale);
    if (ih > maxH) { iw = Math.round(iw * maxH / ih); ih = maxH; }
    if (this.w === w && this.h === h && this.iw === iw && this.ih === ih) return;
    this.w = w; this.h = h; this.iw = iw; this.ih = ih;
    for (const k in this.rt) { this.rt[k].dispose(); if (this.rt[k].depthTexture) this.rt[k].depthTexture.dispose(); }
    const mk = (w2, h2, type, filter, depth) => {
      const t = new THREE.WebGLRenderTarget(w2, h2, { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: !!depth, stencilBuffer: false, generateMipmaps: false });
      if (depth) { t.depthTexture = new THREE.DepthTexture(w2, h2); t.depthTexture.type = THREE.UnsignedIntType; }
      return t;
    };
    const HF = THREE.HalfFloatType, NE = THREE.NearestFilter, LI = THREE.LinearFilter;
    const bw = Math.max(4, iw >> 1), bh = Math.max(4, ih >> 1), cw = Math.max(2, iw >> 2), ch = Math.max(2, ih >> 2);
    this.rt.scene = mk(iw, ih, HF, NE, true);
    this.rt.a = mk(iw, ih, HF, NE, false);
    this.rt.b = mk(iw, ih, HF, LI, false);
    this.rt.bA = mk(bw, bh, HF, LI, false); this.rt.bA2 = mk(bw, bh, HF, LI, false);
    this.rt.bB = mk(cw, ch, HF, LI, false); this.rt.bB2 = mk(cw, ch, HF, LI, false);
    this.rt.c = mk(iw, ih, THREE.UnsignedByteType, LI, false);
  }

  pass(mat, target) { this.fs.material = mat; this.r.setRenderTarget(target); this.r.render(this.fsScene, this.fsCam); }

  bloom(src, thr) {
    const M = this.M, T = this.rt;
    M.bright.uniforms.tColor.value = src.texture; M.bright.uniforms.uPx.value.set(1 / this.iw, 1 / this.ih); M.bright.uniforms.uThr.value.copy(thr);
    this.pass(M.bright, T.bA);
    const u = M.blur.uniforms;
    u.tColor.value = T.bA.texture; u.uDir.value.set(1 / T.bA.width, 0); this.pass(M.blur, T.bA2);
    u.tColor.value = T.bA2.texture; u.uDir.value.set(0, 1 / T.bA.height); this.pass(M.blur, T.bA);
    u.tColor.value = T.bA.texture; u.uDir.value.set(1 / T.bB.width, 0); this.pass(M.blur, T.bB2);
    u.tColor.value = T.bB2.texture; u.uDir.value.set(0, 1 / T.bB.height); this.pass(M.blur, T.bB);
    u.tColor.value = T.bB.texture; u.uDir.value.set(1.8 / T.bB.width, 0); this.pass(M.blur, T.bB2);
    u.tColor.value = T.bB2.texture; u.uDir.value.set(0, 1.8 / T.bB.height); this.pass(M.blur, T.bB);
  }

  atmo(cam, P, ao) {
    const M = this.M, T = this.rt, u = M.atmo.uniforms;
    u.tColor.value = T.scene.texture; u.tDepth.value = T.scene.depthTexture;
    u.uInvVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    u.uCamPos.value.copy(cam.position); u.uPx.value.set(1 / this.iw, 1 / this.ih);
    for (let i = 0; i < NL; i++) { u.uLP.value[i].copy(P.lightPos[i]); u.uLC.value[i].set(P.lightCol[i].r, P.lightCol[i].g, P.lightCol[i].b); }
    u.uMist.value.copy(P.mist); u.uMistCol.value.copy(P.mistCol); u.uSunDir.value.copy(P.sunDir); u.uSunCol.value.copy(P.sunCol); u.uAO.value = ao;
    u.uAORad.value = cam.isOrthographicCamera ? 1.6 / (cam.right - cam.left) : 0.01; u.uMistNoise.value = P.mistNoise ?? 0; u.uWind.value.set(P.time * 0.05, P.time * 0.021);
    this.pass(M.atmo, T.a);
  }

  render(scene, cam, P) {
    const r = this.r, M = this.M, T = this.rt;
    for (const k in M) { M[k].uniforms.uNear.value = cam.near; M[k].uniforms.uFar.value = cam.far; M[k].uniforms.uOrtho.value = cam.isOrthographicCamera ? 1 : 0; }
    r.setRenderTarget(T.scene); r.render(scene, cam);
    this.atmo(cam, P, P.ao ?? 1.0);
    let src = T.a;
    if (P.dofAmt > 0.001) { // tilt-shift, off unless a shot asks for it
      const u = M.dof.uniforms;
      u.tColor.value = T.a.texture; u.tDepth.value = T.scene.depthTexture; u.uPx.value.set(1 / this.iw, 1 / this.ih);
      u.uDof.value.set(P.focus, P.dofNear, P.dofFar, Math.max(2, this.ih * 0.016) * P.dofAmt);
      this.pass(M.dof, T.b); src = T.b;
    }
    this.bloom(src, new THREE.Vector2(1.0, 1.5));
    const c = M.comp.uniforms;
    c.tColor.value = src.texture; c.tBloomA.value = T.bA.texture; c.tBloomB.value = T.bB.texture; c.uExposure.value = P.exposure;
    if (P.sat) c.uSat.value = P.sat; if (P.lift) c.uLift.value.set(...P.lift);
    this.pass(M.comp, T.c);
    const up = M.up.uniforms;
    up.tColor.value = T.c.texture; up.uTex.value.set(this.iw, this.ih); up.uOut.value.set(this.w, this.h); up.uSeed.value = (P.time * 60) % 1000;
    this.pass(M.up, null);
  }
}
