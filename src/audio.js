// Sound made in code: sea and wind beds, cannon with a generated reverb tail, splashes, splinters,
// a bell on docking, and "Drunken Sailor" (traditional) on a concertina-like synth with stomp and clap.
const SONG = (() => {
  const q = 0.5, e = 0.25, h = 1; // in bars of 2 beats... durations in seconds at 120 bpm (q = 0.5 s)
  const L1 = [[69, q], [69, e], [69, e], [69, q], [69, e], [69, e], [69, q], [62, q], [65, q], [69, q]];
  const L2 = [[67, q], [67, e], [67, e], [67, q], [67, e], [67, e], [67, q], [60, q], [64, q], [67, q]];
  const L3 = [[69, q], [69, e], [69, e], [69, q], [69, e], [69, e], [69, q], [71, q], [72, q], [74, q]];
  const L4 = [[72, q], [69, q], [67, q], [64, q], [62, h], [0, h]];
  const B = [[38, 38], [36, 36], [38, 38], [36, 38]];
  const stanza = lines => [L1, L2, L3, L4].map((m, i) => ({ notes: m, bass: B[i], text: lines[i] }));
  const v1 = 'What will we do with a drunken sailor?', ch = 'Way hay and up she rises', em = 'Early in the morning!';
  const v2 = "Put him in the longboat till he's sober", v3 = 'Shave his belly with a rusty razor';
  return [...stanza([v1, v1, v1, em]), ...stanza([ch, ch, ch, em]), ...stanza([v2, v2, v2, em]), ...stanza([ch, ch, ch, em]), ...stanza([v3, v3, v3, em]), ...stanza([ch, ch, ch, em])];
})();

export function createAudio(G, ctx) {
  let ac = null, master, music, sfx, verb, noiseBuf, brownBuf;
  const A = { muted: false, captions: true, ready: false };
  try { A.muted = localStorage.getItem('bt-muted') === '1'; A.captions = localStorage.getItem('bt-captions') !== '0'; } catch (e) { /* storage may be blocked */ }
  let bed = null, song = { line: -1, next: 0, text: '', lineT: 0, gap: 0 };

  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = A.muted ? 0 : 0.8;
    master.connect(comp); comp.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 1; sfx.connect(master);
    music = ac.createGain(); music.gain.value = 0.32; music.connect(master);
    // white and brown noise buffers
    const n = ac.sampleRate * 3;
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    brownBuf = ac.createBuffer(1, n, ac.sampleRate); const b = brownBuf.getChannelData(0); let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // generated reverb: exponentially decaying noise
    const len = ac.sampleRate * 2.4, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb = ac.createConvolver(); verb.buffer = ir; const vg = ac.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(master);
    // beds: sea swell, spray and wind
    const loop = (buf, type, f, q, g) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.1; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gn = ac.createGain(); gn.gain.value = g; s.connect(fl); fl.connect(gn); gn.connect(sfx); s.start(); return { s, fl, gn }; };
    bed = { sea: loop(brownBuf, 'lowpass', 480, 0.5, 0.16), spray: loop(noiseBuf, 'highpass', 2600, 0.3, 0.012), wind: loop(noiseBuf, 'bandpass', 700, 0.9, 0.02) };
    A.ready = true;
  }
  A.unlock = () => { if (!ac) { try { init(); } catch (e) { return; } } if (ac.state === 'suspended') ac.resume(); };
  A.toggle = () => { A.muted = !A.muted; try { localStorage.setItem('bt-muted', A.muted ? '1' : '0'); } catch (e) { /* ignore */ } if (master) master.gain.setTargetAtTime(A.muted ? 0 : 0.8, ac.currentTime, 0.05); };
  Object.defineProperty(A, 'captionsOn', { set(v) { A.captions = v; try { localStorage.setItem('bt-captions', v ? '1' : '0'); } catch (e) { /* ignore */ } } });
  A.pause = (p) => { if (music) music.gain.setTargetAtTime(p ? 0.08 : 0.32, ac.currentTime, 0.2); };

  const near = (x, z) => { const f = ctx.view.mode === 'deck' ? G.player : ctx.view.target; const d = Math.hypot(x - f.x, z - f.z); const zoom = ctx.view.mode === 'chase' ? Math.min(1, 90 / ctx.view.vh) : 1; return Math.max(0.05, 1 / (1 + d / 110)) * (0.45 + 0.55 * zoom); };
  function burst({ t = 0, dur = 0.3, type = 'lowpass', f = 800, q = 0.7, g = 0.5, buf = noiseBuf, rate = 1, send = 0, dest = sfx, attack = 0.004 }) {
    const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gn = ac.createGain(); const t0 = ac.currentTime + t;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(g, t0 + attack); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(gn); gn.connect(dest); if (send) { const sg = ac.createGain(); sg.gain.value = send; gn.connect(sg); sg.connect(verb); }
    s.start(t0, Math.random() * 2); s.stop(t0 + dur + 0.05);
  }
  function tone({ t = 0, f = 440, f2 = null, dur = 0.3, type = 'sine', g = 0.2, dest = sfx, attack = 0.005, send = 0 }) {
    const o = ac.createOscillator(); o.type = type; const t0 = ac.currentTime + t;
    o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(g, t0 + attack); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(dest); if (send) { const sg = ac.createGain(); sg.gain.value = send; gn.connect(sg); sg.connect(verb); }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const ok = () => ac && A.ready && !A.muted && ac.state === 'running';
  A.cannon = (x, z, n = 6) => {
    if (!ok()) return; const v = near(x, z);
    for (let i = 0; i < Math.min(n, 8); i++) {
      const t = i * 0.11 + Math.random() * 0.04;
      burst({ t, dur: 1.3, f: 650, g: 0.55 * v, buf: brownBuf, rate: 0.6, send: 0.5 * v });
      tone({ t, f: 70, f2: 32, dur: 0.6, g: 0.5 * v });
      burst({ t, dur: 0.12, type: 'highpass', f: 1800, g: 0.12 * v });
    }
  };
  A.splash = (x, z) => { if (!ok()) return; const v = near(x, z); burst({ dur: 0.45, type: 'bandpass', f: 900 + Math.random() * 500, q: 0.6, g: 0.16 * v }); };
  A.hit = (x, z) => { if (!ok()) return; const v = near(x, z); burst({ dur: 0.16, type: 'highpass', f: 1400, g: 0.35 * v }); tone({ f: 180, f2: 90, dur: 0.18, type: 'square', g: 0.06 * v }); };
  A.bell = () => { if (!ok()) return; for (const [f, d, g] of [[523, 2.6, 0.18], [1318, 1.4, 0.07], [2040, 0.9, 0.04]]) tone({ f, dur: d, g, send: 0.3 }); };
  A.coin = () => { if (!ok()) return; tone({ f: 1320, dur: 0.09, type: 'square', g: 0.04 }); tone({ t: 0.08, f: 1760, dur: 0.14, type: 'square', g: 0.04 }); };
  A.click = () => { if (!ok()) return; tone({ f: 900, dur: 0.05, type: 'square', g: 0.03 }); };
  A.thunder = () => { if (!ok()) return; burst({ dur: 3.2, f: 220, g: 0.5, buf: brownBuf, rate: 0.35, attack: 0.25, send: 0.6 }); };
  A.melee = (x, z) => { if (!ok()) return; const v = near(x, z); burst({ dur: 0.22, type: 'bandpass', f: 600 + Math.random() * 700, q: 2.5, g: 0.12 * v }); if (Math.random() < 0.5) burst({ dur: 0.08, type: 'highpass', f: 2200, g: 0.2 * v }); };
  A.cheer = () => { if (!ok()) return; for (let i = 0; i < 6; i++) burst({ t: i * 0.07, dur: 0.6, type: 'bandpass', f: 500 + i * 140, q: 3, g: 0.07 }); };

  G.on('fire', ({ s, n }) => A.cannon(s.x, s.z, n));
  G.on('splash', b => A.splash(b.x, b.z));
  G.on('hit', ({ x, z }) => A.hit(x, z));
  G.on('dock', () => A.bell());
  G.on('coin', () => A.coin());
  G.on('melee', p => A.melee(p.x, p.z));
  G.on('won', () => A.cheer());

  // ---------- the shanty ----------
  function voice(t, midi, dur) {
    const f = 440 * Math.pow(2, (midi - 69) / 12), t0 = ac.currentTime + t;
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1700; fl.Q.value = 1.2;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.03); g.gain.setValueAtTime(0.08, t0 + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.98);
    for (const [det, type] of [[-6, 'sawtooth'], [6, 'sawtooth'], [1200, 'square']]) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const og = ac.createGain(); og.gain.value = type === 'square' ? 0.18 : 0.5; o.connect(og); og.connect(fl);
      o.start(t0); o.stop(t0 + dur);
    }
    fl.connect(g); g.connect(music);
  }
  function bass(t, midi, dur) { const f = 440 * Math.pow(2, (midi - 69) / 12); const t0 = ac.currentTime + t; const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(music); o.start(t0); o.stop(t0 + dur + 0.05); }
  function stomp(t) { const t0 = ac.currentTime + t; const o = ac.createOscillator(); o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(42, t0 + 0.14); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2); o.connect(g); g.connect(music); o.start(t0); o.stop(t0 + 0.25); }
  function clap(t) { burst({ t, dur: 0.12, type: 'bandpass', f: 1600, q: 0.8, g: 0.18, dest: music }); }
  function scheduleLine(i) {
    const L = SONG[i]; let t = 0.05;
    for (const [m, d] of L.notes) { if (m) voice(t, m, d * 0.95); t += d; }
    bass(0.05, L.bass[0], 1.9); bass(2.05, L.bass[1], 1.9);
    for (let b = 0; b < 8; b++) { if (b % 2 === 0) stomp(0.05 + b * 0.5); else clap(0.05 + b * 0.5); }
  }
  A.update = (dt) => {
    if (!ac || !A.ready) return;
    const s = bed, w = G.wind.speed, pm = ctx.view.mode === 'deck' ? 1.25 : 0.85;
    s.sea.gn.gain.value = (0.13 + 0.06 * Math.sin(G.t * 0.5)) * pm * (1 + G.weather * 0.8);
    s.wind.gn.gain.value = (0.012 + 0.03 * w * (G.player.sailAmt || 0.3) + G.weather * 0.06) * pm; s.wind.fl.frequency.value = 520 + w * 380 + G.wind.gust * 600;
    s.spray.gn.gain.value = 0.006 + G.weather * 0.03;
    // the shanty plays at sea when nothing is shooting; lines are scheduled one at a time
    const fighting = G.ships.some(o => o.alive && o !== G.player && (o.target === G.player || G.ai.target === o && G.ai.phase === 'fight')) || !!G.boarding;
    music.gain.setTargetAtTime(A.muted ? 0 : G.paused ? 0.08 : fighting ? 0.1 : 0.32, ac.currentTime, 0.6);
    song.lineT -= dt;
    if (song.lineT <= 0) {
      if (song.gap > 0) { song.gap -= dt; song.text = ''; return; }
      song.line = (song.line + 1) % SONG.length;
      if (song.line === 0 && song.played) { song.gap = 24; song.played = false; song.line = -1; song.text = ''; return; }
      song.played = true;
      if (ac.state === 'running' && !A.muted) scheduleLine(song.line);
      song.text = SONG[song.line].text; song.lineT = 4;
    }
  };
  A.caption = () => (ac && ac.state === 'running' && !A.muted && music.gain.value > 0.2 ? song.text : '');
  return A;
}
