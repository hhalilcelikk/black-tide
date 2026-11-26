// Broadside effects (muzzle flash, dithered cannon smoke, splashes), gulls and storm rain.
import * as THREE from 'three';
import { Geo, C, V, mat, roughen } from './geo.js';
import { mulberry32 } from './util.js';

const MAXP = 260, MAXF = 40, MAXS = 60;

export function makeFx(U) {
  const rnd = mulberry32(99);
  const group = new THREE.Group();
  // smoke: soft, lit billboards (lanterns, fires and flashes glow through them)
  const sgeo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  sgeo.index = quad.index; sgeo.setAttribute('position', quad.attributes.position); sgeo.setAttribute('uv', quad.attributes.uv);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3), iPar = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4);
  iPos.setUsage(THREE.DynamicDrawUsage); iPar.setUsage(THREE.DynamicDrawUsage);
  sgeo.setAttribute('iPos', iPos); sgeo.setAttribute('iPar', iPar); sgeo.instanceCount = 0;
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uAmb: U.uAmb, uSunCol: U.uSunCol, uSunDir: U.uSunDir, uLightPos: U.uLightPos, uLightCol: U.uLightCol, uFlashPos: { value: new THREE.Vector3() }, uFlash: { value: 0 }, emissive: { value: new THREE.Color() } },
    vertexShader: `attribute vec3 iPos; attribute vec4 iPar; varying vec2 vUv; varying vec4 vPar; varying vec3 vW;
      void main(){ vUv = uv; vPar = iPar;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float c = cos(iPar.w * 6.28), s = sin(iPar.w * 6.28); vec2 q = mat2(c, s, -s, c) * position.xy * iPar.x;
        vW = iPos + right * q.x + up * q.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `#define NL ${14}
      uniform vec3 uAmb, uSunCol, uSunDir, uFlashPos; uniform float uFlash; uniform vec3 uLightPos[NL]; uniform vec3 uLightCol[NL];
      varying vec2 vUv; varying vec4 vPar; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0;
        float sd = vPar.w * 17.0;
        float n = n2(vUv * 2.6 + sd) * 0.5 + n2(vUv * 5.2 - sd) * 0.3 + n2(vUv * 10.5 + sd * 0.5) * 0.2;
        float a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.9) * vPar.y * smoothstep(2.5, 10.0, length(cameraPosition - vW)); // fade puffs that drift through the deck camera
        if (a < 0.004) discard;
        float shade = 0.5 + 0.5 * clamp(n * 1.3 - 0.15 + (vUv.y - 0.5) * 0.7, 0.0, 1.0);
        vec3 base = mix(vec3(0.74, 0.72, 0.69), vec3(0.12, 0.11, 0.1), vPar.z);
        vec3 lit = uAmb * 2.3 + uSunCol * (0.25 + 0.55 * shade);
        for (int i = 0; i < NL; i++) { vec3 d = uLightPos[i] - vW; lit += uLightCol[i] * 2.4 / (dot(d, d) * 0.06 + 1.0); }
        vec3 fd = uFlashPos - vW; lit += vec3(5.0, 2.5, 0.8) * uFlash / (dot(fd, fd) * 0.06 + 1.0);
        gl_FragColor = vec4(base * lit * shade, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const smoke = new THREE.Mesh(sgeo, smokeMat);
  smoke.frustumCulled = false; smoke.renderOrder = 10;
  const alpha = { array: [], needsUpdate: false };
  const puffs = [];
  // muzzle flashes
  const fg = new THREE.IcosahedronGeometry(1, 0);
  const flash = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 4.5, 1.4) }), MAXF);
  flash.frustumCulled = false;
  const flashes = [];
  // splashes: a crown of jagged spikes
  const sg = new Geo(5, 0.08);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, rr = 0.6 + (i % 3) * 0.25, h = 1.6 + (i % 4) * 0.7;
    sg.add(new THREE.ConeGeometry(0.28, h, 4), mat(Math.cos(a) * rr, h / 2, Math.sin(a) * rr, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35), C('#f2f6f4'));
  }
  sg.add(new THREE.ConeGeometry(0.45, 3.6, 5), mat(0, 1.8, 0), C('#ffffff'));
  const splash = new THREE.InstancedMesh(sg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }), MAXS);
  splash.frustumCulled = false;
  const splashes = [];
  // gulls: a V of two wings; flapping = scaling the V through itself
  const gg = new Geo(8, 0);
  gg.tri(V(0, 0, 0), V(-0.35, 0.05, 0), V(0.05, 0.18, 1.1), C('#f1efe9'));
  gg.tri(V(0, 0, 0), V(0.05, 0.18, -1.1), V(-0.35, 0.05, 0), C('#e6e3db'));
  gg.tri(V(0.05, 0.18, 1.1), V(0.15, 0.12, 1.0), V(0.0, 0.17, 1.35), C('#2a2826'));
  gg.tri(V(0.05, 0.18, -1.1), V(0.0, 0.17, -1.35), V(0.15, 0.12, -1.0), C('#2a2826'));
  gg.box(0.6, 0.16, 0.16, mat(0.0, 0.0, 0), C('#f4f2ec'));
  const NG = 14;
  const gulls = new THREE.InstancedMesh(gg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), NG);
  gulls.frustumCulled = false;
  const gullData = Array.from({ length: NG }, (_, i) => ({ c: i < 8 ? V(-40 + rnd() * 50, 0, -60 + rnd() * 40) : V(rnd() * 120 - 60, 0, rnd() * 80 - 20), r: 14 + rnd() * 30, h: 16 + rnd() * 22, s: (0.25 + rnd() * 0.2) * (rnd() < 0.5 ? -1 : 1), p: rnd() * 6 }));
  // rain streaks in a box around the view's focus, sized to cover the screen (uSize metres across)
  const NR = 14000, rp = new Float32Array(NR * 6), ra = new Float32Array(NR * 2);
  for (let i = 0; i < NR; i++) {
    const x = rnd() * 50 - 25, y = rnd() * 40, z = rnd() * 50 - 25;
    rp.set([x, y, z, x, y, z], i * 6); ra[i * 2] = 0; ra[i * 2 + 1] = 1;
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rgeo.setAttribute('aEnd', new THREE.BufferAttribute(ra, 1));
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uAmb: U.uAmb, uSize: { value: 50 } },
    vertexShader: /* glsl */`
      uniform float uTime, uAmt, uSize; uniform vec3 uCam; attribute float aEnd;
      void main(){
        // the streaks were laid out in a 50 m box; stretch it to uSize so the rain always fills the view
        float k = uSize / 50.0, h = 40.0 * min(k, 2.0);
        vec3 p = position * vec3(k, h / 40.0, k);
        p.y = mod(p.y - uTime * 21.0 * min(k, 2.0), h) - 4.0 + uCam.y;
        p.x = mod(p.x - uCam.x + uSize * 0.5 + uTime * 4.0, uSize) - uSize * 0.5 + uCam.x;
        p.z = mod(p.z - uCam.z + uSize * 0.5, uSize) - uSize * 0.5 + uCam.z;
        p += vec3(-0.18, 0.75, 0.0) * aEnd * min(k, 2.0);
        if (uAmt < 0.01) p = vec3(0.0, -1000.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 uAmb; void main(){ gl_FragColor = vec4(uAmb * 0.95 + 0.04, 1.0); }`,
  });
  const rain = new THREE.LineSegments(rgeo, rainMat);
  rain.frustumCulled = false;

  // cannonballs in flight and wood splinters from hits
  const NB = 260, ballMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.035, 0.032, 0.03) }), NB);
  ballMesh.frustumCulled = false; ballMesh.count = 0;
  const NSP = 220, spl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4a2c'), roughness: 0.9 }), NSP);
  spl.frustumCulled = false; spl.count = 0;
  const splinters = [];
  group.add(smoke, flash, splash, gulls, rain, ballMesh, spl);
  const flashLight = new THREE.PointLight(0xffa64a, 0, 90, 2);
  group.add(flashLight);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  const wind = V(1.6, 0, 0.9);

  function broadside(ship, side, target, t) {
    const guns = side > 0 ? ship.guns.star : ship.guns.port;
    const out = V(0, 0, side).applyQuaternion(ship.group.quaternion);
    guns.forEach((g, i) => {
      const w = g.clone().applyMatrix4(ship.group.matrixWorld);
      const t0 = t + i * 0.11 + rnd() * 0.04;
      flashes.push({ p: w.clone().addScaledVector(out, 0.8), t0, life: 0.16, s: 1.5 + rnd() * 0.6 });
      for (let k = 0; k < 10; k++) {
        puffs.push({ p: w.clone().addScaledVector(out, 0.6 + k * 0.6), v: out.clone().multiplyScalar(5 + rnd() * 6 - k).add(V((rnd() - 0.5) * 1.5, 0.6 + rnd() * 0.6, (rnd() - 0.5) * 1.5)), t0: t0 + k * 0.03, life: 6 + rnd() * 3, s0: 0.6 + rnd() * 0.4, s1: 3.0 + rnd() * 2.4, rot: rnd() * 6 });
      }
      if (target) {
        const tp = target.group.position;
        const hit = rnd() < 0.35;
        const sp = hit ? tp.clone().add(V((rnd() - 0.5) * 12, 1.5, (rnd() - 0.5) * 4)) : tp.clone().add(V((rnd() - 0.5) * 34, 0, (rnd() - 0.5) * 30));
        const dt = 0.5 + w.distanceTo(tp) / 140;
        if (hit) for (let k = 0; k < 3; k++) puffs.push({ p: sp.clone(), v: V((rnd() - 0.5) * 2, 1.2, (rnd() - 0.5) * 2), t0: t0 + dt, life: 4 + rnd() * 2, s0: 0.5, s1: 2.2, rot: rnd() * 6, dark: true });
        else splashes.push({ p: V(sp.x, 0, sp.z), t0: t0 + dt, life: 1.4 + rnd() * 0.5, s: 0.8 + rnd() * 0.6 });
      }
    });
    return { center: guns[Math.floor(guns.length / 2)].clone().applyMatrix4(ship.group.matrixWorld), t0: t };
  }

  // the game's own cannon fire: flashes and smoke, returns muzzle positions in world space
  function muzzle(ship, side, t) {
    const guns = side > 0 ? ship.guns.star : ship.guns.port;
    const out = V(0, 0, side).applyQuaternion(ship.group.quaternion);
    return guns.map((g, i) => {
      const w = g.clone().applyMatrix4(ship.group.matrixWorld);
      const t0 = t + i * 0.11 + rnd() * 0.04;
      flashes.push({ p: w.clone().addScaledVector(out, 0.8), t0, life: 0.16, s: 1.5 + rnd() * 0.6 });
      for (let k = 0; k < 7; k++) puffs.push({ p: w.clone().addScaledVector(out, 0.6 + k * 0.6), v: out.clone().multiplyScalar(5 + rnd() * 6 - k).add(V((rnd() - 0.5) * 1.5, 0.6 + rnd() * 0.6, (rnd() - 0.5) * 1.5)), t0: t0 + k * 0.03, life: 5 + rnd() * 3, s0: 0.6 + rnd() * 0.4, s1: 3.0 + rnd() * 2.4, rot: rnd() * 6 });
      return w.addScaledVector(out, 0.9);
    });
  }
  function hit(p, t, rig) {
    for (let k = 0; k < (rig ? 1 : 3); k++) puffs.push({ p: p.clone(), v: V((rnd() - 0.5) * 2, 1.2, (rnd() - 0.5) * 2), t0: t, life: 3 + rnd() * 2, s0: 0.5, s1: rig ? 1.4 : 2.4, rot: rnd() * 6, dark: true });
    flashes.push({ p: p.clone(), t0: t, life: 0.1, s: 0.8 });
    if (!rig) for (let k = 0; k < 7; k++) splinters.push({ p: p.clone(), v: V((rnd() - 0.5) * 9, 3 + rnd() * 6, (rnd() - 0.5) * 9), r: V(rnd() * 6, rnd() * 6, rnd() * 6), t0: t, life: 1.6 + rnd() * 0.6 });
  }
  function splashAt(p, t, s = 0.8) { splashes.push({ p: V(p.x, 0, p.z), t0: t, life: 1.2 + rnd() * 0.5, s: s * (0.8 + rnd() * 0.4) }); }
  function skirmish(p, t) {
    flashes.push({ p: p.clone().add(V((rnd() - 0.5) * 2, rnd(), (rnd() - 0.5) * 2)), t0: t, life: 0.08, s: 0.45 });
    puffs.push({ p: p.clone(), v: V((rnd() - 0.5) * 1.5, 1.0, (rnd() - 0.5) * 1.5), t0: t, life: 2.5, s0: 0.4, s1: 1.6, rot: rnd() * 6 });
  }
  function setBalls(list) {
    let n = 0;
    for (const b of list) { if (b.delay > 0 || n >= NB) continue; const s = b.shot === 'grape' ? 0.55 : b.shot === 'chain' ? 1.25 : 1; _m.compose(_p.set(b.x, b.y, b.z), _q.identity(), _s.set(s, s, s)); ballMesh.setMatrixAt(n++, _m); }
    ballMesh.count = n; ballMesh.instanceMatrix.needsUpdate = true;
  }

  let lastFlash = null;
  function update(t, cam, rainAmt, focus, rainSize = 50) {
    rainMat.uniforms.uSize.value = rainSize;
    let n = 0;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i], a = t - p.t0;
      if (a > p.life) { puffs.splice(i, 1); continue; }
      if (a < 0 || n >= MAXP) continue;
      const k = a / p.life, e = 1 - Math.pow(1 - Math.min(1, a / 2.2), 3);
      const drag = (1 - Math.exp(-a * 1.3)) / 1.3;
      _p.copy(p.p).addScaledVector(p.v, drag).addScaledVector(wind, a).add(_s.set(0, a * 0.35, 0));
      const sz = (p.s0 + (p.s1 - p.s0) * e) * 1.35;
      iPos.array[n * 3] = _p.x; iPos.array[n * 3 + 1] = _p.y; iPos.array[n * 3 + 2] = _p.z;
      iPar.array[n * 4] = sz; iPar.array[n * 4 + 1] = Math.min(1, a * 6) * Math.pow(1 - k, 1.3) * (p.dark ? 0.55 : 0.5);
      iPar.array[n * 4 + 2] = p.dark ? 0.85 : 0.08 + k * 0.25; iPar.array[n * 4 + 3] = p.rot / 6.28 + a * 0.02;
      n++;
    }
    sgeo.instanceCount = n; iPos.needsUpdate = true; iPar.needsUpdate = true;
    let nf = 0, fl = 0;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], a = t - f.t0;
      if (a > f.life) { flashes.splice(i, 1); continue; }
      if (a < 0 || nf >= MAXF) continue;
      const s = f.s * (0.6 + a / f.life);
      _m.compose(f.p, _q.identity(), _s.set(s, s, s));
      flash.setMatrixAt(nf++, _m);
      fl += 1 - a / f.life;
      lastFlash = f.p;
    }
    flash.count = nf; flash.instanceMatrix.needsUpdate = true;
    flashLight.intensity = Math.min(fl, 2.5) * 1400;
    if (lastFlash) { flashLight.position.copy(lastFlash); smokeMat.uniforms.uFlashPos.value.copy(lastFlash); }
    smokeMat.uniforms.uFlash.value = Math.min(fl, 2.5);
    let ns = 0;
    for (let i = splashes.length - 1; i >= 0; i--) {
      const sp = splashes[i], a = t - sp.t0;
      if (a > sp.life) { splashes.splice(i, 1); continue; }
      if (a < 0 || ns >= MAXS) continue;
      const k = a / sp.life, h = Math.sin(Math.PI * Math.pow(k, 0.6)) * sp.s;
      _m.compose(sp.p, _q.identity(), _s.set(sp.s * (0.7 + k), Math.max(0.01, h), sp.s * (0.7 + k)));
      splash.setMatrixAt(ns++, _m);
    }
    splash.count = ns; splash.instanceMatrix.needsUpdate = true;
    let nsp = 0;
    for (let i = splinters.length - 1; i >= 0; i--) {
      const q = splinters[i], a = t - q.t0;
      if (a > q.life || a < -1) { splinters.splice(i, 1); continue; }
      if (a < 0 || nsp >= NSP) continue;
      _p.copy(q.p).addScaledVector(q.v, a); _p.y -= 4.9 * a * a; if (_p.y < -0.2) { _p.y = -0.2; }
      _q.setFromEuler(_e.set(q.r.x * a, q.r.y * a, q.r.z * a));
      _m.compose(_p, _q, _s.set(1, 1, 1)); spl.setMatrixAt(nsp++, _m);
    }
    spl.count = nsp; spl.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NG; i++) {
      const d = gullData[i], a = d.p + t * d.s;
      _p.set(d.c.x + Math.cos(a) * d.r, d.h + Math.sin(t * 0.4 + d.p) * 2, d.c.z + Math.sin(a) * d.r);
      const flap = Math.sin(t * (7 + (i % 3)) + d.p);
      _q.setFromEuler(_e.set(0, -a - Math.sign(d.s) * Math.PI / 2, Math.sin(a) * 0.2 * Math.sign(d.s), 'YXZ'));
      _m.compose(_p, _q, _s.set(1, flap > -0.2 ? Math.max(0.2, flap) : flap, 1));
      gulls.setMatrixAt(i, _m);
    }
    gulls.instanceMatrix.needsUpdate = true;
    rainMat.uniforms.uCam.value.copy(focus || cam.position);
    rainMat.uniforms.uAmt.value = rainAmt;
    return fl;
  }
  // ---- fires: flames, embers, a flickering light and a column of dark smoke ----
  const fg2 = new Geo(21, 0.12);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; fg2.add(new THREE.ConeGeometry(0.34 + (i % 3) * 0.12, 1.5 + (i % 4) * 0.5, 4), mat(Math.cos(a) * 0.45, 0.75, Math.sin(a) * 0.45, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3), C('#ffffff')); }
  fg2.add(new THREE.ConeGeometry(0.55, 2.6, 5), mat(0, 1.3, 0), C('#ffffff'));
  const flameGeo = fg2.build();
  const outerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 1.35, 0.2) });
  const innerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.2, 1.4) });
  const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.2, 0.5) });
  const emberGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const fires = [];
  function addFire(parent, local, size, seed = 1, withLight = true) {
    const grp = new THREE.Group(); grp.position.copy(local); grp.scale.setScalar(size);
    const outer = new THREE.Mesh(flameGeo, outerMat), inner = new THREE.Mesh(flameGeo, innerMat);
    inner.scale.setScalar(0.55);
    const emb = new THREE.InstancedMesh(emberGeo, emberMat, 36); emb.frustumCulled = false;
    // a fire without its own light gets one from the shared pool (adding lights at run time recompiles shaders)
    const light = withLight ? new THREE.PointLight(0xff8a38, 0, 60, 2) : new THREE.Object3D(); light.position.set(0, 1.4, 0);
    grp.add(outer, inner, emb, light); parent.add(grp);
    const f = { grp, outer, inner, emb, light, seed, size, lastSmoke: null };
    fires.push(f); return f;
  }
  const _w = new THREE.Vector3();
  function updateFires(t, spawn) {
    for (const f of fires) {
      const s = f.seed;
      f.outer.scale.set(1 + 0.12 * Math.sin(t * 11 + s), 1 + 0.22 * Math.sin(t * 7.3 + s * 2) + 0.1 * Math.sin(t * 17.1), 1 + 0.12 * Math.cos(t * 9.1 + s));
      f.inner.scale.set(0.55 + 0.08 * Math.sin(t * 13 + s), 0.55 + 0.15 * Math.sin(t * 9.7 + s), 0.55 + 0.08 * Math.cos(t * 12 + s));
      f.outer.rotation.y = t * 0.7 + s; f.inner.rotation.y = -t * 1.1;
      if (f.light.isLight) f.light.intensity = (0.85 + 0.15 * Math.sin(t * 13 + s) * Math.sin(t * 7.7)) * 260 * f.size;
      for (let i = 0; i < 36; i++) {
        const ph = (t * 0.42 + i * 0.0731 + s * 0.37) % 1;
        const r = 0.3 + ph * 1.8;
        _p.set(Math.sin(i * 12.99 + t * 0.8) * r, 0.6 + ph * 7.5, Math.cos(i * 78.23 + t * 0.6) * r);
        const k = (1 - ph) * 1.1;
        _m.compose(_p, _q.identity(), _s.set(k, k, k));
        f.emb.setMatrixAt(i, _m);
      }
      f.emb.instanceMatrix.needsUpdate = true;
      if (spawn && f.size > 0.4) {
        f.grp.getWorldPosition(_w);
        if (f.lastSmoke === null || t - f.lastSmoke > 9) f.lastSmoke = t - 7;
        while (f.lastSmoke < t) {
          f.lastSmoke += 0.22;
          puffs.push({ p: _w.clone().add(V(0, 2.2 * f.size, 0)), v: V((rnd() - 0.5) * 1.2, 3.2 + rnd() * 1.5, (rnd() - 0.5) * 1.2), t0: f.lastSmoke, life: 7 + rnd() * 2, s0: 0.9 * f.size, s1: (3.2 + rnd() * 1.8) * f.size, rot: rnd() * 6, dark: true });
        }
      }
    }
  }
  // ---- lightning bolt ----
  const bg = new Geo(31, 0);
  { let p = V(0, 260, 0); const r2 = mulberry32(77); const pts = [p.clone()];
    while (p.y > 0) { p = p.clone().add(V((r2() - 0.5) * 26, -18 - r2() * 16, (r2() - 0.5) * 18)); if (p.y < 0) p.y = 0; pts.push(p); }
    for (let i = 0; i < pts.length - 1; i++) { bg.rod(pts[i], pts[i + 1], 1.1, 1.1, 4, C('#ffffff')); if (i % 3 === 1) { const b = pts[i].clone().add(V((r2() - 0.5) * 40, -30, (r2() - 0.5) * 20)); bg.rod(pts[i], b, 0.6, 0.6, 4, C('#ffffff')); } }
  }
  const bolt = new THREE.Mesh(bg.build(), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 15, 22) }));
  bolt.visible = false; bolt.frustumCulled = false;
  group.add(bolt);
  function dropFires(list) { for (const f of list) { const i = fires.indexOf(f); if (i >= 0) fires.splice(i, 1); if (f.grp.parent) f.grp.parent.remove(f.grp); } }
  return { group, broadside, muzzle, hit, splash: splashAt, skirmish, setBalls, dropFires, update(t, cam, rainAmt, focus, rainSize) { const r = update(t, cam, rainAmt, focus, rainSize); updateFires(t, true); return r; }, flashLight, smokeMat, addFire, fires, bolt,
    clear() { puffs.length = 0; flashes.length = 0; splashes.length = 0; splinters.length = 0; for (const f of fires) f.lastSmoke = null; } };
}
