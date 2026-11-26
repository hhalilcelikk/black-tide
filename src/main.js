import * as THREE from 'three';
import { makeWorld, bakeHeight, AREA } from './world.js';
import { makeOcean, NL, NS } from './ocean.js';
import { makeSky, makeClouds } from './sky.js';
import { makeFx } from './fx.js';
import { makeFlag } from './flags.js';
import { Post } from './post.js';
import { makeDetail, enhance } from './detail.js';
import { makeCamp, makeQuayLife } from './props.js';
import { lookAt, RESOLVED, PHASES } from './looks.js';
import { createGame } from './game.js';
import { PORTS, PORT_BY_ID } from './ports.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { mulberry32 } from './util.js';

// softer point-light falloff close to the source, as lanterns and braziers would read in a miniature
THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace('max( pow( lightDistance, decayExponent ), 0.01 )', '( pow( lightDistance, decayExponent ) + 2.0 )');

const V3 = THREE.Vector3, V4 = THREE.Vector4, Col = THREE.Color;
const D2R = THREE.MathUtils.degToRad, R2D = 180 / Math.PI;
const Q = new URLSearchParams(location.search);
const capture = Q.has('capture'), test = Q.has('test');
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: capture || test });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000, 0);

// ---------- shared uniforms and materials ----------
const D = { uDetail: { value: makeDetail() }, uBump: { value: 0.05 } };
const U = {
  uTime: { value: 0 }, uSunDir: { value: new V3(0, 1, 0) }, uMoonDir: { value: new V3(0, 1, 0) }, uSunCol: { value: new Col() }, uSunVis: { value: 1 },
  uAmb: { value: new Col() }, uZenith: { value: new Col() }, uHorizon: { value: new Col() }, uSkyGlow: { value: new Col() },
  uNight: { value: 0 }, uStorm: { value: 0 }, uFlash: { value: 0 }, uFogCol: { value: new Col() }, uFogDensity: { value: 0.001 },
  uDeep: { value: new Col() }, uShallow: { value: new Col() }, uFoamCol: { value: new Col() }, uWaveAmp: { value: 1 }, uCrestFoam: { value: 0.2 },
  uLightPos: { value: Array.from({ length: NL }, () => new V3(0, -999, 0)) }, uLightCol: { value: Array.from({ length: NL }, () => new V3()) },
  uShips: { value: Array.from({ length: NS }, () => new V4()) }, uShipDim: { value: Array.from({ length: NS }, () => new V4()) },
  uHeight: { value: null }, uHeightArea: { value: new V4(AREA.x, AREA.z, AREA.size, 0) }, uSunDirView: { value: new V3() }, uFacet: { value: 0.28 },
};
U.enhance = (m, key, extra) => enhance(m, D, key, extra);
U.noHelmsman = false;
U.glowMat = new THREE.MeshBasicMaterial({ color: new Col(0.05, 0.045, 0.04) });
U.shipMat = U.enhance(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide }), 'ship');
U.ropeMat = new THREE.LineBasicMaterial({ color: new Col('#2a1f17') });
U.sailMat = U.enhance(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, side: THREE.DoubleSide }), 'sail', (sh) => {
  sh.uniforms.uTime = U.uTime; sh.uniforms.uSunDirV = U.uSunDirView; sh.uniforms.uSunColT = U.uSunCol; sh.uniforms.uSunVisT = U.uSunVis;
  sh.vertexShader = 'attribute vec3 aFlex;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aFlex * (0.09 * sin(uTime * 1.9 + position.y * 0.4 + position.x * 0.25) + 0.035 * sin(uTime * 3.3 + position.z * 0.7));');
  sh.fragmentShader = 'uniform vec3 uSunDirV; uniform vec3 uSunColT; uniform float uSunVisT;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float bl = max(0.0, -dot(normal, uSunDirV)); totalEmissiveRadiance += diffuseColor.rgb * uSunColT * uSunVisT * 0.5 * bl; }');
});

// ---------- scene ----------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffffff, 0.001);
U.uHeight.value = bakeHeight();
const sky = makeSky(U); scene.add(sky);
const clouds = makeClouds(); scene.add(clouds);
const ocean = makeOcean(U); scene.add(ocean);
const world = makeWorld(U, PORTS); scene.add(world.group);
for (const f of world.flags) { const m = makeFlag(f.kind, f.w, f.h, U); m.position.copy(f.pos); m.rotation.y = 0.8; scene.add(m); }
const fx = makeFx(U); scene.add(fx.group);

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 800 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(sun, sun.target, fill, fill.target, hemi);

// ---------- lights: fixed pools, so the light count never changes however many towns there are ----------
// Every lamp, brazier and beacon in the world is a spec; each frame the eight that matter most near the
// focus get a real PointLight. Port Rosalind has seven, so at home every one of them is lit as before.
const reg = world.lights.map(spec => ({ pos: spec.pos.clone(), color: spec.color, power: spec.power, kind: spec.kind, k: 0 }));
const worldPool = Array.from({ length: 8 }, () => { const l = new THREE.PointLight(0xffffff, 0, 80, 2); scene.add(l); return l; });
const torchFires = world.torches.map((p, i) => fx.addFire(scene, p, 0.17, 3 + i));
world.unlitTorches.forEach((p, i) => torchFires.push(fx.addFire(scene, p, 0.17, 20 + i, false)));
const camp = makeCamp(U, fx, 151, 56); scene.add(camp.group); torchFires.push(camp.fire);
const campLights = camp.lights.map(spec => { const l = new THREE.PointLight(spec.color, 0, 50, 2); l.position.copy(spec.pos); scene.add(l); return { l, color: spec.color, power: spec.power, kind: spec.kind }; });
for (const P of PORTS) scene.add(makeQuayLife(U, world.docks[P.id], P.seed ?? 0));
const lanternPool = Array.from({ length: 5 }, () => { const l = new THREE.PointLight(0xffb253, 0, 70, 2); scene.add(l); return l; });
const firePool = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xff8a38, 0, 60, 2); scene.add(l); return l; });
const lanternCol = new Col('#ffb253'), fireCol = new Col('#ff8a38');

// ---------- the game ----------
const G = createGame({ scene, U, fx, seed: +(Q.get('seed') || 7) });
let cur = lookAt(0.6, 0);
let lookOverride = null; // capture: a named look

// ---------- cameras ----------
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
const persp = new THREE.PerspectiveCamera(58, 1, 0.3, 4000);
let cam = ortho;
const view = { mode: 'deck', vh: 64, vhT: 64, az: 0, azOff: 38, el: 34, dist: 600, target: new V3(), pan: new V3(), yaw: 0, pitch: -0.04, dragYaw: 0, script: null, iso: null };
let W = 2, H = 2;
function placeOrtho(target, az, el, vh) {
  const a = D2R(az), e = D2R(el), asp = W / H;
  ortho.position.set(target.x + Math.cos(e) * Math.cos(a) * view.dist, target.y + Math.sin(e) * view.dist, target.z + Math.cos(e) * Math.sin(a) * view.dist);
  ortho.up.set(0, 1, 0); ortho.lookAt(target);
  ortho.top = vh / 2; ortho.bottom = -vh / 2; ortho.left = -vh / 2 * asp; ortho.right = vh / 2 * asp;
  ortho.near = view.dist - 300; ortho.far = view.dist + 900;
  ortho.updateProjectionMatrix(); ortho.updateMatrixWorld();
}
// the harbour camera looks at the quay you are moored at (for Port Rosalind: -44, -80)
const portView = () => { const P = (G.port && PORT_BY_ID[G.port.id]) || PORTS[0]; return { x: P.x - 4, z: P.moorZ - 16.8 }; };
const angLerp = (a, b, k) => a + (((b - a + 540) % 360) - 180) * k;
const _eye = new V3(), _fwd = new V3(), _up = new V3(), _tmp = new V3(), _tmp2 = new V3();
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function updateCamera(dt) {
  const p = G.player;
  if (view.iso) { placeOrtho(view.iso.target, view.iso.az, view.iso.el, view.iso.vh); return ortho; }
  if (view.mode === 'port') {
    const s = Math.sin(G.t * 0.05) * 3, hp = portView();
    placeOrtho(_tmp.set(hp.x + s, 4, hp.z), 58 + s, 36, 74); return ortho;
  }
  if (view.mode === 'deck' && p) {
    const T = p.T, wheelX = T.qd ? -T.L / 2 + T.qd.u * T.L - 1.6 : -T.L * 0.22;
    const deckY = (T.qd ? T.dMain + T.qd.h : T.dMain) + (T.poop ? 0 : 0);
    _eye.set(wheelX - 0.4, deckY + 2.05, 1.15).applyMatrix4(p.mesh.group.matrixWorld);
    const yaw = p.psi + view.yaw;
    _fwd.set(Math.cos(yaw) * Math.cos(view.pitch), Math.sin(view.pitch), -Math.sin(yaw) * Math.cos(view.pitch));
    persp.position.copy(_eye);
    _up.set(0, 1, 0).applyQuaternion(p.mesh.group.quaternion).lerp(_tmp.set(0, 1, 0), 0.65).normalize();
    persp.up.copy(_up); persp.lookAt(_tmp2.copy(_eye).add(_fwd));
    persp.aspect = W / H; persp.updateProjectionMatrix(); persp.updateMatrixWorld();
    return persp;
  }
  // chase and chart share one orthographic camera; the wheel slides between them
  view.vh += (view.vhT - view.vh) * (1 - Math.exp(-dt * 4));
  const zf = smoothstep(140, 420, view.vh);
  const follow = 180 - p.psi * R2D + view.azOff + view.dragYaw;
  view.az = angLerp(view.az, follow, 1 - Math.exp(-dt * 0.9));
  const az = angLerp(view.az, 90, zf);
  const el = 34 + 26 * zf;
  const lead = p.state === 'docked' ? 0 : Math.min(p.v, 8) * 2.2 * (1 - zf);
  _tmp.set(p.x + Math.cos(p.psi) * lead, 2, p.z - Math.sin(p.psi) * lead).add(view.pan);
  view.target.lerp(_tmp, 1 - Math.exp(-dt * 3));
  placeOrtho(view.target, az, el, view.vh);
  return ortho;
}
view.set = (mode) => {
  view.iso = null;
  if (mode === 'chase') { if (view.mode !== 'chase') { view.vh = 52; view.az = 180 - G.player.psi * R2D + view.azOff; view.target.set(G.player.x, 2, G.player.z); } view.mode = 'chase'; view.vhT = 64; view.pan.set(0, 0, 0); }
  else if (mode === 'chart') { if (view.mode !== 'chase') { view.vh = 200; view.az = 90; view.target.set(G.player.x, 2, G.player.z); } view.mode = 'chase'; view.vhT = 620; }
  else if (mode === 'deck') { view.mode = 'deck'; view.yaw = 0; view.pitch = -0.04; }
  else view.mode = mode;
};
view.zoom = (f) => {
  if (view.mode === 'port') return;
  if (view.mode === 'deck') { if (f < 1) return; view.set('chase'); view.vh = 30; view.vhT = 40; return; }
  view.vhT = Math.min(1400, Math.max(26, view.vhT * f)); // 1400 m tall shows the whole archipelago if (view.vhT < 200) view.pan.multiplyScalar(0.5);
};
view.name = () => view.mode === 'deck' ? 'deck' : view.mode === 'port' ? 'port' : view.vhT >= 200 ? 'chart' : 'chase';

// ---------- frame ----------
const post = new Post(renderer);
const P = {
  lightPos: Array.from({ length: NL }, () => new V3()), lightCol: Array.from({ length: NL }, () => new Col()),
  mist: new V4(), mistCol: new Col(), sunDir: new V3(), sunCol: new Col(), focus: 30, dofNear: 10, dofFar: 50, dofAmt: 0,
  exposure: 1, time: 0, night: 0, storm: 0, sunVisible: 1,
};
// graphics quality: internal resolution, shadows, mist and ambient occlusion. Picked from the frame rate on
// the first visit (then saved), and changed from the Sky menu.
const QUALITY = {
  low: { scale: 0.34, maxH: 420, shadow: 0, mist: 0, ao: 0 },
  medium: { scale: 0.42, maxH: 520, shadow: 1024, mist: 0.6, ao: 1 },
  high: { scale: 0.5, maxH: 620, shadow: 2048, mist: 1, ao: 1 },
};
let quality = 'high', qualitySaved = false;
try { const q = localStorage.getItem('bt-quality'); if (QUALITY[q]) { quality = q; qualitySaved = true; } } catch (e) { /* storage may be blocked */ }
export const pickQuality = avgMs => avgMs > 30 ? 'low' : avgMs > 20 ? 'medium' : 'high';
function applyQuality(q, save) {
  if (!QUALITY[q]) return;
  quality = q; const Qs = QUALITY[q];
  post.setSize(W, H, Qs.scale, Qs.maxH);
  sun.castShadow = Qs.shadow > 0;
  if (Qs.shadow && sun.shadow.mapSize.x !== Qs.shadow) { sun.shadow.mapSize.set(Qs.shadow, Qs.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (save) { qualitySaved = true; try { localStorage.setItem('bt-quality', q); } catch (e) { /* ignore */ } }
}
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(8, Math.floor(window.innerWidth * dpr)); H = Math.max(8, Math.floor(window.innerHeight * dpr));
  renderer.setSize(W, H, false);
  applyQuality(quality, false);
}

const _w = new V3(), _focus = new V3();
function applyLook(t, flash) {
  const c = cur;
  const dir = (el, az) => new V3(Math.cos(D2R(el)) * Math.cos(D2R(az)), Math.sin(D2R(el)), Math.cos(D2R(el)) * Math.sin(D2R(az))).normalize();
  const sd = dir(c.sun[2], c.sun[3]), fd = dir(c.fill[2], c.fill[3]);
  U.uSunDir.value.copy(sd); U.uMoonDir.value.copy(sd);
  U.uSunCol.value.copy(c.sun[0]).multiplyScalar(c.sun[1] / Math.PI);
  U.uSunVis.value = c.sunVis;
  U.uAmb.value.copy(c.hemi[0]).multiplyScalar(c.hemi[2] / Math.PI * (1 + flash * 3));
  U.uZenith.value.copy(c.zenith); U.uHorizon.value.copy(c.horizon); U.uSkyGlow.value.copy(c.glow);
  U.uNight.value = c.night; U.uStorm.value = c.storm; U.uFlash.value = flash;
  U.uFogCol.value.copy(c.fogC); U.uFogDensity.value = c.fogD;
  scene.fog.color.copy(c.fogC); scene.fog.density = c.fogD;
  U.uDeep.value.copy(c.deep); U.uShallow.value.copy(c.shallow); U.uFoamCol.value.copy(c.foam);
  U.uWaveAmp.value = c.wave; U.uCrestFoam.value = c.crest;
  sun.color.copy(c.sun[0]); sun.intensity = c.sun[1] * (1 + flash * 2);
  sun.position.copy(_focus).addScaledVector(sd, 350); sun.target.position.copy(_focus); sun.target.updateMatrixWorld();
  fill.color.copy(c.fill[0]); fill.intensity = c.fill[1]; fill.position.copy(_focus).addScaledVector(fd, 300); fill.target.position.copy(_focus); fill.target.updateMatrixWorld();
  hemi.color.copy(c.hemi[0]); hemi.groundColor.copy(c.hemi[1]); hemi.intensity = c.hemi[2] * (1 + flash * 3);
  const warm = new Col(1.0, 0.6, 0.24);
  U.glowMat.color.setRGB(0.05, 0.045, 0.04).lerp(warm.clone().multiplyScalar(3.4 * c.windows), Math.min(1, c.windows));
  const cand = [];
  const lampK = (r, i) => r.power * c.lamps * (r.kind === 'fire' ? 0.85 + 0.15 * Math.sin(t * 13 + i) * Math.sin(t * 7.3) : 0.94 + 0.06 * Math.sin(t * 9 + i * 3));
  reg.forEach((r, i) => { r.k = lampK(r, i); r.d = r.pos.distanceToSquared(_focus); if (r.d < 9e5) cand.push({ p: r.pos, c: r.color, k: r.k }); });
  const lit = reg.filter(r => r.d < 9e5).sort((a, b) => a.d / (a.power + 0.01) - b.d / (b.power + 0.01));
  worldPool.forEach((l, i) => { const r = lit[i]; if (!r) { l.intensity = 0; return; } l.position.copy(r.pos); l.color.copy(r.color); l.intensity = r.k * (r.kind === 'beacon' ? 140 : 50); });
  campLights.forEach((r, i) => { const k = lampK(r, i); r.l.intensity = k * 50; r.l.getWorldPosition(_w); cand.push({ p: _w.clone(), c: r.color, k }); });
  // ship lanterns: every ship feeds the water and the mist; the nearest five also light the scene
  const ships = G.ships.filter(s => s.alive && s.mesh.group.visible).map(s => { s.mesh.group.localToWorld(_w.copy(s.mesh.sternLight)); return { s, p: _w.clone(), d: _w.distanceToSquared(_focus) }; }).sort((a, b) => a.d - b.d);
  ships.forEach((o, i) => {
    const k = (o.s.role === 'player' ? 1.1 : 0.9) * c.lamps * (0.94 + 0.06 * Math.sin(t * 9 + i * 3)) * (o.s.state === 'sinking' ? Math.max(0, 1 - o.s.sinkT / 6) : 1);
    if (i < lanternPool.length) { lanternPool[i].position.copy(o.p); lanternPool[i].intensity = k * 50; }
    cand.push({ p: o.p, c: lanternCol, k });
  });
  for (let i = ships.length; i < lanternPool.length; i++) lanternPool[i].intensity = 0;
  const dyn = [];
  for (const f of fx.fires) {
    f.grp.getWorldPosition(_w); _w.y += 1.4 * f.size;
    const k = f.size * (f.size > 0.5 ? 2.2 : 4.0) * (0.85 + 0.15 * Math.sin(t * 13 + f.seed));
    cand.push({ p: _w.clone(), c: fireCol, k });
    if (!f.light.isLight) dyn.push({ p: _w.clone(), f, d: _w.distanceToSquared(_focus) });
  }
  dyn.sort((a, b) => a.d - b.d);
  firePool.forEach((l, i) => { const o = dyn[i]; if (o) { l.position.copy(o.p); l.intensity = (0.85 + 0.15 * Math.sin(t * 13 + o.f.seed) * Math.sin(t * 7.7)) * 260 * o.f.size; } else l.intensity = 0; });
  cand.sort((a, b) => a.p.distanceToSquared(_focus) / (a.k + 0.01) - b.p.distanceToSquared(_focus) / (b.k + 0.01));
  for (let i = 0; i < NL; i++) {
    const q = cand[i];
    if (!q || q.k <= 0) { U.uLightPos.value[i].set(0, -999, 0); U.uLightCol.value[i].set(0, 0, 0); P.lightPos[i].set(0, -999, 0); P.lightCol[i].setRGB(0, 0, 0); continue; }
    U.uLightPos.value[i].copy(q.p); U.uLightCol.value[i].set(q.c.r * q.k * 0.24, q.c.g * q.k * 0.24, q.c.b * q.k * 0.24);
    P.lightPos[i].copy(q.p); P.lightCol[i].setRGB(q.c.r * q.k * 0.9, q.c.g * q.k * 0.9, q.c.b * q.k * 0.9);
  }
  P.mist.set(...c.mist); P.mist.w *= QUALITY[quality].mist; P.ao = QUALITY[quality].ao; P.mistCol.copy(c.mistCol); P.mistNoise = c.mistNoise; P.sunDir.copy(sd); P.sunCol.copy(U.uSunCol.value);
  P.exposure = c.exposure; P.night = c.night; P.storm = c.storm; P.sunVisible = c.sunVis; P.sat = c.sat; P.lift = c.lift;
}

function wakes() {
  const list = G.ships.filter(s => s.alive && s.mesh.group.visible).sort((a, b) => Math.hypot(a.x - _focus.x, a.z - _focus.z) - Math.hypot(b.x - _focus.x, b.z - _focus.z));
  for (let i = 0; i < NS; i++) {
    const s = list[i];
    if (s) { U.uShips.value[i].set(s.x, s.z, s.psi, s.state === 'sinking' ? 0 : s.v); U.uShipDim.value[i].set(s.T.L / 2, s.T.B / 2, 1, 0); }
    else U.uShipDim.value[i].set(1, 1, 0, 0);
  }
}

const state = { lightning: 0, nextBolt: 6, acc: 0 };
const boltRnd = mulberry32((+(Q.get('seed') || 7) ^ 0x5bd1e995) >>> 0); // lightning only; separate from the sim RNG
const STEP = 1 / 60;
let hud = null, audio = null;
function simulate(dt) {
  state.acc = Math.min(state.acc + dt * G.timeScale, 0.25);
  while (state.acc >= STEP) { G.step(STEP); state.acc -= STEP; }
}
function render(dt) {
  const t = G.t;
  U.uTime.value = t;
  G.placeAll();
  fx.setBalls(G.balls);
  if (!lookOverride) cur = lookAt(G.phase, G.weather);
  cam = updateCamera(dt);
  if (view.iso) _focus.copy(view.iso.target);
  else if (view.mode === 'deck') _focus.copy(G.player.mesh.group.position).setY(2);
  else if (view.mode === 'port') { const hp = portView(); _focus.set(hp.x, 4, hp.z); }
  else _focus.copy(view.target);
  if (cur.storm > 0.6 && !capture) {
    if (t > state.nextBolt) { state.lightning = 1; state.nextBolt = t + 5 + boltRnd() * 9; fx.bolt.visible = true; fx.bolt.position.set(_focus.x + (boltRnd() - 0.5) * 260, 0, _focus.z - 120 - boltRnd() * 120); if (audio) audio.thunder(); }
    state.lightning *= Math.exp(-dt * 7); if (state.lightning < 0.05) fx.bolt.visible = false;
  } else if (!capture) { state.lightning = 0; fx.bolt.visible = false; }
  applyLook(t, state.lightning);
  wakes();
  fx.update(t, cam, cur.rain, _focus);
  sky.position.copy(cam.position);
  clouds.material.emissive.copy(U.uHorizon.value).multiplyScalar(0.4);
  U.uSunDirView.value.copy(U.uSunDir.value).transformDirection(cam.matrixWorldInverse);
  const farLod = view.mode === 'chase' && view.vh > 300 && !view.iso;
  for (const s of G.ships) s.mesh.setLod(farLod);
  P.dofAmt = view.iso && view.iso.dof ? view.iso.dof : 0;
  if (P.dofAmt) { const depthHalf = (view.iso.vh / 2) / Math.tan(D2R(view.iso.el)); P.focus = view.dist; P.dofNear = depthHalf * 0.34; P.dofFar = depthHalf * 0.75; }
  P.time = t;
  post.render(scene, cam, P);
  if (hud) hud.frame(dt);
  if (audio) audio.update(dt);
}

window.addEventListener('resize', resize);
resize();

const ctx = { G, view, renderer, get cam() { return cam; }, ortho, persp, scene, fx, setQuality: q => applyQuality(q, true), pickQuality, get quality() { return quality; }, get W() { return W; }, get H() { return H; } };

if (capture) {
  // look-development stills: a staged fleet, a named look, a fixed iso camera
  document.documentElement.classList.add('capture');
  const pool = {};
  window.__ld = {
    info() { return { dock: { x: world.dock.x, zShore: world.dock.zShore, end: world.dock.end.toArray() } }; },
    shot(o) {
      G.t = o.t; G.paused = true;
      lookOverride = true;
      cur = o.look ? (o.weather ? lookAt(PHASES[o.look] ?? 0.6, o.weather) : RESOLVED[o.look]) : lookAt(o.phase ?? 0.6, o.weather ?? 0);
      view.iso = { target: new V3(...o.iso.target), az: o.iso.az, el: o.iso.el, vh: o.iso.vh, dof: o.iso.dof || 0 };
      const live = [];
      for (const f of (o.fleet || [])) {
        let s = pool[f.id];
        if (s && (s.cls !== f.type || s.nation !== f.livery)) { G.remove(s); s = null; }
        if (!s) { s = G.spawn({ id: f.id, cls: f.type, nation: f.livery, role: 'merchant', x: f.x, z: f.z, psi: f.psi, v: f.v || 0, seed: f.seed ?? 3 }); pool[f.id] = s; }
        Object.assign(s, { x: f.x, z: f.z, psi: f.psi, v: f.v || 0, heel: f.heel || 0, state: 'sail' });
        s.mesh.group.visible = true; s.mesh.setFurled(!!f.furl); s.mesh.setFlag(f.flag || s.flagKind);
        live.push(s);
      }
      for (const s of G.ships) if (!live.includes(s)) s.mesh.group.visible = false;
      fx.clear();
      for (const f of [...fx.fires]) if (!torchFires.includes(f)) fx.dropFires([f]);
      for (const f of (o.fires || [])) fx.addFire(pool[f.ship] ? pool[f.ship].mesh.group : scene, new V3(...f.at), f.size, 11, false);
      G.placeAll();
      for (const b of (o.broadsides || [])) for (const age of b.ages) fx.broadside(pool[b.ship].mesh, b.side, b.target ? pool[b.target].mesh : null, o.t - age);
      if (o.serpent) G.serpent.stage(o.serpent); else G.serpent.hide();
      if (o.bolt) { fx.bolt.visible = true; fx.bolt.position.set(o.bolt[0], 0, o.bolt[1]); fx.bolt.rotation.y = o.bolt[2] || 0; } else fx.bolt.visible = false;
      state.lightning = o.lightning || 0;
      D.uBump.value = o.bump ?? 0.05;
      render(0);
      return true;
    },
  };
} else {
  // the game
  if (Q.get('skip') === 'attract') G.setupFree(); else G.setupAttract();
  if (G.attract) { view.mode = 'deck'; view.script = { t: 0 }; } else view.set('chase');
  if (Q.has('gold')) G.gold = +Q.get('gold');
  audio = createAudio(G, ctx);
  hud = createHud(ctx, audio);
  G.on('dock', () => { view.prev = view.name(); view.mode = 'port'; });
  G.on('undock', () => { view.set(view.prev === 'deck' ? 'deck' : 'chase'); });
  // attract-mode camera: deck, then drift out to the chase view; pull out to the chart after a prize
  G.on('won', () => { if (G.attract) view.script = { t: 0, chart: true }; });
  const attractCam = (dt) => {
    const S = view.script; if (!S || !G.attract || view.mode === 'port') return;
    S.t += dt;
    if (!S.chart && S.t > 9 && view.mode === 'deck') view.set('chase');
    if (S.chart) { if (S.t < 0.5) view.set('chart'); if (S.t > 7) { view.set('chase'); view.script = { t: 99 }; } }
  };
  ctx.step = (dt) => { if (!G.paused) simulate(dt); attractCam(dt); render(dt); };
  ctx.render = () => render(0);
  if (test) {
    window.__bt = {
      G, view, ctx, audio, post, quality: () => quality,
      advance(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (!G.paused) G.step(STEP); attractCam(STEP); updateCamera(STEP); if (hud) hud.tick(STEP); } render(STEP); return this.state(); },
      render() { render(STEP); },
      state() { const p = G.player; return { t: +G.t.toFixed(1), phase: +G.phase.toFixed(3), mode: view.name(), auto: G.autopilot, attract: G.attract, ai: G.ai.msg, docked: G.docked, gold: G.gold, rank: G.rank, prizes: G.prizes, p: { cls: p.cls, x: Math.round(p.x), z: Math.round(p.z), psi: +p.psi.toFixed(2), v: +p.v.toFixed(2), hull: Math.round(p.hull), crew: Math.round(p.crew), state: p.state }, ships: G.ships.map(s => `${s.name}/${s.cls}/${s.role}/${s.state}@${Math.round(s.x)},${Math.round(s.z)} h${Math.round(s.hull)}`), log: G.log.map(l => l.text) }; },
      hud,
    };
  } else {
    let last = performance.now(), frames = 0, spent = 0;
    const loop = (now) => {
      const raw = now - last, dt = Math.min(0.05, raw / 1000); last = now; ctx.step(dt);
      // first visit: watch frames 30-150, then pick a quality this machine can carry, and remember it
      if (!qualitySaved && ++frames > 30) { spent += raw; if (frames === 150) { const q = pickQuality(spent / 120); applyQuality(q, true); G.say('Graphics set to ' + q + ' for this machine (Sky menu to change).'); } }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
