// Suivi de la nuit : accéléromètre + micro (niveau sonore uniquement, rien n'est enregistré),
// maintien de l'écran allumé et réveil intelligent.
import { store, uid, timeToMinutes } from './store.js';
import { audioCtx, startAlarm, stopAlarm } from './sounds.js';

const EPOCH_MS = 60000;

let live = null;          // { id, start, epochs, events, alarmAt, windowStart, sensors }
let wakeLock = null;
let micStream = null, analyser = null, micBuf = null;
let tickTimer = null, sampleTimer = null;
let acc = { motion: 0, samples: 0, noiseSum: 0, noiseMax: 0, noiseN: 0 };
let lastAcc = null;
let loudSince = 0;
let listeners = { tick: [], alarm: [] };
let alarmRinging = false;

export const tracker = {
  get active() { return !!live; },
  get live() { return live; },
  get alarmRinging() { return alarmRinging; },
  on(evt, fn) { listeners[evt].push(fn); },
  start, stop, resume, snooze, dismissAlarm,
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
  attach();
  return true;
}

function attach() {
  acc = { motion: 0, samples: 0, noiseSum: 0, noiseMax: 0, noiseN: 0 };
  lastAcc = null;
  if (live.sensors.motion) window.addEventListener('devicemotion', onMotion);
  if (micStream) {
    const c = audioCtx();
    const src = c.createMediaStreamSource(micStream);
    analyser = c.createAnalyser();
    analyser.fftSize = 2048;
    micBuf = new Float32Array(analyser.fftSize);
    src.connect(analyser); // pas connecté aux haut-parleurs
    sampleTimer = setInterval(sampleMic, 250);
  }
  requestWakeLock();
  document.addEventListener('visibilitychange', onVisibility);
  tickTimer = setInterval(tick, 1000);
}

function onMotion(e) {
  const a = e.accelerationIncludingGravity || e.acceleration;
  if (!a || a.x == null) return;
  if (lastAcc) {
    const d = Math.abs(a.x - lastAcc.x) + Math.abs(a.y - lastAcc.y) + Math.abs(a.z - lastAcc.z);
    // On ignore le bruit du capteur (< 0,02 m/s²)
    acc.motion += Math.max(0, d - 0.02);
    acc.samples++;
  }
  lastAcc = { x: a.x, y: a.y, z: a.z };
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
    live.epochs.push({ m, n });
    acc = { motion: 0, samples: 0, noiseSum: 0, noiseMax: 0, noiseN: 0 };
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
    const recent = live.epochs.slice(-3);
    const all = live.epochs.map(e => e.m).sort((a, b) => a - b);
    const p70 = all[Math.floor(all.length * 0.7)] || 0.05;
    if (recent.length === 3 && recent.filter(e => e.m > p70 && e.m > 0.01).length >= 2) ring = true;
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
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { wakeLock = null; }
}

function onVisibility() {
  if (document.visibilityState === 'visible' && live) requestWakeLock();
}

// Termine la nuit et renvoie les données brutes
function stop() {
  if (!live) return null;
  dismissAlarm();
  clearInterval(tickTimer); clearInterval(sampleTimer);
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
