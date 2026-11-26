// Cloth flags drawn on canvas and waved in a vertex shader.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const flagRnd = mulberry32(0xf1a6); // per-flag ripple phase, seeded so captures repeat

function canvasFlag(kind) {
  const W = 256, H = 160;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  if (kind === 'jolly') {
    x.fillStyle = '#111013'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#ece4d0';
    // crossed bones
    x.save(); x.translate(128, 104);
    for (const a of [0.55, -0.55]) {
      x.save(); x.rotate(a); x.fillRect(-62, -6, 124, 12);
      for (const s of [-1, 1]) { x.beginPath(); x.arc(s * 62, -6, 9, 0, 7); x.arc(s * 62, 6, 9, 0, 7); x.fill(); }
      x.restore();
    }
    x.restore();
    // skull
    x.beginPath(); x.ellipse(128, 62, 34, 32, 0, 0, 7); x.fill();
    x.fillRect(106, 72, 44, 26);
    x.fillStyle = '#111013';
    x.beginPath(); x.ellipse(114, 62, 9, 10, 0.2, 0, 7); x.ellipse(142, 62, 9, 10, -0.2, 0, 7); x.fill();
    x.beginPath(); x.moveTo(128, 72); x.lineTo(122, 84); x.lineTo(134, 84); x.fill();
    for (let i = 0; i < 4; i++) x.fillRect(112 + i * 10, 90, 3, 9);
    // ragged fly edge
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(W, i * 18); x.lineTo(W - 10 - (i % 3) * 7, i * 18 + 9); x.lineTo(W, i * 18 + 18); x.fill(); }
  } else if (kind === 'burgundy') {
    x.fillStyle = '#efe7d6'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#a4161a'; x.lineWidth = 18; x.lineCap = 'round';
    x.beginPath(); x.moveTo(30, 22); x.lineTo(226, 138); x.moveTo(226, 22); x.lineTo(30, 138); x.stroke();
    x.fillStyle = '#a4161a';
    for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7; for (const [ax, ay, bx, by] of [[30, 22, 226, 138], [226, 22, 30, 138]]) { x.beginPath(); x.arc(ax + (bx - ax) * t, ay + (by - ay) * t, 13, 0, 7); x.fill(); } }
  } else if (kind === 'stgeorge') {
    x.fillStyle = '#efe7d6'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#b3241c'; x.fillRect(108, 0, 40, H); x.fillRect(0, 60, W, 40);
  } else if (kind === 'fleur') {
    // French royal ensign: white field, gold fleur-de-lis
    x.fillStyle = '#efe9da'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#c99a2e';
    x.save(); x.translate(128, 82); x.scale(1.15, 1.15);
    x.beginPath(); x.moveTo(0, -46); x.bezierCurveTo(16, -30, 14, -8, 0, 10); x.bezierCurveTo(-14, -8, -16, -30, 0, -46); x.fill();
    for (const s of [-1, 1]) {
      x.beginPath(); x.moveTo(s * 4, 4); x.bezierCurveTo(s * 18, -22, s * 46, -16, s * 38, 6); x.bezierCurveTo(s * 34, -6, s * 22, -6, s * 14, 12); x.fill();
      x.beginPath(); x.moveTo(s * 3, 16); x.bezierCurveTo(s * 10, 26, s * 20, 30, s * 26, 40); x.lineTo(s * 14, 40); x.bezierCurveTo(s * 10, 32, s * 4, 28, 0, 26); x.fill();
    }
    x.fillRect(-24, 8, 48, 9);
    x.restore();
  } else if (kind === 'prinsen') {
    // Dutch Prince's flag: orange, white, blue
    x.fillStyle = '#d8701e'; x.fillRect(0, 0, W, H / 3);
    x.fillStyle = '#efe9da'; x.fillRect(0, H / 3, W, H / 3);
    x.fillStyle = '#1f3f7a'; x.fillRect(0, 2 * H / 3, W, H / 3 + 1);
  } else if (kind === 'pennant') {
    x.fillStyle = '#9e1f19'; x.fillRect(0, 0, W, H);
  } else if (kind === 'white') {
    x.fillStyle = '#ece6d6'; x.fillRect(0, 0, W, H);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const cache = {};
export const flagTexture = kind => cache[kind] || (cache[kind] = canvasFlag(kind));
export function makeFlag(kind, w, h, U) {
  const tex = flagTexture(kind);
  const pennant = kind === 'pennant';
  const geo = new THREE.PlaneGeometry(w, h, 14, 4);
  geo.translate(w / 2, 0, 0);
  if (pennant) { // taper to a point
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getX(i) / w; p.setY(i, p.getY(i) * (1 - t * 0.92)); }
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tMap: { value: tex }, uTime: U.uTime, uLen: { value: w }, uSeed: { value: flagRnd() * 10 },
      uSunDir: U.uSunDir, uSunCol: U.uSunCol, uAmb: U.uAmb, uFogCol: U.uFogCol, uFogDensity: U.uFogDensity, uSunVis: U.uSunVis,
    },
    vertexShader: /* glsl */`
      uniform float uTime, uLen, uSeed;
      varying vec2 vUv; varying vec3 vWN; varying vec3 vWorld;
      void main(){
        vUv = uv; vec3 p = position; float t = p.x / uLen;
        float ph = p.x * 2.3 / max(uLen * 0.35, 0.6) - uTime * 6.5 + uSeed + p.y * 0.6;
        float w = (sin(ph) * 0.2 + sin(ph * 2.3 + 1.0) * 0.06) * t * uLen * 0.45;
        float dw = (cos(ph) * 0.2 * 2.3 / max(uLen * 0.35, 0.6) + cos(ph * 2.3 + 1.0) * 0.06 * 2.3 * 2.3 / max(uLen * 0.35, 0.6)) * t * uLen * 0.45;
        p.z += w; p.y -= 0.08 * t * t * uLen;
        vWN = normalize(mat3(modelMatrix) * normalize(vec3(-dw, 0.0, 1.0)));
        vec4 wp = modelMatrix * vec4(p, 1.0); vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tMap; uniform vec3 uSunDir, uSunCol, uAmb, uFogCol; uniform float uFogDensity, uSunVis;
      varying vec2 vUv; varying vec3 vWN; varying vec3 vWorld;
      void main(){
        vec4 c = texture2D(tMap, vUv);
        if (c.a < 0.5) discard;
        float d = abs(dot(normalize(vWN), uSunDir));
        vec3 col = c.rgb * (uAmb + uSunCol * uSunVis * (0.25 + 0.75 * d));
        float dist = length(vWorld - cameraPosition); float fog = 1.0 - exp(-(dist * uFogDensity) * (dist * uFogDensity));
        gl_FragColor = vec4(mix(col, uFogCol, fog), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}
