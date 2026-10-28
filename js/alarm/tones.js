// Sons de réveil synthétisés en direct (Web Audio) : aucun fichier à télécharger,
// fonctionne hors ligne. Montée progressive du volume possible.
//
// Limites (iOS) : le contexte audio doit être débloqué par un geste (bouton
// « Commencer ma nuit ») ; il est suspendu si l'app passe en arrière-plan.

export const TONES = [
  { id: 'aube', label: 'Aube', desc: 'Carillon doux et ascendant' },
  { id: 'cristal', label: 'Cristal', desc: 'Notes claires et espacées' },
  { id: 'classique', label: 'Classique', desc: 'Bip à deux tons, plus insistant' },
];

let ctx = null;
let keepAlive = null;

export function audioContext() {
  if (!ctx) {
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/**
 * À appeler pendant un geste utilisateur : débloque l'audio et le maintient
 * actif (oscillateur à volume nul) pour que l'alarme puisse sonner sans nouveau geste.
 * Sur Safari ≥ 17, la session audio « playback » ignore le bouton silencieux.
 */
export async function unlockAudio({ keepAliveAll = false } = {}) {
  const c = audioContext();
  if (!c) return false;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* non pris en charge */ }
  try { await c.resume(); } catch { /* ignoré */ }
  const b = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(0);
  if (keepAliveAll && !keepAlive) {
    const o = c.createOscillator(), g = c.createGain();
    g.gain.value = 0;
    o.connect(g).connect(c.destination); o.start();
    keepAlive = { o, g };
  }
  return c.state === 'running';
}

export function releaseKeepAlive() {
  if (keepAlive) { try { keepAlive.o.stop(); } catch { /* déjà arrêté */ } keepAlive = null; }
}

function bell(c, out, t, freq, dur, level = 1) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  for (const [mult, amp] of [[1, 1], [2.01, 0.35], [3.02, 0.12], [4.2, 0.06]]) {
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'sine'; o.frequency.value = freq * mult; og.gain.value = amp;
    o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.05);
  }
}

function beep(c, out, t, freq, dur) {
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = 'square'; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.value = 2400;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  g.gain.setValueAtTime(0.35, t + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}

const PATTERNS = {
  // Chaque motif programme ~2,4 s de sons à partir de t et renvoie sa durée.
  aube(c, out, t) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(c, out, t + i * 0.32, f, 1.8, 0.5)); return 2.6; },
  cristal(c, out, t) { bell(c, out, t, 1318.5, 2.2, 0.45); bell(c, out, t + 0.6, 1567.98, 2.0, 0.35); return 2.4; },
  classique(c, out, t) { for (let i = 0; i < 4; i++) beep(c, out, t + i * 0.28, i % 2 ? 660 : 880, 0.2); return 1.4; },
};

/**
 * Démarre une sonnerie en boucle. Renvoie { stop() }.
 * fadeInSec : montée du volume de 5 % au volume choisi.
 */
export function playTone({ tone = 'aube', volume = 0.8, fadeInSec = 0, loop = true, maxSec = 600 } = {}) {
  const c = audioContext();
  if (!c) return { stop() {}, ok: false };
  c.resume?.();
  const master = c.createGain();
  const now = c.currentTime;
  if (fadeInSec > 0) {
    master.gain.setValueAtTime(Math.max(0.0001, volume * 0.05), now);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + fadeInSec);
  } else master.gain.setValueAtTime(volume, now);
  master.connect(c.destination);
  const pattern = PATTERNS[tone] || PATTERNS.aube;
  let next = now + 0.05, stopped = false;
  const end = now + maxSec;
  const pump = () => {
    if (stopped) return;
    while (next < c.currentTime + 1.5 && next < end) next += pattern(c, master, next) + (loop ? 0.6 : 0);
    if (!loop) return;
    timer = setTimeout(pump, 500);
  };
  let timer = null;
  pump();
  return {
    ok: true,
    stop() {
      stopped = true; clearTimeout(timer);
      const t = c.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.15);
      setTimeout(() => master.disconnect(), 300);
    },
  };
}

/** Aperçu court d'un son (dans les réglages). */
export function previewTone(tone, volume) {
  const p = playTone({ tone, volume, loop: false });
  setTimeout(() => p.stop(), 3000);
  return p;
}
