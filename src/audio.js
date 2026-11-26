// Sound made in code: sea and wind beds, cannon with a generated reverb tail, splashes, splinters,
// a bell on docking, and "Drunken Sailor" (traditional) on a concertina-like synth with stomp and clap.
// Songs as data: notes are [midi, beats] (0 = rest), every line is 8 beats long, bass is two half-line roots.
// All three shanties are traditional and in the public domain.
const SONGS = (() => {
  const st = (melody, bass, texts) => melody.map((notes, i) => ({ notes, bass: bass[i], text: texts[i] }));
  // Drunken Sailor (D dorian)
  const D1 = [[69, 1], [69, .5], [69, .5], [69, 1], [69, .5], [69, .5], [69, 1], [62, 1], [65, 1], [69, 1]];
  const D2 = [[67, 1], [67, .5], [67, .5], [67, 1], [67, .5], [67, .5], [67, 1], [60, 1], [64, 1], [67, 1]];
  const D3 = [[69, 1], [69, .5], [69, .5], [69, 1], [69, .5], [69, .5], [69, 1], [71, 1], [72, 1], [74, 1]];
  const D4 = [[72, 1], [69, 1], [67, 1], [64, 1], [62, 2], [0, 2]];
  const DB = [[38, 38], [36, 36], [38, 38], [36, 38]];
  const ds = (a, b, c, d) => st([D1, D2, D3, D4], DB, [a, b, c, d]);
  const dv = 'What will we do with a drunken sailor?', dc = 'Way hay and up she rises', de = 'Early in the morning!';
  const drunken = [...ds(dv, dv, dv, de), ...ds(dc, dc, dc, de), ...ds("Put him in the longboat till he's sober", "Put him in the longboat till he's sober", "Put him in the longboat till he's sober", de), ...ds(dc, dc, dc, de)];
  // Haul Away Joe (D major)
  const H1 = [[62, .5], [62, .5], [66, 1], [66, .5], [69, .5], [71, 1], [69, 1], [66, 1], [64, 1], [62, 1]];
  const H2 = [[69, 1], [69, 1], [71, .5], [69, .5], [66, 1], [64, 1], [66, 1], [62, 2]];
  const H3 = [[62, .5], [62, .5], [66, 1], [66, .5], [69, .5], [71, 1], [74, 1], [71, 1], [69, 1], [66, 1]];
  const HB = [[50, 45], [50, 45], [50, 45], [45, 50]];
  const hr = "Way, haul away, we'll haul away Joe!";
  const hs = (a, b) => st([H1, H2, H3, H2], HB, [a, hr, b, hr]);
  const haul = [...hs('When I was a little lad, my mother always told me', "That if I didn't kiss the girls, my lips would grow all mouldy"),
    ...hs("Way, haul away, we'll haul away together", "Way, haul away, we'll haul for better weather"),
    ...hs('King Louis was the King of France before the Revolution', 'But then he got his head cut off, which spoiled his constitution')];
  // Leave Her, Johnny (E minor, slower: the pumps are heavy)
  const L1 = [[59, 1], [64, 1], [64, .5], [64, .5], [66, 1], [67, 1], [66, 1], [64, 2]];
  const L2 = [[71, 1.5], [69, .5], [67, 1], [66, 1], [64, 2], [0, 2]];
  const L3 = [[59, 1], [64, 1], [67, 1], [67, .5], [69, .5], [71, 1], [69, 1], [67, 2]];
  const L4 = [[69, .5], [69, .5], [67, 1], [66, 1], [64, 1], [62, 1], [64, 2], [0, 1]];
  const LB = [[40, 47], [43, 38], [40, 43], [38, 40]];
  const ls = (a, b) => st([L1, L2, L3, L4], LB, [a, 'Leave her, Johnny, leave her!', b, "It's time for us to leave her!"]);
  const leave = [...ls('Oh the times are hard and the wages low', "I'll pack my bag and go below"),
    ...ls("The mate was a bucko and the old man a Turk", 'The bosun was a beggar with a middle name of work'),
    ...ls("Oh the winds were foul, the work was hard", "From Liverpool docks to the Brooklyn yard")];
  return [
    { title: 'Drunken Sailor', beat: 0.5, voice: 'concertina', lines: drunken },
    { title: 'Haul Away Joe', beat: 0.5, voice: 'fiddle', lines: haul },
    { title: 'Leave Her, Johnny', beat: 0.62, voice: 'concertina', lines: leave },
  ];
})();
// the tavern's fiddler: a jig with no words (A dorian), quick and light
const JIG = (() => {
  const a = [[69, .5], [72, .5], [76, .5], [74, .5], [72, .5], [69, .5], [71, .5], [72, .5], [74, 1], [71, .5], [67, .5], [69, 2]];
  const b = [[76, .5], [74, .5], [72, .5], [71, .5], [69, .5], [71, .5], [72, .5], [74, .5], [76, 1], [72, 1], [69, 2]];
  return { title: 'a tavern jig', beat: 0.34, voice: 'fiddle', lines: [a, b, a, [[72, .5], [71, .5], [69, .5], [67, .5], [69, 1], [64, 1], [69, 2], [0, 2]]].map((notes, i) => ({ notes, bass: [[45, 52], [43, 50], [45, 52], [43, 45]][i], text: '' })) };
})();

export function createAudio(G, ctx) {
  let ac = null, master, music, sfx, verb, noiseBuf, brownBuf;
  const A = { muted: false, captions: true, ready: false };
  try { A.muted = localStorage.getItem('bt-muted') === '1'; A.captions = localStorage.getItem('bt-captions') !== '0'; } catch (e) { /* storage may be blocked */ }
  let bed = null;

  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = A.muted ? 0 : 0.8;
    master.connect(comp); comp.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 1; sfx.connect(master);
    music = ac.createGain(); music.gain.value = 1; music.connect(master); // each context's bus carries its own level
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
  A.pause = (p) => { if (music) music.gain.setTargetAtTime(p ? 0.25 : 1, ac.currentTime, 0.2); };

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

  // ---------- music: a bus per context, crossfaded ----------
  // sea: the shanties in turn, with captions · battle: drums over a drone · port: the tavern fiddler · storm: a low drone
  const VOL = { sea: 0.32, battle: 0.3, port: 0.26, storm: 0.3 };
  let bus = null;
  const players = { sea: { song: 0, line: -1, lineT: 0, gap: 0 }, port: { line: -1, lineT: 0 }, battle: { line: -1, lineT: 0 }, storm: { line: -1, lineT: 0 } };
  A.context = 'sea'; A.text = ''; A.songTitle = SONGS[0].title; A.songs = SONGS.map(s => s.title);
  let want = 'sea', wantT = 0;
  function busFor(name) {
    if (!bus) { bus = {}; for (const k in VOL) { const g = ac.createGain(); g.gain.value = k === A.context ? VOL[k] : 0; g.connect(music); bus[k] = g; } }
    return bus[name];
  }
  const targets = {};
  A.busGain = name => (bus ? bus[name].gain.value : 0);
  A.busTarget = name => targets[name] ?? 0; // where the crossfade is heading (headless audio clocks barely run)
  A.clock = () => (ac ? { state: ac.state, time: +ac.currentTime.toFixed(2) } : null);
  function voice(t, midi, dur, dest, kind = 'concertina') {
    const f = 440 * Math.pow(2, (midi - 69) / 12), t0 = ac.currentTime + t;
    const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = kind === 'fiddle' ? 2600 : 1700; fl.Q.value = kind === 'fiddle' ? 2.5 : 1.2;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + (kind === 'fiddle' ? 0.06 : 0.03)); g.gain.setValueAtTime(0.08, t0 + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.98);
    const parts = kind === 'fiddle' ? [[-4, 'sawtooth', 0.6], [5, 'sawtooth', 0.4]] : [[-6, 'sawtooth', 0.5], [6, 'sawtooth', 0.5], [1200, 'square', 0.18]];
    for (const [det, type, lv] of parts) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      if (kind === 'fiddle') { const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.detune); lfo.start(t0); lfo.stop(t0 + dur); } // vibrato
      const og = ac.createGain(); og.gain.value = lv; o.connect(og); og.connect(fl);
      o.start(t0); o.stop(t0 + dur);
    }
    fl.connect(g); g.connect(dest);
  }
  function bassNote(t, midi, dur, dest, gain = 0.22, type = 'triangle') { const f = 440 * Math.pow(2, (midi - 69) / 12); const t0 = ac.currentTime + t; const o = ac.createOscillator(); o.type = type; o.frequency.value = f; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05); }
  function drum(t, f0, f1, dur, gain, dest) { const t0 = ac.currentTime + t; const o = ac.createOscillator(); o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.7); const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02); }
  const clap = (t, dest) => burst({ t, dur: 0.12, type: 'bandpass', f: 1600, q: 0.8, g: 0.18, dest });
  const snare = (t, g, dest) => burst({ t, dur: 0.09, type: 'highpass', f: 1800, q: 0.5, g, dest });
  // one line of a song: melody, bass on each half, stomp on the beat and clap off it; returns its length in seconds
  function playLine(S, L, dest) {
    let t = 0.05;
    for (const [m, d] of L.notes) { if (m) voice(t, m, d * S.beat * 0.95, dest, S.voice); t += d * S.beat; }
    const len = 8 * S.beat;
    bassNote(0.05, L.bass[0], len / 2 - 0.1, dest); bassNote(0.05 + len / 2, L.bass[1], len / 2 - 0.1, dest);
    for (let b = 0; b < 8; b++) { if (b % 2 === 0) drum(0.05 + b * S.beat, 110, 42, 0.2, 0.4, dest); else clap(0.05 + b * S.beat, dest); }
    return len;
  }
  const SCHED = {
    sea(P, dest) { // the shanties one after another, with a breath between songs
      if (P.gap > 0) return { len: P.gap, text: '', after: () => { P.gap = 0; } };
      const S = SONGS[P.song]; P.line++;
      if (P.line >= S.lines.length) { P.line = -1; P.song = (P.song + 1) % SONGS.length; P.gap = 14; A.songTitle = SONGS[P.song].title; return { len: 0.1, text: '' }; }
      A.songTitle = S.title;
      return { len: playLine(S, S.lines[P.line], dest), text: S.lines[P.line].text };
    },
    port(P, dest) { P.line = (P.line + 1) % JIG.lines.length; return { len: playLine(JIG, JIG.lines[P.line], dest), text: '' }; },
    battle(P, dest) { // war drums: a heavy beat, snare rolls, and a fifth droning under them
      const beat = 0.43; P.line++;
      for (let b = 0; b < 8; b++) {
        drum(b * beat, 90, 40, 0.35, b % 4 === 0 ? 0.55 : 0.32, dest);
        if (b % 2 === 1) for (let k = 0; k < 4; k++) snare(b * beat + k * beat / 4, 0.05 + (k === 0 ? 0.06 : 0), dest);
      }
      bassNote(0, 38, 8 * beat, dest, 0.08, 'square'); bassNote(0, 45, 8 * beat, dest, 0.05, 'square');
      return { len: 8 * beat, text: '' };
    },
    storm(P, dest) { // a low drone that swells and sinks, and now and then a long dark horn
      const len = 7; P.line++;
      for (const [m, det] of [[26, -8], [26, 8], [33, 0]]) {
        const t0 = ac.currentTime, o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); o.detune.value = det;
        const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(160, t0); fl.frequency.linearRampToValueAtTime(420, t0 + len / 2); fl.frequency.linearRampToValueAtTime(160, t0 + len);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 1.5); g.gain.setValueAtTime(0.12, t0 + len - 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + 0.6);
        o.connect(fl); fl.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + len + 0.7);
      }
      if (P.line % 2 === 0) voice(1.5, 45, 3.5, dest, 'concertina');
      return { len, text: '' };
    },
  };
  // which music the moment wants: a fight beats port, port beats a storm, a storm beats a fair sea
  A.contextFor = () => {
    const P = G.player, fleet = s => s === P || s.role === 'consort';
    const fighting = !!G.boarding || G.ships.some(o => o.alive && !fleet(o) && o.state === 'engage' && fleet(o.target) && Math.hypot(o.x - P.x, o.z - P.z) < 400) || (G.ai.phase === 'fight' && G.autopilot) || (G.serpent && G.serpent.state !== 'hidden' && G.serpent.state !== 'dead');
    return fighting ? 'battle' : G.docked ? 'port' : G.weather > 0.6 ? 'storm' : 'sea';
  };
  A.update = (dt) => {
    if (!ac || !A.ready) return;
    const s = bed, w = G.wind.speed, pm = ctx.view.mode === 'deck' ? 1.25 : 0.85;
    s.sea.gn.gain.value = (0.13 + 0.06 * Math.sin(G.t * 0.5)) * pm * (1 + G.weather * 0.8);
    s.wind.gn.gain.value = (0.012 + 0.03 * w * (G.player.sailAmt || 0.3) + G.weather * 0.06) * pm; s.wind.fl.frequency.value = 520 + w * 380 + G.wind.gust * 600;
    s.spray.gn.gain.value = 0.006 + G.weather * 0.03;
    music.gain.setTargetAtTime(A.muted ? 0 : G.paused ? 0.25 : 1, ac.currentTime, 0.4);
    // a new context has to hold for two seconds before the music crossfades to it
    const c = A.contextFor();
    if (c !== want) { want = c; wantT = 0; } else wantT += dt;
    if (want !== A.context && (wantT > 2 || !bus)) {
      A.context = want; A.text = '';
      for (const k in VOL) { targets[k] = k === A.context ? VOL[k] : 0; busFor(k).gain.setTargetAtTime(targets[k], ac.currentTime, 0.8); }
      const P = players[A.context]; P.lineT = 0; if (A.context !== 'sea') P.line = -1;
    }
    const P = players[A.context];
    P.lineT -= dt;
    if (P.lineT <= 0) {
      if (ac.state !== 'running' || A.muted) { P.lineT = 1; return; }
      const r = SCHED[A.context](P, busFor(A.context));
      P.lineT = r.len; A.text = r.text; if (r.after) r.after();
    }
  };
  A.caption = () => (ac && ac.state === 'running' && !A.muted && A.context === 'sea' ? A.text : '');
  return A;
}
