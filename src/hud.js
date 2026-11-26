// The HUD: Cinderwatch-style pixel plates over the 3D sea, the port screen, and all input.
import * as THREE from 'three';
import { CLASSES, NATIONS, TYPES } from './ship.js';
import { GOODS, SHOTS, ISLANDS, compass, compassName, pointOfSail, wrap, headingTo } from './game.js';
import { PORTS, PORT_BY_ID } from './ports.js';
import { NATION_IDS, relation, standingWord, MARQUE_AT, CLOSED_BELOW, RANKS, BRETHREN_PRIZES } from './nations.js';
import { STYLES as RIVAL_STYLES } from './ladder.js';
import { autosave, listSaves, newestSave, loadSlot, exportCareer, importCareer } from './save.js';
import { phaseName } from './looks.js';
import { isWater } from './nav.js';
import { mulberry32, shuffled } from './util.js';

// ---------- pixel icons (8-9 px bitmaps -> crisp inline SVG) ----------
const PAL = { G: '#e8b04a', g: '#a8742a', Y: '#ffe2a0', B: '#e9dfc8', b: '#b9ad93', E: '#ff8a3c', e: '#c9481e', C: '#8fc7ff', c: '#4f86c6', S: '#9aa3b0', s: '#5b6472', W: '#8a6a48', w: '#5a4330', o: '#0b0d14', R: '#c4382b' };
const ICONS = {
  coin: ['..oooo..', '.oYYGGo.', 'oYGGGGgo', 'oYGgGGgo', 'oGGgGGgo', 'oGGGGggo', '.oGgggo.', '..oooo..'],
  crate: ['oooooooo', 'oWWWWWWo', 'owWwwWwo', 'oWwWWwWo', 'oWWwwWWo', 'owWwwWwo', 'oWWWWWWo', 'oooooooo'],
  skull: ['..ooooo..', '.oBBBBBo.', 'oBBBBBBBo', 'oBooBooBo', 'oBooBooBo', 'oBBBoBBBo', '.oBBBBBo.', '..oBoBo..', '...ooo...'],
  helm: ['....G....', '.G..G..G.', '..GgggG..', '..g...g..', 'GGg.G.gGG', '..g...g..', '..GgggG..', '.G..G..G.', '....G....'],
  sun: ['....Y....', '.Y..Y..Y.', '..YYYYY..', '..YGGGY..', 'YYYGGGYYY', '..YGGGY..', '..YYYYY..', '.Y..Y..Y.', '....Y....'],
  moon: ['...CCC...', '..CCc....', '.CCc.....', '.CCc.....', '.CCc.....', '.CCCc....', '..CCCCCC.', '...CCCC..'],
  storm: ['..SSS....', '.SSSSS.S.', 'SSSSSSSSS', '.sssssss.', '...Y.....', '..YY.....', '.YYYY....', '...Y.....', '..Y......'],
  anchor: ['...SSS...', '...S.S...', '...SSS...', '.SSSSSSS.', '....S....', 'S...S...S', 'SS..S..SS', '.SSSSSSS.', '...SSS...'],
  crown: ['G...G...G', 'GG.GGG.GG', 'GGGGGGGGG', 'GYGGYGGYG', 'GGGGGGGGG', 'ggggggggg'],
  hammer: ['.SSSSS...', '.SSSSSS..', '.SS..W...', '.....W...', '.....W...', '.....W...', '.....W...', '....WW...'],
  mug: ['.BBBBB...', 'BYYYYYB..', 'BGGGGGBBB', 'BGgGgGB.B', 'BGGGGGB.B', 'BGgGgGBBB', 'BGGGGGB..', '.BBBBB...'],
};
function svg(name) {
  const rows = ICONS[name]; if (!rows) return '';
  const w = Math.max(...rows.map(r => r.length)), h = rows.length;
  let r = '';
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = PAL[row[x]]; if (c) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; } });
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-US');
const FLAGS = { pirate: 'jolly', english: 'stgeorge', spanish: 'burgundy', french: 'fleur', dutch: 'prinsen' };

export function createHud(ctx, audio) {
  const { G, view } = ctx;
  for (const el of document.querySelectorAll('.ico[data-i]')) el.innerHTML = svg(el.dataset.i);
  const el = {};
  for (const id of ['gold', 'hold', 'rank', 'rankT', 'portName', 'portSub', 'shipFlag', 'shipRank', 'tod', 'todIco', 'where', 'dayBar', 'banner', 'bannerT', 'bannerS', 'log', 'capTitle', 'capLine', 'orders', 'helmBtn', 'shipName', 'shipCls', 'hullBar', 'hullN', 'sailBar', 'sailN', 'crewBar', 'crewN', 'gunP', 'gunS', 'speed', 'sailSet', 'pos', 'wind', 'caption', 'attract', 'paused', 'target', 'tFlag', 'tName', 'tCls', 'tHull', 'tHullN', 'tSails', 'tSailsN', 'tCrew', 'tCrewN', 'tRange', 'tState', 'oddsN', 'oddsBar', 'boardBtn', 'views', 'skymenu', 'skyBtn', 'soundBtn', 'pauseBtn', 'helpBtn', 'help', 'helpClose', 'lootConsortBtn', 'fleetPanel', 'fleetRows', 'continueBtn', 'savesBtn', 'saves', 'saveList', 'savesClose', 'importFile', 'loot', 'lootShip', 'lootGrid', 'lootShipBtn', 'port', 'portBody', 'marks', 'rose', 'flashScreen', 'shipPanel', 'helm', 'captain', 'purse', 'topc']) el[id] = $(id);
  const txt = (e, s) => { if (e.textContent !== s) e.textContent = s; };
  const pct = (e, k) => { const v = (Math.max(0, Math.min(1, k)) * 100).toFixed(1) + '%'; if (e.style.width !== v) e.style.width = v; };

  // ---------- 3D course marker and target ring ----------
  const amber = new THREE.Color(3.2, 2.0, 0.6);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.2, 32), new THREE.MeshBasicMaterial({ color: amber, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 20; ring.visible = false; ctx.scene.add(ring);
  const pathGeo = new THREE.BufferGeometry(); pathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 64), 3));
  const pathLine = new THREE.Line(pathGeo, new THREE.LineDashedMaterial({ color: amber, dashSize: 3, gapSize: 3, transparent: true, opacity: 0.8, depthWrite: false }));
  pathLine.renderOrder = 20; pathLine.frustumCulled = false; pathLine.visible = false; ctx.scene.add(pathLine);
  const tRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.045, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.62, 0.22), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  tRing.rotation.x = -Math.PI / 2; tRing.renderOrder = 20; tRing.visible = false; ctx.scene.add(tRing);

  // ---------- input ----------
  const keys = new Set();
  const take = () => { if (G.autopilot && (G.attract || true)) { G.takeHelm(); refreshCaptain(); } };
  const sailStep = d => { const p = G.player; const v = [0, 0.5, 1]; let i = v.indexOf(p.sailSet); if (i < 0) i = p.sailSet > 0.75 ? 2 : p.sailSet > 0.25 ? 1 : 0; p.sailSet = v[Math.max(0, Math.min(2, i + d))]; };
  const cycleShot = () => { const o = ['round', 'chain', 'grape']; G.player.shot = o[(o.indexOf(G.player.shot) + 1) % 3]; };
  const nearestFoe = () => { let b = null, bd = 1e9; const p = G.player; for (const s of G.ships) { if (s === p || !s.alive || s.state === 'sinking') continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; b = s; } } return b; };
  const doBoard = () => { const t = G.selected && G.selected.alive ? G.selected : nearestFoe(); if (t && G.canBoard(G.player, t)) { G.board(G.player, t); return true; } if (t) G.say(G.boarding ? 'Already boarding.' : 'Too far or too fast to board. Slow her with chain shot, then come alongside.', 'warn'); return false; };
  const togglePause = () => { if (G.docked || G.loot) return; G.paused = !G.paused; el.paused.hidden = !G.paused; audio.pause(G.paused); };
  const closeModals = () => { el.help.hidden = true; el.skymenu.hidden = true; el.skyBtn.setAttribute('aria-expanded', 'false'); el.orders.hidden = true; };
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    const k = e.key.toLowerCase();
    audio.unlock();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'escape') { closeModals(); G.selected = null; return; }
    if (k === '?' || k === 'f1') { el.help.hidden = !el.help.hidden; e.preventDefault(); return; }
    if (!el.help.hidden) { if (k === 'enter' || k === ' ') { el.help.hidden = true; e.preventDefault(); } return; }
    if (G.loot && !G.autopilot) { if (k === '1' || k === 'enter') G.takeLoot('cargo'); else if (k === '2') G.takeLoot('ship'); else if (k === '3') G.takeLoot('free'); else if (k === '4') G.takeLoot('consort'); return; }
    if (G.attract && !['shift', 'tab', 'm', 'l', '1', '2', '3', '?'].includes(k)) { take(); if (!'wasdqe '.includes(k)) return; }
    if (e.repeat && !'ad'.includes(k) && !['arrowleft', 'arrowright'].includes(k)) return;
    switch (k) {
      case 'a': case 'arrowleft': if (G.autopilot) take(); G.input.left = 1; keys.add('l'); break;
      case 'd': case 'arrowright': if (G.autopilot) take(); G.input.right = 1; keys.add('r'); break;
      case 'w': case 'arrowup': if (G.autopilot) take(); sailStep(1); break;
      case 's': case 'arrowdown': if (G.autopilot) take(); sailStep(-1); break;
      case 'q': if (G.autopilot) take(); G.fire(G.player, -1); break;
      case 'e': if (G.autopilot) take(); G.fire(G.player, 1); break;
      case 'r': cycleShot(); break;
      case 'b': if (G.autopilot) take(); doBoard(); break;
      case 'f': if (!G.dock()) G.say('Sail into a harbour first: Port Rosalind, Santa Catalina, Port Lys, Vlieghaven or Hangman\'s Cove.', 'warn'); break;
      case ' ': togglePause(); break;
      case '1': view.set('deck'); break;
      case '2': view.set('chase'); break;
      case '3': view.set('chart'); break;
      case 'h': if (G.autopilot) take(); else { el.orders.hidden = !el.orders.hidden; } refreshCaptain(); break;
      case 'm': audio.toggle(); break;
      case 'l': audio.captions = !audio.captions; break;
      default: return;
    }
    e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') G.input.left = 0;
    if (k === 'd' || k === 'arrowright') G.input.right = 0;
  });
  window.addEventListener('blur', () => { G.input.left = G.input.right = 0; });

  const canvas = ctx.renderer.domElement;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const toWorld = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, ctx.cam);
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  };
  const project = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(ctx.cam); const r = canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width, y: (1 - (v.y * 0.5 + 0.5)) * r.height, z: v.z }; };
  let drag = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    audio.unlock();
    canvas.focus({ preventScroll: true });
    drag = { x: e.clientX, y: e.clientY, b: e.button, moved: 0, lx: e.clientX, ly: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved < 6) return;
    if (view.mode === 'deck') { view.yaw -= dx * 0.004; view.pitch = Math.max(-0.6, Math.min(0.5, view.pitch - dy * 0.003)); return; }
    if (view.mode !== 'chase') return;
    if (drag.b === 2 || drag.b === 1 || e.shiftKey) view.dragYaw += dx * 0.35;
    else if (view.vhT >= 140) { // pan the chart
      const k = view.vh / canvas.clientHeight; const a = THREE.MathUtils.degToRad(90);
      view.pan.x -= dx * k; view.pan.z -= dy * k / Math.sin(THREE.MathUtils.degToRad(60)) * 0.9;
    } else view.dragYaw += dx * 0.35;
  });
  canvas.addEventListener('pointerup', e => {
    const d = drag; drag = null;
    if (!d || d.moved > 6 || d.b !== 0) return;
    if (G.attract) { take(); return; }
    click(e.clientX, e.clientY);
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoom(Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0022)); }, { passive: false });

  function click(cx, cy) {
    // ships first: nearest projected hull within a few pixels
    let best = null, bd = 1e9;
    const r = canvas.getBoundingClientRect();
    for (const s of G.ships) {
      if (!s.alive || s === G.player) continue;
      const q = project(s.x, 3, s.z); if (q.z > 1) continue;
      const size = Math.max(26, (s.T.L / (view.mode === 'deck' ? 20 : view.vh)) * r.height * 0.5);
      const d = Math.hypot(q.x - cx, q.y - cy);
      if (d < size && d < bd) { bd = d; best = s; }
    }
    if (best) { G.selected = best; audio.click(); return; }
    const w = toWorld(cx, cy);
    if (!w) return;
    if (G.docked) return;
    if (G.autopilot) take();
    // a click on the town or its harbour sails there and docks
    const town = PORTS.find(P => Math.hypot(w.x - P.x, w.z - (P.z - 50)) < 75);
    if (town && !isWater(w.x, w.z, -4)) { G.setCourse(G.player, town.x + 8, town.z + 8); G.autoDock = true; G.say('Course set for ' + town.name + '.'); return; }
    if (!isWater(w.x, w.z, -3)) { G.say('That is dry land, captain.', 'warn'); return; }
    G.setCourse(G.player, w.x, w.z); G.autoDock = false;
    if (G.player.sailSet < 0.5) G.player.sailSet = 1;
    audio.click();
  }

  // ---------- buttons ----------
  el.helmBtn.addEventListener('click', () => { audio.unlock(); if (G.autopilot) take(); else el.orders.hidden = !el.orders.hidden; refreshCaptain(); });
  for (const b of document.querySelectorAll('[data-order]')) b.addEventListener('click', () => { G.handHelm(b.dataset.order); el.orders.hidden = true; refreshCaptain(); });
  for (const b of document.querySelectorAll('[data-shot]')) b.addEventListener('click', () => { G.player.shot = b.dataset.shot; });
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => view.set(b.dataset.view));
  el.boardBtn.addEventListener('click', () => { if (G.autopilot) take(); doBoard(); });
  el.pauseBtn.addEventListener('click', togglePause);
  el.soundBtn.addEventListener('click', () => { audio.unlock(); audio.toggle(); });
  el.helpBtn.addEventListener('click', () => { el.help.hidden = !el.help.hidden; });
  el.helpClose.addEventListener('click', () => { el.help.hidden = true; });
  el.skyBtn.addEventListener('click', () => { el.skymenu.hidden = !el.skymenu.hidden; el.skyBtn.setAttribute('aria-expanded', String(!el.skymenu.hidden)); });
  const SKY = { day: 0.3, dusk: 0.6, night: 0.8 };
  for (const b of document.querySelectorAll('[data-sky]')) b.addEventListener('click', () => { G.phase = SKY[b.dataset.sky]; });
  for (const b of document.querySelectorAll('[data-q]')) b.addEventListener('click', () => { ctx.setQuality(b.dataset.q); for (const x of document.querySelectorAll('[data-q]')) x.setAttribute('aria-pressed', String(x.dataset.q === ctx.quality)); });
  for (const x of document.querySelectorAll('[data-q]')) x.setAttribute('aria-pressed', String(x.dataset.q === ctx.quality));
  for (const b of document.querySelectorAll('[data-wx]')) b.addEventListener('click', () => { G.weatherTarget = +b.dataset.wx; G.weather = +b.dataset.wx; G.nextWeather = 400; });
  for (const b of document.querySelectorAll('[data-loot]')) b.addEventListener('click', () => G.takeLoot(b.dataset.loot));
  for (const b of document.querySelectorAll('[data-port]')) b.addEventListener('click', () => { if (b.dataset.port === 'leave') { G.leavePort(); return; } if (G.port) { G.port.screen = b.dataset.port; renderPort(); } });

  // ---------- saves ----------
  let saves = { newest: newestSave(), count: listSaves().filter(s => s.d).length }; // re-read only when a save changes
  const refreshSaves = () => { saves = { newest: newestSave(), count: listSaves().filter(s => s.d).length }; };
  const afterLoad = () => { el.saves.hidden = true; el.help.hidden = true; refreshSaves(); refreshCaptain(); };
  const when = ms => { try { return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  function showSaves() {
    el.saveList.innerHTML = listSaves().map(({ slot, d }) => d
      ? `<div class="slot"><span><b>Slot ${slot} · ${d.ship.name}</b><br><span class="dim">${CLASSES[d.ship.cls].name} at ${PORT_BY_ID[d.port].name} · ${fmt(Math.round(d.gold))} gold · ${d.rank ? '#' + d.rank : 'unranked'} · ${when(d.savedAt)}</span></span><button data-slot="${slot}">Load</button></div>`
      : `<div class="slot"><span class="dim">Slot ${slot} · empty</span><span></span></div>`).join('');
    for (const b of el.saveList.querySelectorAll('[data-slot]')) b.addEventListener('click', () => { audio.unlock(); loadSlot(G, +b.dataset.slot); afterLoad(); });
    el.saves.hidden = false;
  }
  el.continueBtn.addEventListener('click', () => { audio.unlock(); if (saves.newest && loadSlot(G, saves.newest.slot)) afterLoad(); });
  el.savesBtn.addEventListener('click', showSaves);
  el.savesClose.addEventListener('click', () => { el.saves.hidden = true; });
  el.importFile.addEventListener('change', async () => {
    const f = el.importFile.files[0]; el.importFile.value = ''; if (!f) return;
    const err = await importCareer(G, f);
    if (err) { G.say(err, 'warn'); G.flash('Import failed', err, 4); } else { afterLoad(); G.flash('Career imported', 'Saved to slot ' + G.slot, 4); }
  });
  G.on('dock', () => { if (autosave(G)) { refreshSaves(); G.say('Career saved to slot ' + G.slot + '.'); } });
  G.on('undock', () => { if (autosave(G)) refreshSaves(); });

  function refreshCaptain() {
    const A = G.autopilot;
    // the trailer offers to pick up a saved career; once you sail, the plate is yours
    el.continueBtn.hidden = !(G.attract && saves.newest);
    el.savesBtn.hidden = !(G.attract && saves.count > 1);
    if (saves.newest) { const h = 'Continue<span class="sub">' + saves.newest.d.ship.name + ' at ' + PORT_BY_ID[saves.newest.d.port].name + '</span>'; if (el.continueBtn._h !== h) { el.continueBtn.innerHTML = h; el.continueBtn._h = h; } }
    txt(el.capTitle, A ? (G.attract ? 'AI captain' : 'AI captain · ' + (G.order === 'hunt' ? 'hunting' : G.order === 'trade' ? 'trading' : 'to port')) : 'You have the helm');
    txt(el.helmBtn, A ? 'Take the helm' : el.orders.hidden ? 'Hand to AI captain (H)' : 'Keep the helm');
    el.helmBtn.classList.toggle('go', A);
  }

  // ---------- compass ----------
  const rc = el.rose.getContext('2d');
  function px(x, y, c) { rc.fillStyle = c; rc.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function line(x0, y0, x1, y1, c) { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))); for (let i = 0; i <= n; i++) px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); }
  function drawRose() {
    const p = G.player, cx = 32, cy = 32, R = 29;
    rc.clearRect(0, 0, 64, 64);
    // face
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d < R + 1.5) { rc.fillStyle = d > R - 0.5 ? '#6b5236' : d > R - 2.5 ? '#14161f' : '#0c0f17'; rc.fillRect(x, y, 1, 1); } }
    // rotate so the view's "up" is up in chase/deck; north-up in chart
    const zf = view.name() === 'chart' ? 1 : 0;
    const camAz = view.mode === 'deck' ? (p.psi + view.yaw) : null;
    let up; // compass heading (deg) that points up on the rose
    if (view.mode === 'deck') up = compass(camAz);
    else if (view.mode === 'port' || zf) up = 0;
    else up = compass(Math.PI - (view.az * Math.PI / 180)) ; // camera looks along -offset
    const ang = deg => (deg - up) * Math.PI / 180; // compass deg -> screen angle from up, clockwise
    const P = (deg, r) => [cx + Math.sin(ang(deg)) * r, cy - Math.cos(ang(deg)) * r];
    // no-go wedge around the wind source
    const wfrom = compass(G.wind.from), nogo = p.C.point;
    for (let a = -nogo; a <= nogo; a += 2) { const [x, y] = P(wfrom + a, R - 4); line(cx, cy, x, y, 'rgba(229,85,60,0.16)'); }
    // ticks
    for (let i = 0; i < 16; i++) { const [x0, y0] = P(i * 22.5, R - 2), [x1, y1] = P(i * 22.5, R - (i % 4 ? 4 : 6)); line(x0, y0, x1, y1, i % 4 ? '#4a4033' : '#b3a98f'); }
    const [nx, ny] = P(0, R - 11);
    rc.fillStyle = '#e5553c'; rc.font = '10px "BT Pixel"'; rc.textBaseline = 'alphabetic';
    rc.fillText('N', Math.round(nx - 2), Math.round(ny + 3.5));
    // wind: an arrow blowing across the face
    const wto = (wfrom + 180) % 360;
    const [w0x, w0y] = P(wfrom, R - 6), [w1x, w1y] = P(wto, R - 8);
    line(w0x, w0y, w1x, w1y, '#8fc7ff');
    const [h1x, h1y] = P(wto + 16, R - 14), [h2x, h2y] = P(wto - 16, R - 14);
    line(w1x, w1y, h1x, h1y, '#8fc7ff'); line(w1x, w1y, h2x, h2y, '#8fc7ff');
    // ship heading
    const hd = compass(p.psi);
    const [s0x, s0y] = P(hd, R - 7), [s1x, s1y] = P(hd + 180, R - 16), [sl1x, sl1y] = P(hd + 150, R - 15), [sl2x, sl2y] = P(hd - 150, R - 15);
    line(s1x, s1y, s0x, s0y, '#e8b04a'); line(s0x, s0y, sl1x, sl1y, '#e8b04a'); line(s0x, s0y, sl2x, sl2y, '#e8b04a');
    px(cx, cy, '#ffe2a0');
  }

  // ---------- chart marks ----------
  const isl = ISLANDS.map(i => { const d = document.createElement('div'); d.className = 'isl' + (i.port ? ' harbour' : ''); if (i.port) d.innerHTML = `<i class="flag ${FLAGS[i.nation]}"></i> `; d.append(i.name); el.marks.appendChild(d); return { i, d }; });
  const marks = new Map(), sightMarks = new Map(), zoneMarks = {};
  function updateMarks() {
    const chart = view.mode === 'chase' && view.vh > 180;
    const op = chart ? Math.min(1, (view.vh - 180) / 120) : 0;
    el.marks.style.opacity = op;
    if (!op) return;
    for (const { i, d } of isl) { const q = project(i.x, 6, i.z); d.style.left = q.x + 'px'; d.style.top = q.y + 'px'; }
    for (const [key, Z, on, label] of [['boss', G.boss.zone, G.boss.known && !G.boss.defeated, 'The Black Wake'], ['serpent', G.serpentZone, G.serpent.known, 'Serpent water']]) {
      let d = zoneMarks[key];
      if (!d) { d = zoneMarks[key] = document.createElement('div'); d.className = 'zone'; d.innerHTML = `<i></i><span>${label}</span>`; el.marks.appendChild(d); }
      d.hidden = !on; if (!on) continue;
      const c = project(Z.x, 0, Z.z), e = project(Z.x + Z.r, 0, Z.z), r = Math.hypot(e.x - c.x, e.y - c.y);
      d.style.left = c.x + 'px'; d.style.top = c.y + 'px'; d.firstChild.style.width = d.firstChild.style.height = 2 * r + 'px';
    }
    const seenS = new Set();
    for (const S of G.ladder.sightings) {
      seenS.add(S.id);
      let d = sightMarks.get(S.id);
      if (!d) { d = document.createElement('div'); d.className = 'isl sighting'; d.textContent = '✕ ' + G.ladder.byId(S.id).name; el.marks.appendChild(d); sightMarks.set(S.id, d); }
      const q = project(S.x, 2, S.z); d.style.left = q.x + 'px'; d.style.top = q.y + 'px';
    }
    for (const [id, d] of sightMarks) if (!seenS.has(id)) { d.remove(); sightMarks.delete(id); }
    const seen = new Set();
    for (const s of G.ships) {
      if (!s.alive) continue; seen.add(s);
      let m = marks.get(s);
      if (!m) { m = document.createElement('div'); m.innerHTML = '<i></i><span></span>'; el.marks.appendChild(m); marks.set(s, m); }
      const q = project(s.x, 2, s.z);
      m.className = 'mk ' + (s.state === 'struck' ? 'struck' : s.role);
      m.style.left = q.x + 'px'; m.style.top = q.y + 'px';
      const rot = -(compass(s.psi) - (view.mode === 'chase' ? compass(Math.PI - view.az * Math.PI / 180) * (view.vh > 400 ? 0 : 0) : 0));
      m.firstChild.style.transform = `rotate(${compass(s.psi) - 0}deg)`;
      const label = s.role === 'player' || s.rival || s === G.selected ? s.name : '';
      if (m.lastChild.textContent !== label) m.lastChild.textContent = label;
    }
    for (const [s, m] of marks) if (!seen.has(s)) { m.remove(); marks.delete(s); }
  }

  // ---------- port screen ----------
  const RUMOURS = [
    'A Spanish treasure galleon is overdue from the south. Her captain fears the Teeth.',
    'Hendrik de Vries pays well for powder delivered quiet and quick.',
    'Fishermen swear something big and grey surfaced off Lantern Rock last new moon.',
    'The English frigate Resolution hunts anyone flying the black. Keep your colours furled near the fort.',
    'Calico Ned buried more than rum on Cayo Palma. Ask him and he laughs.',
    'Tobacco sells dear in Port Rosalind this season. Sugar is cheap as sand.',
    'The Dutch in Vlieghaven will pay well for sugar and timber. They never have enough of either.',
    "Hangman's Cove buys powder and silver and asks no questions about where it came from.",
    'Santa Catalina ships silver north under escort. The escorts are thinner every month.',
  ];
  // things to hunt: the boss once you are on the Ladder, then the serpent; hearing of one marks its water
  function huntRumour() {
    const B = G.boss, S = G.serpent;
    if (!B.defeated && !B.known && G.rank !== null) { B.known = true; return `Corvin Vane’s Black Wake, a black frigate under red sails, hunts the water ${B.zone.name}. He takes the wind, opens with chain shot and boards the crippled. <span class="amber">Marked on your chart.</span>`; }
    if (!S.known) { S.known = true; return `Fishermen swear a serpent rises ${G.serpentZone.name} when the sky turns black. Broadsides to its back are the only thing that hurts it. <span class="amber">Marked on your chart.</span>`; }
    return null;
  }
  // a sighting of a famous captain: they linger there for ten minutes, and the spot goes on your chart
  const placeName = (x, z) => { const i = ISLANDS.reduce((a, b) => Math.hypot(b.x - x, b.z - z) < Math.hypot(a.x - x, a.z - z) ? b : a); return Math.hypot(i.x - x, i.z - z) < 260 ? 'off ' + i.name : 'in open water, ' + compassName(compass(headingTo(x - i.x, z - i.z))) + ' of ' + i.name; };
  function rivalRumour() {
    const r = G.ladder.rumour(G.port.rumourSeed ^ 0x5157); if (!r) return null;
    const rank = G.ladder.rankOf(r);
    return `${r.name}, #${rank} on the Ladder, ${RIVAL_STYLES[r.style].label}, was seen ${placeName(r.x, r.z)} in a ${CLASSES[r.cls].name.toLowerCase()}. <span class="amber">Marked on your chart.</span>`;
  }
  // one rumour is a real tip from the markets: the best thing to carry from this port, as prices stand
  function tradeTip(here) {
    const P0 = G.prices(here); let best = null;
    for (const g of GOODS) for (const Q of PORTS) { if (Q.id === here) continue; const gain = G.prices(Q.id)[g.id].sell - P0[g.id].buy; if (!best || gain > best.gain) best = { g, Q, gain, buy: P0[g.id].buy, sell: G.prices(Q.id)[g.id].sell }; }
    return best && best.gain > 4 ? `${best.g.name} costs ${best.buy} a unit here. In ${best.Q.name} they pay ${best.sell}, or so the sailors say.` : 'Nobody here knows of a cargo worth the voyage this week.';
  }
  function renderPort() {
    const s = G.port ? G.port.screen : 'menu', p = G.player, body = el.portBody;
    for (const b of document.querySelectorAll('[data-port]')) b.setAttribute('aria-pressed', String(b.dataset.port === s));
    const PD = PORT_BY_ID[G.port ? G.port.id : 'rosalind'];
    txt(el.portName, PD.name); txt(el.portSub, PD.blurb + ' · ' + PD.governor);
    const head = (h, lede) => `<h2 class="fell">${h}</h2><p class="lede">${lede}</p>`;
    const purse = `<div class="summary"><span class="stat"><i class="ico">${svg('coin')}</i>${fmt(G.gold)} gold</span><span class="stat"><i class="ico">${svg('crate')}</i>${G.holdUsed()}/${G.holdCap()} in the hold</span></div>`;
    let h = '';
    if (s === 'menu') {
      const rc = G.repairCost();
      h = head('The harbour', PD.harbour) + purse +
        `<div class="cards">
          <div class="card"><b class="fell">Sell the whole hold</b><span class="dim">At this port's prices</span><button data-act="sellall" ${G.holdUsed() ? '' : 'disabled'}>Sell all</button></div>
          <div class="card"><b class="fell">Repair the ${G.consorts().length ? 'fleet' : p.name}</b><span class="dim">${rc ? rc + ' gold for hull and sails' : G.consorts().length ? 'All three are sound' : 'She is sound'}</span><button data-act="repair" ${rc && G.gold >= rc ? '' : 'disabled'}>Repair</button></div>
          <div class="card"><b class="fell">Hire to full crew</b><span class="dim">${G.fleet().reduce((a, s) => a + s.maxCrew - Math.round(s.crew), 0)} berths · 6 gold a head</span><button data-act="hirefull" ${G.fleet().some(s => s.crew < s.maxCrew) && G.gold >= 6 ? '' : 'disabled'}>Hire</button></div>
          <div class="card"><b class="fell">Captain's log</b><span class="dim">${G.slot ? 'Saved to slot ' + G.slot + ' at every port' : 'Saved at every port once you have the helm'}</span><button data-act="export">Export career</button><button data-act="import">Import career</button></div>
        </div>`;
    } else if (s === 'market') {
      const P = G.port.prices;
      const stolenTag = id => G.stolen[id] > 0 ? ` <span class="ember">· ${G.stolen[id]} stolen</span>` : '';
      const tag = id => stolenTag(id) + (PD.makes.includes(id) ? ' <span class="dim">· made here</span>' : PD.needs.includes(id) ? ' <span class="ember">· wanted</span>' : '');
      const list = ids => { const n = ids.map(id => GOODS.find(g => g.id === id).name.toLowerCase()); return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n[0]; };
      h = head('Market', PD.name + ' makes ' + list(PD.makes) + ' cheap, and pays well for ' + list(PD.needs) + '. ' + (PD.nation === 'pirate' ? (G.brethren ? 'Stolen cargo fetches 30% more here, brother.' : 'The Brethren get 30% more for stolen cargo here.') : 'Prices move with every sale and drift back over the days.')) + purse +
        `<table class="tbl"><tr><th>Goods</th><th>Hold</th><th>Sell</th><th>Buy</th><th></th></tr>` +
        GOODS.map(g => `<tr><td>${g.name}${tag(g.id)}</td><td>${G.cargo[g.id]}</td><td class="ok">${P[g.id].sell}</td><td class="amber">${P[g.id].buy}</td><td><button data-trade="${g.id}:-10" aria-label="Sell 10 ${g.name}" ${G.cargo[g.id] ? '' : 'disabled'}>−10</button> <button data-trade="${g.id}:10" aria-label="Buy 10 ${g.name}" ${G.gold >= P[g.id].buy && G.holdRoom() > 0 ? '' : 'disabled'}>+10</button></td></tr>`).join('') + `</table>`;
    } else if (s === 'shipwright') {
      const rc = G.repairCost(), F = G.fleet(), sel = F[Math.min(G.port.fit || 0, F.length - 1)];
      const pickShip = F.length > 1 ? `<div class="fitsel">${F.map((s, i) => `<button data-fit="${i}" aria-pressed="${s === sel}">${s.name}</button>`).join('')}</div>` : '';
      const up = (k, label, what) => { const c = G.upgradeCost(k, sel); return `<div class="card"><b class="fell">${label} ${'+'.repeat(sel.up[k])}</b><span class="dim">${what}</span><button data-up="${k}" data-ship="${F.indexOf(sel)}" ${c !== null && G.gold >= c ? '' : 'disabled'}>${c === null ? 'Fully fitted' : c + ' gold'}</button></div>`; };
      const tradeIn = Math.round(CLASSES[p.cls].price * 0.5 * (p.hull / p.maxHull));
      h = head('Shipwright', 'Mistress Penhallow runs the slip. She judges a ship by the sound its planks make.') + purse +
        pickShip + `<div class="cards"><div class="card"><b class="fell">Repairs${F.length > 1 ? ' · whole fleet' : ''}</b><span class="dim">${sel.name}: hull ${Math.round(sel.hull)}/${sel.maxHull} · sails ${Math.round(sel.sails)}/${sel.maxSails}</span><button data-act="repair" ${rc && G.gold >= rc ? '' : 'disabled'}>${rc ? 'Repair · ' + rc + ' gold' : 'Nothing to mend'}</button></div>` +
        up('hull', 'Oak doubling', '+10% hull') + up('sails', 'New canvas', '+6% speed') + up('guns', 'Drilled gun crews', '−10% reload') + `</div>` +
        `<h2 class="fell" style="margin-top:calc(var(--px)*8)">Ships for sale</h2><p class="lede">Trade-in for your ${CLASSES[p.cls].name.toLowerCase()}: ${tradeIn} gold.</p><div class="cards">` +
        ['sloop', 'schooner', 'brigantine', 'frigate'].map(k => { const C = CLASSES[k]; const own = k === p.cls; return `<div class="card"><b class="fell">${C.name}</b><span class="dim">${C.role}</span><div class="kv"><span>Guns</span><b>${C.guns}</b><span>Crew</span><b>${C.crew}</b><span>Hold</span><b>${C.hold}</b><span>Speed</span><b>${C.knots} kn</b></div><button data-buy="${k}" ${!own && G.gold + tradeIn >= C.price ? '' : 'disabled'}>${own ? 'Your ship' : fmt(C.price) + ' gold'}</button></div>`; }).join('') + `</div>`;
    } else if (s === 'tavern') {
      const r = (G.port.rumours = G.port.rumours || [tradeTip(G.port.id), rivalRumour(), huntRumour() || shuffled(RUMOURS, mulberry32(G.port.rumourSeed))[0]].filter(Boolean));
      h = head(PD.tavern, PD.tavernLine) + purse +
        `<div class="cards"><div class="card"><b class="fell">Sign on hands</b><span class="dim">Crew ${Math.round(p.crew)}/${p.maxCrew} · 6 gold a head</span><button data-act="hire10" ${p.crew < p.maxCrew && G.gold >= 60 ? '' : 'disabled'}>Hire 10</button><button data-act="hirefull" ${p.crew < p.maxCrew && G.gold >= 6 ? '' : 'disabled'}>Hire to full</button></div></div>` +
        `<h2 class="fell" style="margin-top:calc(var(--px)*8)">Rumours</h2>` + r.map(x => `<p class="rumour">${x}</p>`).join('');
    } else if (s === 'governor') {
      // standing with every crown and the Brethren, your commission, and what this port can offer you
      const C = G.commission, cls = v => v >= MARQUE_AT ? 'ok' : v >= -2 ? '' : v >= CLOSED_BELOW ? 'amber' : 'ember';
      const stand = id => { const v = G.standing[id] || 0; return `<td class="${cls(v)}">${standingWord(v)}</td><td>${v > 0 ? '+' : ''}${Math.round(v)}</td>`; };
      const towards = n => !C ? '' : n === C.nation ? 'Your flag' : relation(C.nation, n) === 'war' ? '<span class="ember">At war</span>' : relation(C.nation, n) === 'allied' ? 'Allied' : 'At peace';
      const rows = NATION_IDS.map(n => `<tr><td><i class="flag ${FLAGS[n]}"></i> ${NATIONS[n].name}</td>${stand(n)}<td>${towards(n)}</td></tr>`).join('') +
        `<tr><td><i class="flag jolly"></i> The Brethren</td>${stand('pirate')}<td>${G.brethren ? 'Your brothers' : ''}</td></tr>`;
      const next = C && RANKS[C.rank + 1];
      const commission = C
        ? `<div class="card"><b class="fell">${RANKS[C.rank].name} of ${NATIONS[C.nation].name}</b><span class="dim">${C.prizes} prize${C.prizes === 1 ? '' : 's'} taken${next ? ' · ' + next.name + ' at ' + next.prizes + ' (' + next.gold + ' gold)' : ' · the highest rank'}</span>${PD.nation === C.nation ? '<button data-act="resign">Return the letter</button>' : ''}</div>`
        : G.brethren ? `<div class="card"><b class="fell">Brother of the Coast</b><span class="dim">Pirates leave you be. The cove pays 30% more for stolen cargo.</span></div>`
        : `<div class="card"><b class="fell">No commission</b><span class="dim">You sail under the black flag. Every navy may take an interest.</span></div>`;
      let offer = '';
      if (PD.nation === 'pirate') {
        offer = G.brethren ? '' : `<div class="card"><b class="fell">The Brethren of the Coast</b><span class="dim">${G.commission ? 'No captain with a letter of marque may swear the articles.' : G.prizes < BRETHREN_PRIZES ? 'Take a prize first. The Brethren want proof.' : 'Swear the articles: pirates leave you alone, and the cove pays more for stolen cargo.'}</span><button data-act="brethren" ${G.canJoinBrethren() ? '' : 'disabled'}>Swear the articles</button></div>`;
      } else if (!C || C.nation !== PD.nation) {
        const v = G.standing[PD.nation] || 0;
        offer = `<div class="card"><b class="fell">Letter of marque</b><span class="dim">${G.brethren ? 'The crown does not commission sworn pirates.' : v >= MARQUE_AT ? 'Sail for ' + NATIONS[PD.nation].name + ': ' + NATION_IDS.filter(x => relation(PD.nation, x) === 'war').map(x => NATIONS[x].adj).join(' and ') + ' ships become lawful prizes, paid and promoted.' : 'Needs standing ' + MARQUE_AT + ' with ' + NATIONS[PD.nation].name + ' (yours: ' + Math.round(v) + '). Trade here, or take their enemies\' ships.'}</span><button data-act="marque" ${G.canMarque() ? '' : 'disabled'}>Accept the letter</button></div>`;
      }
      h = head(PD.governor, PD.govLine) + `<div class="cards">${commission}${offer}</div>` +
        `<table class="tbl" style="margin-top:calc(var(--px)*6)"><tr><th>Crown</th><th>Standing</th><th></th><th>${C ? 'To your flag' : ''}</th></tr>${rows}</table>`;
    } else if (s === 'board') {
      // the top ten, then the captains around you
      const T = G.ladder.table(), you = T.findIndex(x => x.you), show = new Set([...Array(10).keys()]);
      if (you >= 0) for (let i = you - 2; i <= you + 2; i++) if (i >= 0 && i < T.length) show.add(i);
      let last = -1, rows = '';
      for (const i of [...show].sort((a, b) => a - b)) {
        if (i > last + 1) rows += `<tr><td colspan="4" class="dim">⋮</td></tr>`;
        const x = T[i];
        rows += x.you ? `<tr class="you"><td>#${i + 1}</td><td class="l">You · ${G.title()}</td><td><i class="flag ${G.colours()}"></i></td><td>${fmt(G.fame)}</td></tr>`
          : `<tr><td>#${i + 1}</td><td class="l">${x.r.name}</td><td><i class="flag ${FLAGS[x.r.nation]}"></i></td><td>${fmt(x.r.fame)}</td></tr>`;
        last = i;
      }
      if (you < 0) rows += `<tr class="you"><td>–</td><td class="l">You · take a prize to be known</td><td><i class="flag ${G.colours()}"></i></td><td>${fmt(G.fame)}</td></tr>`;
      h = head('Harbour board', 'Bounties nailed over bounties. In the middle, under glass, the Ladder of Famous Captains. Beat a captain to take their place.') +
        `<table class="tbl"><tr><th>Rank</th><th class="l">Captain</th><th>Flag</th><th>Fame</th></tr>${rows}</table>` +
        `<h2 class="fell" style="margin-top:calc(var(--px)*8)">Bounties</h2><p class="rumour">500 gold: the pirate sloop Merry Widow, last seen off Gull Cay.</p><p class="rumour">250 gold: news of the Spanish galleon San Telmo's route.</p>`;
    }
    body.innerHTML = h;
    for (const b of body.querySelectorAll('[data-act]')) b.addEventListener('click', () => { const a = b.dataset.act; if (a === 'sellall') { const s2 = G.sellAll(); if (s2) G.flash('+' + s2 + ' gold', 'Sold the hold'); } if (a === 'repair') G.repair(); if (a === 'hire10') G.hire(10); if (a === 'hirefull') G.hire(G.fleet().reduce((t, s) => t + s.maxCrew - Math.round(s.crew), 0)); if (a === 'marque') G.acceptMarque(); if (a === 'resign') G.resignMarque(); if (a === 'brethren') G.joinBrethren(); if (a === 'export') G.say('Exported the career to ' + exportCareer(G) + '.'); if (a === 'import') { el.importFile.click(); return; } renderPort(); });
    for (const b of body.querySelectorAll('[data-trade]')) b.addEventListener('click', () => { const [id, n] = b.dataset.trade.split(':'); G.trade(id, +n); renderPort(); });
    for (const b of body.querySelectorAll('[data-up]')) b.addEventListener('click', () => { G.upgrade(b.dataset.up, G.fleet()[+b.dataset.ship || 0]); renderPort(); });
    for (const b of body.querySelectorAll('[data-fit]')) b.addEventListener('click', () => { G.port.fit = +b.dataset.fit; renderPort(); });
    for (const b of body.querySelectorAll('[data-buy]')) b.addEventListener('click', () => { G.buyShip(b.dataset.buy); renderPort(); });
  }
  G.on('dock', () => { el.port.hidden = false; G.port.screen = 'menu'; renderPort(); });
  G.on('undock', () => { el.port.hidden = true; });
  G.on('coin', () => { if (!el.port.hidden) {} });

  // ---------- per-frame update ----------
  let tick = 0, bannerKey = null, drawn = false;
  function frame(dt) {
    tick += dt;
    const p = G.player, A = G.autopilot;
    // purse
    txt(el.gold, fmt(G.gold)); txt(el.hold, G.holdUsed() + '/' + G.holdCap()); txt(el.rank, G.rank === null ? 'Unranked' : '#' + G.rank); txt(el.rankT, G.rank === null ? '' : G.title());
    // time
    const pn = phaseName(G.phase), wx = G.weather > 0.7 ? 'Storm' : G.weather > 0.3 ? 'Squall' : 'Clear';
    txt(el.tod, pn + ' · ' + wx);
    const ico = G.weather > 0.5 ? 'storm' : pn === 'Night' ? 'moon' : 'sun';
    if (el.todIco.dataset.i !== ico) { el.todIco.dataset.i = ico; el.todIco.innerHTML = svg(ico); }
    pct(el.dayBar, G.phase);
    let near = ISLANDS.reduce((a, b) => Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a);
    const nd = Math.hypot(near.x - p.x, near.z - p.z);
    txt(el.where, G.docked ? 'Moored' : nd < 260 ? 'Off ' + near.name : 'Open sea');
    // banner
    const B = G.banner;
    if (B && G.t - B.t < B.dur) { if (bannerKey !== B) { bannerKey = B; txt(el.bannerT, B.text); txt(el.bannerS, B.sub || ''); } el.banner.classList.add('on'); } else el.banner.classList.remove('on');
    // log
    const L = G.log.slice(0, 4);
    const html = L.map(l => `<li class="${l.kind}" style="opacity:${Math.max(0, Math.min(1, 1 - (G.t - l.t - 9) / 3))}">${l.text}</li>`).join('');
    if (el.log._h !== html) { el.log.innerHTML = html; el.log._h = html; }
    el.log.style.visibility = G.docked ? 'hidden' : 'visible';
    // captain
    el.attract.hidden = !G.attract || G.docked;
    refreshCaptain();
    txt(el.capLine, A ? (G.docked ? 'Selling and refitting in port' : G.docking ? 'Coming alongside the quay' : G.ai.msg) : G.course ? 'Course set · any WASD key takes it back' : 'WASD to sail · Q/E to fire · H for orders');
    el.capLine.className = A ? 'amber' : 'dim';
    // ship
    const cons = G.consorts();
    el.fleetPanel.hidden = !cons.length || G.docked;
    if (cons.length) { const fh = cons.map(s => `<div class="frow" title="${s.name}, ${CLASSES[s.cls].name.toLowerCase()}"><span class="fname">${s.name}</span><div class="bar"><i style="width:calc(${Math.max(0, s.hull / s.maxHull) * 100}% - var(--px)*2)"></i></div><b>${Math.round(s.crew)}</b></div>`).join(''); if (el.fleetRows._h !== fh) { el.fleetRows.innerHTML = fh; el.fleetRows._h = fh; } }
    txt(el.shipName, p.name); txt(el.shipCls, CLASSES[p.cls].name);
    const rk = G.commission ? RANKS[G.commission.rank].name + ' of ' + NATIONS[G.commission.nation].name : G.brethren ? 'Brother of the Coast' : '';
    txt(el.shipRank, rk); el.shipRank.hidden = !rk;
    const fk = 'flag ' + G.colours(); if (el.shipFlag.className !== fk) el.shipFlag.className = fk;
    pct(el.hullBar, p.hull / p.maxHull); txt(el.hullN, String(Math.max(0, Math.round(p.hull))));
    pct(el.sailBar, p.sails / p.maxSails); txt(el.sailN, String(Math.round(p.sails)));
    pct(el.crewBar, p.crew / p.maxCrew); txt(el.crewN, String(Math.round(p.crew)));
    const R = G.reloadTime(p);
    for (const [e2, side] of [[el.gunP, -1], [el.gunS, 1]]) { const k = 1 - p.reload[side] / R; pct(e2.querySelector('i'), k); e2.classList.toggle('ready', p.reload[side] <= 0); }
    for (const b of document.querySelectorAll('[data-shot]')) b.setAttribute('aria-pressed', String(b.dataset.shot === p.shot));
    // helm
    txt(el.speed, G.speedKn(p).toFixed(1));
    txt(el.sailSet, p.state === 'docked' ? 'Moored' : p.sailSet >= 0.99 ? 'Full sail' : p.sailSet >= 0.49 ? 'Half sail' : 'Sails furled');
    const off = Math.abs(wrap(p.psi - G.wind.from));
    txt(el.pos, pointOfSail(off) + ' · ' + compassName(compass(p.psi)));
    txt(el.wind, 'Wind ' + compassName(compass(G.wind.from)) + ' · ' + Math.round(G.wind.speed * 12) + ' kn');
    if (tick > 0.1 || !drawn) { drawRose(); tick = 0; drawn = true; }
    // target
    let t = G.selected && G.selected.alive ? G.selected : null;
    if (!t) { let bd = 260; for (const s of G.ships) { if (s === p || !s.alive || s.state === 'sinking') continue; if (!G.hostile(p, s) && s.role !== 'merchant') continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; t = s; } } }
    el.target.hidden = !t || G.docked;
    if (t && !G.docked) {
      const fk = t.flagKind === 'white' ? 'white' : t.flagKind === 'captured' ? 'jolly' : FLAGS[t.nation];
      if (el.tFlag._k !== fk) { el.tFlag.className = 'flag ' + fk; el.tFlag._k = fk; }
      txt(el.tName, t.name); txt(el.tCls, (t.rival ? '#' + G.ladder.rankOf(G.ladder.byId(t.rival)) + ' on the Ladder · ' : NATIONS[t.nation].adj + ' ') + CLASSES[t.cls].name.toLowerCase() + ' · ' + t.C.guns + ' guns');
      pct(el.tHull, t.hull / t.maxHull); txt(el.tHullN, String(Math.max(0, Math.round(t.hull))));
      pct(el.tSails, t.sails / t.maxSails); txt(el.tSailsN, String(Math.round(t.sails)));
      pct(el.tCrew, t.crew / t.maxCrew); txt(el.tCrewN, String(Math.round(t.crew)));
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      txt(el.tRange, Math.round(d) + ' m');
      txt(el.tState, t.state === 'struck' ? 'Struck' : t.state === 'sinking' ? 'Sinking' : t.state === 'flee' ? 'Fleeing' : t.state === 'engage' ? 'Hostile' : t.state === 'boarding' ? 'Boarding' : '');
      const o = G.odds(p, t);
      pct(el.oddsBar, o); txt(el.oddsN, Math.round(o * 100) + '%');
      el.boardBtn.disabled = !G.canBoard(p, t);
    }
    // pause, loot
    el.paused.hidden = !G.paused;
    const showLoot = !!G.loot && !G.autopilot;
    el.loot.hidden = !G.loot;
    if (G.loot && el.loot._for !== G.loot) {
      el.loot._for = G.loot; const Lt = G.loot, b = Lt.ship;
      txt(el.lootShip, 'The ' + b.name + ', ' + NATIONS[b.nation].adj + ' ' + CLASSES[b.cls].name.toLowerCase());
      el.lootGrid.innerHTML = `<span>Gold</span><b class="amber">+${fmt(Lt.gold)}</b>` + Lt.goods.map(([id, n]) => `<span>${GOODS.find(g => g.id === id).name}</span><b>${n}</b>`).join('') + `<span>Men lost</span><b class="ember">${Lt.lost}</b>`;
      el.lootShipBtn.disabled = CLASSES[b.cls].guns < G.player.C.guns * 0.8;
      el.lootShipBtn.textContent = el.lootShipBtn.disabled ? 'Too small to take as flagship' : 'Take her as your flagship';
      el.lootConsortBtn.disabled = G.consorts().length >= 2;
      el.lootConsortBtn.textContent = el.lootConsortBtn.disabled ? 'Your fleet is full (3 ships)' : 'Keep her as a consort';
      for (const bt of el.loot.querySelectorAll('button')) bt.tabIndex = showLoot ? 0 : -1;
    }
    for (const bt of el.loot.querySelectorAll('button')) bt.style.pointerEvents = showLoot ? 'auto' : 'none';
    // port
    el.port.hidden = !G.docked;
    for (const id of ['shipPanel', 'helm', 'views']) el[id].style.visibility = G.docked ? 'hidden' : 'visible';
    el.views.style.visibility = 'visible';
    for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view.name()));
    txt(el.pauseBtn, G.paused ? 'Resume' : 'Pause');
    txt(el.soundBtn, audio.muted ? 'Sound off' : 'Sound on');
    // captions
    const cap = audio.captions && !G.docked ? audio.caption() : '';
    txt(el.caption, cap);
    // 3D markers
    const course = !A && p.path && p.wp < p.path.length && !G.docked;
    ring.visible = pathLine.visible = !!course;
    if (course) {
      const pts = [[p.x, p.z], ...p.path.slice(p.wp)];
      const arr = pathGeo.attributes.position.array; let n = 0;
      for (let i = 0; i < pts.length - 1 && n < 63; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; if (i === 0) { arr.set([ax, 0.6, az], 0); n = 1; } arr.set([bx, 0.6, bz], n * 3); n++; }
      pathGeo.setDrawRange(0, n); pathGeo.attributes.position.needsUpdate = true; pathLine.computeLineDistances();
      const [ex, ez] = pts[pts.length - 1]; ring.position.set(ex, 0.7, ez); const s = 1 + 0.12 * Math.sin(G.t * 4) + view.vh / 120; ring.scale.setScalar(s);
    }
    const sel = G.selected && G.selected.alive && G.selected.state !== 'sinking' ? G.selected : null;
    tRing.visible = !!sel && view.mode !== 'deck';
    if (sel) { tRing.position.set(sel.x, 0.8, sel.z); tRing.scale.setScalar(sel.T.L * 0.62); }
    updateMarks();
  }
  refreshCaptain();
  return { frame, tick: (dt) => { tick += dt; }, renderPort, el };
}
