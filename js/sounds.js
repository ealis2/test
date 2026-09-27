// Sons relaxants et sonnerie de réveil générés en direct (Web Audio) :
// aucun fichier audio à télécharger, fonctionne hors ligne.

let ctx = null;
let master = null;
const buffers = {};

export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    // iOS 17+ : joue le son même si l'interrupteur « silencieux » est activé
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(kind) {
  if (buffers[kind]) return buffers[kind];
  const c = audioCtx();
  const len = c.sampleRate * 8;
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        // Filtre de Paul Kellet
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // Fondu aux extrémités pour une boucle sans clic
    const f = 2000;
    for (let i = 0; i < f; i++) { const g = i / f; d[i] *= g; d[len - 1 - i] *= g; }
  }
  buffers[kind] = buf;
  return buf;
}

function loopNoise(kind) {
  const c = audioCtx();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(kind);
  src.loop = true;
  // Deux lectures décalées pour masquer la jonction de la boucle
  src.start(0, Math.random() * 7);
  return src;
}

function lfo(freq, depth, target, offset) {
  const c = audioCtx();
  const o = c.createOscillator();
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = depth;
  o.connect(g).connect(target);
  if (offset !== undefined) target.value = offset;
  o.start();
  return o;
}

export const SOUNDS = [
  { id: 'pluie', name: 'Pluie', ico: '🌧️' },
  { id: 'ocean', name: 'Océan', ico: '🌊' },
  { id: 'vent', name: 'Vent', ico: '🍃' },
  { id: 'feu', name: 'Feu de bois', ico: '🔥' },
  { id: 'ventilo', name: 'Ventilateur', ico: '🌀' },
  { id: 'orage', name: 'Orage lointain', ico: '⛈️' },
  { id: 'blanc', name: 'Bruit blanc', ico: '⚪' },
  { id: 'rose', name: 'Bruit rose', ico: '🌸' },
  { id: 'brun', name: 'Bruit brun', ico: '🟤' },
];

function build(id) {
  const c = audioCtx();
  const out = c.createGain();
  out.gain.value = 0;
  const nodes = [];
  const timers = [];
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); nodes.push(...n); };
  const filter = (type, f, q = 0.7) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = v => { const g = c.createGain(); g.gain.value = v; return g; };

  const crackles = (every, dur, vol, fmin, fmax) => {
    const tick = () => {
      const s = c.createBufferSource();
      s.buffer = noiseBuffer('white');
      const f = filter('bandpass', fmin + Math.random() * (fmax - fmin), 2);
      const g = c.createGain();
      const t = c.currentTime;
      g.gain.setValueAtTime(vol * (0.3 + Math.random()), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * (0.5 + Math.random()));
      s.connect(f).connect(g).connect(out);
      s.start(t, Math.random() * 7, dur * 1.5);
      timers.push(setTimeout(tick, every * (0.2 + Math.random() * 1.6)));
    };
    tick();
  };

  switch (id) {
    case 'pluie': {
      chain(loopNoise('pink'), filter('highpass', 500), filter('lowpass', 7000), gain(0.9), out);
      crackles(90, 0.04, 0.25, 2500, 6000);
      break;
    }
    case 'ocean': {
      const g = gain(0.5);
      chain(loopNoise('brown'), filter('lowpass', 800), g, out);
      nodes.push(lfo(0.09, 0.45, g.gain, 0.5));
      const g2 = gain(0.08);
      chain(loopNoise('pink'), filter('highpass', 1500), g2, out);
      nodes.push(lfo(0.09, 0.08, g2.gain, 0.08));
      break;
    }
    case 'vent': {
      const bp = filter('bandpass', 700, 1.2);
      chain(loopNoise('pink'), bp, gain(1.4), out);
      nodes.push(lfo(0.05, 350, bp.frequency, 700));
      break;
    }
    case 'feu': {
      chain(loopNoise('brown'), filter('lowpass', 500), gain(0.6), out);
      crackles(140, 0.03, 0.6, 1200, 4000);
      break;
    }
    case 'ventilo': {
      chain(loopNoise('brown'), filter('lowpass', 350), gain(1.2), out);
      const o = c.createOscillator(); o.frequency.value = 58; o.type = 'sine';
      chain(o, gain(0.03), out); o.start();
      break;
    }
    case 'orage': {
      const g = gain(0.3);
      chain(loopNoise('brown'), filter('lowpass', 180), g, out);
      nodes.push(lfo(0.03, 0.25, g.gain, 0.35));
      chain(loopNoise('pink'), filter('highpass', 600), gain(0.35), out);
      break;
    }
    case 'blanc': chain(loopNoise('white'), gain(0.35), out); break;
    case 'rose': chain(loopNoise('pink'), gain(0.8), out); break;
    case 'brun': chain(loopNoise('brown'), gain(0.9), out); break;
  }
  out.connect(master);
  return {
    out,
    stop() {
      timers.forEach(clearTimeout);
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.6);
      setTimeout(() => {
        nodes.forEach(n => { try { n.stop && n.stop(); } catch {} try { n.disconnect(); } catch {} });
        out.disconnect();
      }, 700);
    },
    // Remplace la liste de timers au fil de l'eau (crépitements)
    get timers() { return timers; },
  };
}

// ---------- Mélangeur ----------
const playing = new Map(); // id -> { player, vol }
let sleepTimer = null;
let timerEnd = 0;

export function isPlaying(id) { return playing.has(id); }
export function anyPlaying() { return playing.size > 0; }

export function toggleSound(id, vol = 0.6) {
  if (playing.has(id)) { stopSound(id); return false; }
  const p = build(id);
  const t = audioCtx().currentTime;
  p.out.gain.setValueAtTime(0, t);
  p.out.gain.linearRampToValueAtTime(vol, t + 1.5);
  playing.set(id, { player: p, vol });
  return true;
}

export function setVolume(id, vol) {
  const p = playing.get(id);
  if (!p) return;
  p.vol = vol;
  const t = audioCtx().currentTime;
  p.player.out.gain.cancelScheduledValues(t);
  p.player.out.gain.setTargetAtTime(vol, t, 0.1);
}

export function stopSound(id) {
  const p = playing.get(id);
  if (p) { p.player.stop(); playing.delete(id); }
}

export function stopAll() {
  [...playing.keys()].forEach(stopSound);
  clearTimeout(sleepTimer); sleepTimer = null; timerEnd = 0;
  if (master) master.gain.value = 1;
}

// Minuteur : fondu de 60 s puis arrêt
export function setSleepTimer(min) {
  clearTimeout(sleepTimer);
  if (master) { master.gain.cancelScheduledValues(0); master.gain.value = 1; }
  if (!min) { timerEnd = 0; return; }
  timerEnd = Date.now() + min * 60000;
  sleepTimer = setTimeout(() => {
    const c = audioCtx();
    master.gain.setValueAtTime(1, c.currentTime);
    master.gain.linearRampToValueAtTime(0, c.currentTime + 60);
    sleepTimer = setTimeout(() => { stopAll(); }, 61000);
  }, Math.max(0, min * 60000 - 60000));
}
export function timerRemaining() { return timerEnd ? Math.max(0, timerEnd - Date.now()) : 0; }

// ---------- Sonnerie de réveil (volume progressif) ----------
let alarmNodes = null;

export function startAlarm(kind = 'aube') {
  stopAlarm();
  const c = audioCtx();
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, c.currentTime);
  out.gain.exponentialRampToValueAtTime(0.9, c.currentTime + 45); // montée douce sur 45 s
  out.connect(c.destination);
  const notes = kind === 'bip' ? [880, 0, 880, 0] : [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25];
  let i = 0;
  const step = () => {
    const f = notes[i++ % notes.length];
    if (f) {
      const o = c.createOscillator();
      o.type = kind === 'bip' ? 'square' : 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      const t = c.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(kind === 'bip' ? 0.15 : 0.5, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'bip' ? 0.25 : 1.4));
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 1.5);
    }
    alarmNodes.timer = setTimeout(step, kind === 'bip' ? 250 : 420);
  };
  alarmNodes = { out, timer: null };
  step();
  if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
}

export function stopAlarm() {
  if (!alarmNodes) return;
  clearTimeout(alarmNodes.timer);
  try { alarmNodes.out.disconnect(); } catch {}
  alarmNodes = null;
}
