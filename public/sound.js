// Sonido de Avalon: todo sintetizado con Web Audio (sin archivos de audio).
// Efectos (SFX.*) y música medieval original en modo dórico (Music.*).
(function () {
  const pref = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v === '1'; } catch { return def; } };
  const savePref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };

  const state = { sfx: pref('avalon.sfx', true), music: pref('avalon.music', false) };
  let ctx = null, master, sfxBus, musicBus, reverb, noiseBuf;
  const pluckCache = new Map();

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);

    // Reverb de salón de castillo: respuesta al impulso generada con ruido que decae
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    reverb.connect(wet).connect(master);

    sfxBus = ctx.createGain(); sfxBus.gain.value = state.sfx ? 1 : 0;
    musicBus = ctx.createGain(); musicBus.gain.value = 0;
    for (const b of [sfxBus, musicBus]) { b.connect(master); b.connect(reverb); }

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // El navegador sólo deja sonar audio después de un toque del usuario.
  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (state.music) Music.start();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  const ready = () => ctx && ctx.state === 'running';
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const N = { C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59, C4: 60, D4: 62, E4: 64, F4: 65, FS4: 66, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, FS5: 78, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, Bb2: 46, A2: 45, D2: 38, Eb2: 39 };

  // ---------- Instrumentos ----------
  function env(g, t, a, peak, d, sustain = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  function noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.3, attack = 0.002, sweepTo, bus = sfxBus } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  function tone(t, freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, slideTo, bus = sfxBus, lp } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); env(g, t, attack, gain, dur);
    let node = o.connect(g);
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; g.disconnect(); o.disconnect(); o.connect(f).connect(g); }
    node = g; node.connect(bus);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  // Laúd: síntesis Karplus-Strong (cuerda pulsada), con caché por nota.
  function pluckBuffer(freq) {
    const key = Math.round(freq * 10);
    if (pluckCache.has(key)) return pluckCache.get(key);
    const sr = ctx.sampleRate, len = Math.floor(sr * 2.2), period = Math.round(sr / freq);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const ring = new Float32Array(period);
    for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const idx = i % period;
      const v = 0.5 * (ring[idx] + ring[(idx + 1) % period]) * 0.996;
      ring[idx] = v;
      d[i] = prev = 0.6 * v + 0.4 * prev; // suaviza el brillo, más "tripa" que metal
    }
    pluckCache.set(key, buf);
    return buf;
  }
  function lute(t, freq, gain = 0.35, bus = musicBus) {
    const s = ctx.createBufferSource(); s.buffer = pluckBuffer(freq);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(f).connect(g).connect(bus);
    s.start(t); s.stop(t + 2.2);
  }

  // Flauta dulce: seno + un poco de triángulo, vibrato y soplido.
  function recorder(t, freq, dur, gain = 0.11, bus = musicBus) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(freq * 0.008, t + Math.min(0.35, dur));
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.05);
    g.gain.setValueAtTime(gain, t + Math.max(0.06, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(g); o2.connect(g2).connect(g); g.connect(bus);
    [o, o2, vib].forEach((x) => { x.start(t); x.stop(t + dur + 0.1); });
    noise(t, 0.07, { freq: freq * 2, q: 2, gain: gain * 0.25, bus });
  }

  // Pandero: golpe grave + chasquido de parche.
  function drum(t, accent = 1, bus = musicBus) {
    tone(t, 110, 0.18, { gain: 0.32 * accent, slideTo: 55, bus });
    noise(t, 0.06, { type: 'lowpass', freq: 900, gain: 0.12 * accent, bus });
  }

  // Campana grave: parciales inarmónicos que decaen lento.
  function bell(t, freq = 140, gain = 0.25) {
    [[1, 1], [2, 0.6], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([m, a]) =>
      tone(t, freq * m, 3.2 / m + 0.4, { gain: gain * a, attack: 0.002 }));
  }

  // Corno/trompa: diente de sierra filtrado con ataque suave.
  function horn(t, freq, dur, gain = 0.12) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq * 1.004;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1;
    f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1800, t + 0.08); f.frequency.linearRampToValueAtTime(1100, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.06);
    g.gain.setValueAtTime(gain, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(f); o2.connect(f); f.connect(g).connect(sfxBus);
    [o, o2].forEach((x) => { x.start(t); x.stop(t + dur + 0.15); });
  }


  // Coro: dientes de sierra desafinados apenas, filtrados con formantes de vocal "a"
  function choir(t, midis, dur, gain = 0.05, attack = 0.9) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + attack);
    out.gain.setValueAtTime(gain, t + dur);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6);
    const formants = [[800, 1], [1150, 0.5], [2900, 0.22]].map(([f, a]) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 7;
      const g = ctx.createGain(); g.gain.value = a * 3; bp.connect(g).connect(out); return bp;
    });
    const vib = ctx.createOscillator(); vib.frequency.value = 4.8;
    const end = t + dur + 1.8;
    midis.forEach((m) => [-7, 0, 7].forEach((cents) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = hz(m) * Math.pow(2, cents / 1200);
      const vg = ctx.createGain(); vg.gain.value = hz(m) * 0.006; vib.connect(vg).connect(o.frequency);
      formants.forEach((bp) => o.connect(bp));
      o.start(t); o.stop(end);
    }));
    vib.start(t); vib.stop(end);
    out.connect(sfxBus);
  }

  // Trueno: chasquido seco y retumbo grave con ráfagas irregulares
  function thunder(t) {
    noise(t, 0.12, { type: 'highpass', freq: 1500, gain: 0.5, attack: 0.001 });
    noise(t, 0.35, { type: 'lowpass', freq: 2200, sweepTo: 300, gain: 0.6, attack: 0.003 });
    for (let i = 0; i < 7; i++) {
      const d = 0.1 + Math.random() * 2.2;
      noise(t + d, 0.6 + Math.random() * 1.2, { type: 'lowpass', freq: 220 + Math.random() * 180, sweepTo: 70, gain: 0.5 - i * 0.05, attack: 0.08 });
    }
  }

  // Latido: "pum-pum" grave
  function heartbeat(t, gain = 0.6) {
    tone(t, 62, 0.14, { gain, slideTo: 38, attack: 0.004 });
    tone(t + 0.24, 56, 0.12, { gain: gain * 0.75, slideTo: 36, attack: 0.004 });
  }

  // ---------- Efectos ----------
  const SFX = {
    click() { if (!ready()) return; const t = ctx.currentTime; noise(t, 0.035, { freq: 1900, q: 3, gain: 0.25 }); tone(t, 320, 0.05, { type: 'triangle', gain: 0.08 }); },
    flip() { if (!ready()) return; const t = ctx.currentTime; noise(t, 0.16, { type: 'highpass', freq: 600, sweepTo: 5000, gain: 0.22, attack: 0.02 }); noise(t + 0.13, 0.03, { freq: 2500, q: 2, gain: 0.15 }); },
    seal() { if (!ready()) return; const t = ctx.currentTime; tone(t, 150, 0.16, { gain: 0.35, slideTo: 60 }); noise(t, 0.05, { type: 'lowpass', freq: 1400, gain: 0.25 }); },
    quill() { if (!ready()) return; const t = ctx.currentTime; noise(t, 0.12, { freq: 4200, q: 4, gain: 0.08, sweepTo: 2600, attack: 0.01 }); noise(t + 0.13, 0.09, { freq: 3800, q: 4, gain: 0.06, sweepTo: 2400 }); },
    bell(times = 3) { if (!ready()) return; const t = ctx.currentTime; for (let i = 0; i < times; i++) bell(t + i * 1.1, 130, 0.22); },
    yourTurn() { if (!ready()) return; const t = ctx.currentTime; horn(t, hz(N.D4), 0.22); horn(t + 0.25, hz(N.A4), 0.5); },
    approve() { if (!ready()) return; const t = ctx.currentTime; [N.D5, N.FS5, N.A5].forEach((m, i) => lute(t + i * 0.07, hz(m), 0.4, sfxBus)); },
    reject() { if (!ready()) return; const t = ctx.currentTime; drum(t, 1.4, sfxBus); tone(t, hz(N.D3), 0.7, { type: 'sawtooth', gain: 0.07, lp: 500 }); tone(t, hz(N.Eb2 + 12), 0.7, { type: 'sawtooth', gain: 0.06, lp: 500 }); },
    cardBad() { if (!ready()) return; const t = ctx.currentTime; tone(t, 70, 0.4, { gain: 0.4, slideTo: 40 }); noise(t, 0.2, { type: 'lowpass', freq: 500, gain: 0.2 }); },
    success() {
      if (!ready()) return; const t = ctx.currentTime;
      [[N.D4, 0, 0.16], [N.FS4, 0.17, 0.16], [N.A4, 0.34, 0.16], [N.D5, 0.51, 0.7]].forEach(([m, d, l]) => horn(t + d, hz(m), l, 0.1));
      horn(t + 0.51, hz(N.A4), 0.7, 0.07); horn(t + 0.51, hz(N.FS4), 0.7, 0.06);
      drum(t + 0.51, 1.2, sfxBus);
    },
    fail() {
      if (!ready()) return; const t = ctx.currentTime;
      drum(t, 1.6, sfxBus); drum(t + 0.3, 1.2, sfxBus);
      [N.D3, N.F3, N.A3 - 1].forEach((m) => tone(t + 0.3, hz(m), 1.8, { type: 'sawtooth', gain: 0.06, lp: 700, attack: 0.1 }));
      bell(t + 0.3, 90, 0.18);
    },
    reveal(team) {
      if (!ready()) return; const t = ctx.currentTime;
      const notes = team === 'good' ? [N.D4, N.FS4, N.A4, N.D5, N.FS5, N.A5] : [N.D5, N.A4, N.F4, N.D4, N.A3 - 1, N.D3];
      notes.forEach((m, i) => lute(t + i * 0.09, hz(m), 0.38, sfxBus));
      if (team === 'evil') tone(t, hz(N.D2), 2.2, { type: 'sawtooth', gain: 0.08, lp: 300, attack: 0.3 });
      else tone(t + 0.5, hz(N.D6), 1.6, { gain: 0.05, attack: 0.2 });
    },
    // Finales cinematográficos (sincronizados con la animación del final)
    victory(good) {
      if (!ready()) return; const t = ctx.currentTime;
      if (good) {
        // Luz: coro celestial en Re mayor, fanfarria, repique de campanas que sube
        tone(t, hz(N.D6) * 2, 1.2, { gain: 0.04, attack: 0.05 });
        choir(t + 0.2, [N.D4, N.FS4, N.A4, N.D5], 3.2, 0.045, 1.1);
        [[N.D4, 1.3, .2], [N.D4, 1.52, .1], [N.D4, 1.64, .1], [N.A4, 1.76, .35], [N.FS4, 2.14, .2], [N.A4, 2.36, .2], [N.D5, 2.58, 1.4]].forEach(([m, d, l]) => horn(t + d, hz(m), l, 0.1));
        horn(t + 2.58, hz(N.A4), 1.4, 0.065); horn(t + 2.58, hz(N.FS4), 1.4, 0.055);
        [1.3, 1.76, 2.58].forEach((d) => drum(t + d, 1.3, sfxBus));
        [N.D5, N.FS5, N.A5, N.D6, N.A5, N.D6].forEach((m, i) => bell(t + 2.9 + i * 0.22, hz(m) / 2, 0.08));
      } else {
        // Oscuridad: coro grave disonante, rayo con trueno, latidos y campanas fúnebres
        choir(t, [N.D2 + 12, N.F3 - 12 + 12, N.Bb2 + 12, N.D3], 5.5, 0.05, 1.6);
        tone(t, hz(N.D2), 6, { type: 'sawtooth', gain: 0.07, lp: 220, attack: 1.2 });
        thunder(t + 0.6);
        for (let i = 0; i < 5; i++) heartbeat(t + 1.6 + i * 0.9, 0.55 - i * 0.05);
        [[3.0, 98], [4.2, 87], [5.4, 73]].forEach(([d, f]) => bell(t + d, f, 0.24));
      }
    },
  };

  // ---------- Música: danza original en Re dórico, 3/4 ----------
  const BPM = 112, BEAT = 60 / BPM;
  // [nota, pulsos]; null = silencio
  const MELODY_A = [
    [N.D5, 1], [N.E5, .5], [N.F5, .5], [N.A5, 1],
    [N.G5, 1], [N.F5, .5], [N.E5, .5], [N.C5, 1],
    [N.D5, 1], [N.F5, 1], [N.A5, 1],
    [N.G5, 1.5], [N.F5, .5], [N.E5, 1],
    [N.F5, 1], [N.G5, .5], [N.A5, .5], [N.C6, 1],
    [N.B5, .5], [N.A5, .5], [N.G5, 1], [N.E5, 1],
    [N.F5, 1], [N.E5, .5], [N.D5, .5], [N.E5, 1],
    [N.D5, 3],
  ];
  const MELODY_B = [
    [N.A5, 1], [N.C6, 1], [N.A5, 1],
    [N.G5, 1], [N.E5, 1], [N.G5, 1],
    [N.F5, .5], [N.E5, .5], [N.D5, 1], [N.F5, 1],
    [N.E5, 2], [N.A4, 1],
    [N.C5, 1], [N.E5, .5], [N.G5, .5], [N.C6, 1],
    [N.A5, 1.5], [N.G5, .5], [N.F5, 1],
    [N.E5, 1], [N.G5, .5], [N.F5, .5], [N.E5, 1],
    [N.D5, 3],
  ];
  // Acordes por compás (raíz, quinta, octava/tercera) para el laúd
  const CH = { Dm: [N.D3, N.A3, N.F4], C: [N.C3, N.G3, N.E4], Am: [N.A2, N.E3 + 12 - 12, N.C4], F: [N.F3 - 12, N.C4 - 12, N.A3] };
  const CHORDS_A = ['Dm', 'C', 'Dm', 'Am', 'F', 'C', 'Dm', 'Dm'];
  const CHORDS_B = ['F', 'C', 'Dm', 'Am', 'C', 'Dm', 'Am', 'Dm'];
  const SECTIONS = [
    { mel: MELODY_A, ch: CHORDS_A, inst: 'recorder' },
    { mel: MELODY_B, ch: CHORDS_B, inst: 'recorder' },
    { mel: MELODY_A, ch: CHORDS_A, inst: 'lute' },
    { mel: MELODY_B, ch: CHORDS_B, inst: 'recorder' },
  ];

  // Convierte todo a una lista de eventos [pulso, fn]
  const EVENTS = [];
  let beatPos = 0;
  for (const sec of SECTIONS) {
    let b = beatPos;
    for (const [m, len] of sec.mel) {
      if (m !== null) EVENTS.push([b, (t) => (sec.inst === 'lute' ? lute(t, hz(m), 0.45) : recorder(t, hz(m), len * BEAT * 0.92))]);
      b += len;
    }
    sec.ch.forEach((name, bar) => {
      const c = CH[name], b0 = beatPos + bar * 3;
      EVENTS.push([b0, (t) => lute(t, hz(c[0]), 0.32)]);
      EVENTS.push([b0 + 1, (t) => lute(t, hz(c[1]), 0.22)]);
      EVENTS.push([b0 + 1.5, (t) => lute(t, hz(c[2]), 0.18)]);
      EVENTS.push([b0 + 2, (t) => lute(t, hz(c[1]), 0.2)]);
      EVENTS.push([b0, (t) => drum(t, 1)]);
      EVENTS.push([b0 + 2, (t) => drum(t, 0.45)]);
    });
    beatPos += sec.ch.length * 3;
  }
  EVENTS.sort((a, b) => a[0] - b[0]);
  const LOOP_BEATS = beatPos;

  let timer = null, loopStart = 0, nextIdx = 0, loopN = 0, drone = null;

  function startDrone() {
    // Bordón tipo gaita/zanfona: Re y La graves, filtrados y suaves
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 2);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650;
    const oscs = [N.D3, N.A3, N.D3 - 12].map((m, i) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m) * (1 + (i - 1) * 0.0015);
      o.connect(f); o.start(); return o;
    });
    f.connect(g).connect(musicBus);
    drone = { g, oscs };
  }
  function stopDrone() {
    if (!drone) return;
    const t = ctx.currentTime, d = drone; drone = null;
    d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    d.oscs.forEach((o) => o.stop(t + 0.9));
  }

  function schedule() {
    const ahead = ctx.currentTime + 0.25;
    while (true) {
      const [beat, fn] = EVENTS[nextIdx];
      const t = loopStart + (loopN * LOOP_BEATS + beat) * BEAT;
      if (t > ahead) break;
      if (t > ctx.currentTime - 0.05) fn(t);
      nextIdx++;
      if (nextIdx >= EVENTS.length) { nextIdx = 0; loopN++; }
    }
  }

  const Music = {
    start() {
      if (!ready() || timer) return;
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
      musicBus.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 1.5);
      loopStart = ctx.currentTime + 0.15; nextIdx = 0; loopN = 0;
      startDrone();
      timer = setInterval(schedule, 40);
      schedule();
    },
    stop() {
      if (!ctx || !timer) return;
      clearInterval(timer); timer = null;
      const t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      stopDrone();
    },
    // Baja la música mientras suena una fanfarria
    duck(seconds = 2.5) {
      if (!ready() || !timer) return;
      const t = ctx.currentTime, g = musicBus.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.15, t + 0.2); g.setValueAtTime(0.15, t + seconds); g.linearRampToValueAtTime(0.55, t + seconds + 1);
    },
  };

  const Sound = {
    get sfx() { return state.sfx; },
    get music() { return state.music; },
    get ctxState() { return ctx ? ctx.state : 'none'; },
    setSfx(on) {
      state.sfx = on; savePref('avalon.sfx', on);
      unlock();
      if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
      if (on) setTimeout(() => SFX.click(), 30);
    },
    setMusic(on) {
      state.music = on; savePref('avalon.music', on);
      unlock();
      if (on) setTimeout(() => Music.start(), 30); else Music.stop();
    },
  };

  // Un sonido que falla nunca debe romper la interfaz
  for (const k of Object.keys(SFX)) {
    const fn = SFX[k];
    SFX[k] = (...a) => { try { fn(...a); } catch (e) { console.warn('sonido', k, e); } };
  }
  for (const k of ['start', 'stop', 'duck']) {
    const fn = Music[k];
    Music[k] = (...a) => { try { fn(...a); } catch (e) { console.warn('música', k, e); } };
  }

  window.SFX = SFX;
  window.Music = Music;
  window.Sound = Sound;
})();
