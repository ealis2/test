// Suivi de la nuit : accéléromètre + micro (niveau sonore uniquement, rien n'est enregistré),
// respiration, maintien de l'écran allumé et réveil intelligent.
import { store, uid, timeToMinutes } from './store.js';
import { audioCtx, startAlarm, stopAlarm } from './sounds.js';
import { FS, breathing } from './signal.js';

const EPOCH_MS = 60000;

let live = null;          // { id, start, epochs, events, alarmAt, windowStart, sensors }
let wakeLock = null;
let micStream = null, analyser = null, micBuf = null;
let tickTimer = null, sampleTimer = null, binTimer = null;
// Signaux à 4 Hz de la minute en cours (respiration) : vibrations du matelas x/y/z + enveloppe sonore
let sig = { ax: [], ay: [], az: [], snd: [] };
let bin = { x: 0, y: 0, z: 0, n: 0 };
let lastLvl = 0;
const emptyAcc = () => ({ motion: 0, counts: 0, samples: 0, noiseSum: 0, noiseMax: 0, noiseN: 0 });
let acc = emptyAcc();
let grav = null;          // estimation de la gravité (filtre passe-bas) si e.acceleration est absent
let lastSampleAt = 0;
let lastAcc = null;
let loudSince = 0;
let listeners = { tick: [], alarm: [] };
let alarmRinging = false;

export const tracker = {
  get active() { return !!live; },
  get live() { return live; },
  get alarmRinging() { return alarmRinging; },
  on(evt, fn) { listeners[evt].push(fn); },
  start, stop, resume, snooze, dismissAlarm, reenableSensors,
  get motionOk() { return !!live?.sensors.motion && Date.now() - lastSampleAt < 10000; },
  current: () => ({ ...acc }),
};

function emit(evt, data) { listeners[evt].forEach(fn => fn(data)); }

function nextAlarm(settings) {
  if (!settings.alarmOn) return null;
  const now = new Date();
  const d = new Date(now);
  const m = timeToMinutes(settings.alarm);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// Doit être appelé depuis un geste utilisateur (tap) : iOS l'exige pour les permissions.
async function start() {
  const s = store.settings;
  audioCtx(); // déverrouille l'audio pour que l'alarme puisse sonner
  const sensors = { motion: false, mic: false };

  if (s.useMotion && 'DeviceMotionEvent' in window) {
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        sensors.motion = r === 'granted';
      } else sensors.motion = true;
    } catch { sensors.motion = false; }
  }
  if (s.useMic && navigator.mediaDevices?.getUserMedia) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      sensors.mic = true;
    } catch { sensors.mic = false; }
  }

  const alarmAt = nextAlarm(s);
  live = {
    id: uid(),
    start: Date.now(),
    epochs: [],
    events: [],
    alarmAt,
    windowStart: alarmAt ? alarmAt - s.smartWindow * 60000 : null,
    sensors,
    motionUsed: sensors.motion,
  };
  attach();
  store.saveLive(live);
  return live;
}

// Reprise après rechargement de l'app (ex. l'iPhone a rechargé la page)
function resume() {
  const saved = store.loadLive();
  if (!saved) return false;
  // Trop vieux (> 16 h) : on abandonne
  if (Date.now() - saved.start > 16 * 3600e3) { store.clearLive(); return false; }
  live = saved;
  live.sensors = { motion: false, mic: false };
  if ('DeviceMotionEvent' in window && typeof DeviceMotionEvent.requestPermission !== 'function') live.sensors.motion = true;
  live.resumed = true;
  attach();
  return true;
}

function attach() {
  acc = emptyAcc();
  lastAcc = null; grav = null;
  if (live.sensors.motion) window.addEventListener('devicemotion', onMotion);
  if (micStream) setupMic();
  sig = { ax: [], ay: [], az: [], snd: [] };
  binTimer = setInterval(pushBin, 1000 / FS);
  requestWakeLock();
  document.addEventListener('visibilitychange', onVisibility);
  tickTimer = setInterval(tick, 1000);
}

function setupMic() {
  const c = audioCtx();
  const src = c.createMediaStreamSource(micStream);
  // Bande 150-1500 Hz : celle de la respiration et du ronflement (on écarte grondements et sifflements)
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
  analyser = c.createAnalyser();
  analyser.fftSize = 2048;
  micBuf = new Float32Array(analyser.fftSize);
  src.connect(hp).connect(lp).connect(analyser); // jamais connecté aux haut-parleurs
  clearInterval(sampleTimer);
  sampleTimer = setInterval(sampleMic, 1000 / FS);
}

// Échantillonnage à 4 Hz pour l'analyse de la respiration
function pushBin() {
  if (bin.n) { sig.ax.push(bin.x / bin.n); sig.ay.push(bin.y / bin.n); sig.az.push(bin.z / bin.n); }
  bin = { x: 0, y: 0, z: 0, n: 0 };
  if (analyser) sig.snd.push(lastLvl);
}

// Actigraphie : on mesure l'accélération « propre » (sans la gravité) et on compte,
// comme un actigraphe médical, les échantillons dépassant un seuil (« activity counts »).
const COUNT_THRESHOLD = 0.035; // m/s² — au-dessus du bruit du capteur d'un iPhone posé à plat
function onMotion(e) {
  let x, y, z;
  const ag = e.accelerationIncludingGravity;
  if (ag && ag.x != null) { bin.x += ag.x; bin.y += ag.y; bin.z += ag.z; bin.n++; }
  const lin = e.acceleration;
  if (lin && lin.x != null) { x = lin.x; y = lin.y; z = lin.z; }
  else {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    if (!grav) grav = { x: a.x, y: a.y, z: a.z };
    grav.x = grav.x * 0.95 + a.x * 0.05; grav.y = grav.y * 0.95 + a.y * 0.05; grav.z = grav.z * 0.95 + a.z * 0.05;
    x = a.x - grav.x; y = a.y - grav.y; z = a.z - grav.z;
  }
  const mag = Math.sqrt(x * x + y * y + z * z);
  acc.motion += Math.max(0, mag - COUNT_THRESHOLD);
  if (mag > COUNT_THRESHOLD) acc.counts++;
  acc.samples++;
  lastSampleAt = Date.now();
}

function sampleMic() {
  if (!analyser) return;
  analyser.getFloatTimeDomainData(micBuf);
  let sum = 0;
  for (let i = 0; i < micBuf.length; i++) sum += micBuf[i] * micBuf[i];
  const rms = Math.sqrt(sum / micBuf.length);
  // Échelle 0-1 (log) : ~ -70 dBFS → 0, -20 dBFS → 1
  const db = 20 * Math.log10(rms + 1e-9);
  const lvl = Math.max(0, Math.min(1, (db + 70) / 50));
  lastLvl = lvl;
  acc.noiseSum += lvl; acc.noiseN++;
  acc.noiseMax = Math.max(acc.noiseMax, lvl);
  // Événement sonore : > 0,55 pendant au moins 1 s (toux, ronflement, bruit extérieur…)
  const now = Date.now();
  if (lvl > 0.55) {
    if (!loudSince) loudSince = now;
    else if (now - loudSince > 1000 && (!live.events.length || now - live.events[live.events.length - 1].t > 60000)) {
      live.events.push({ t: now, lvl: Math.round(lvl * 100) / 100 });
    }
  } else loudSince = 0;
}

function tick() {
  if (!live) return;
  const now = Date.now();
  const expected = Math.floor((now - live.start) / EPOCH_MS);
  while (live.epochs.length < expected) {
    const m = acc.samples ? Math.min(1, acc.motion / acc.samples * 4) : 0;
    const n = acc.noiseN ? Math.min(1, acc.noiseSum / acc.noiseN * 0.6 + acc.noiseMax * 0.4) : 0;
    // Trou de mesure : l'app a été mise en pause (écran verrouillé…) → on le signale
    // au lieu de le compter comme du sommeil immobile.
    const g = live.motionUsed && acc.samples < 60 ? 1 : 0;
    const ep = { m, n, c: acc.counts, g };
    // Respiration : on garde la source la plus régulière (matelas ou son)
    let best = null;
    for (const k of ['ax', 'ay', 'az']) {
      const b = breathing(sig[k]);
      if (b && b.bpm && (!best || b.r > best.r)) best = { ...b, src: 'a' };
    }
    const bs = breathing(sig.snd);
    if (bs && bs.bpm && (!best || bs.r > best.r)) best = { ...bs, src: 's' };
    if (best && best.r >= 0.3) { ep.br = best.bpm; ep.rr = best.r; ep.bs = best.src; }
    // Indices pour la détection du ronflement (son périodique au rythme respiratoire)
    if (sig.snd.length > 60) {
      const sorted = [...sig.snd].sort((a, b) => a - b);
      ep.sa = Math.round((sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)]) * 100) / 100;
      ep.sr = bs ? bs.r : 0;
    }
    live.epochs.push(ep);
    sig = { ax: [], ay: [], az: [], snd: [] };
    acc = emptyAcc();
    store.saveLive(live);
  }
  checkAlarm(now);
  emit('tick', live);
}

// Réveil intelligent : dans la fenêtre avant l'heure choisie, on sonne dès qu'un
// sommeil léger est détecté (mouvements), sinon à l'heure exacte.
function checkAlarm(now) {
  if (!live.alarmAt || alarmRinging) return;
  let ring = now >= live.alarmAt;
  if (!ring && live.windowStart && now >= live.windowStart && live.sensors.motion) {
    // Sommeil léger probable : au moins 2 des 3 dernières minutes avec des mouvements nets
    const recent = live.epochs.slice(-3).filter(e => !e.g);
    if (recent.length === 3 && recent.filter(e => (e.c || 0) >= 8).length >= 2) ring = true;
  }
  if (ring) {
    alarmRinging = true;
    startAlarm(store.settings.alarmSound);
    emit('alarm', live);
  }
}

function snooze(min = 9) {
  stopAlarm();
  alarmRinging = false;
  live.alarmAt = Date.now() + min * 60000;
  live.windowStart = null;
  store.saveLive(live);
}

function dismissAlarm() {
  stopAlarm();
  alarmRinging = false;
  if (live) { live.alarmAt = null; live.windowStart = null; }
}

async function requestWakeLock() {
  if (wakeLock && !wakeLock.released) return;
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { if (live && document.visibilityState === 'visible') setTimeout(requestWakeLock, 500); });
    }
  } catch { wakeLock = null; }
}
export const wakeLockActive = () => !!wakeLock && !wakeLock.released;

// Après un rechargement, iOS exige un nouveau geste (tap) pour réautoriser les capteurs
async function reenableSensors() {
  if (!live) return;
  if (!live.sensors.motion && 'DeviceMotionEvent' in window) {
    try {
      const r = typeof DeviceMotionEvent.requestPermission === 'function' ? await DeviceMotionEvent.requestPermission() : 'granted';
      if (r === 'granted') { live.sensors.motion = true; window.addEventListener('devicemotion', onMotion); }
    } catch {}
  }
  if (!micStream && store.settings.useMic && navigator.mediaDevices?.getUserMedia) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      setupMic();
      live.sensors.mic = true;
    } catch {}
  }
  requestWakeLock();
  store.saveLive(live);
}

function onVisibility() {
  if (document.visibilityState === 'visible' && live) requestWakeLock();
}

// Termine la nuit et renvoie les données brutes
function stop() {
  if (!live) return null;
  dismissAlarm();
  clearInterval(tickTimer); clearInterval(sampleTimer); clearInterval(binTimer);
  window.removeEventListener('devicemotion', onMotion);
  document.removeEventListener('visibilitychange', onVisibility);
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  analyser = null;
  try { wakeLock && wakeLock.release(); } catch {}
  wakeLock = null;
  const result = { ...live, end: Date.now() };
  live = null;
  store.clearLive();
  return result;
}
