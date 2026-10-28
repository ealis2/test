// Moteur d'alarme dans l'application.
//
// Ce qu'il garantit : tant que Somnia est ouverte au premier plan (écran allumé),
// l'alarme sonne à l'heure, avec le son, le volume et la montée progressive choisis.
// Si l'app a été suspendue par le système, l'alarme sonne dès le retour au premier
// plan et le retard est enregistré (« sonnée en retard de 12 min »), jamais masqué.
//
// Ce qu'il ne peut PAS garantir sur le web : sonner quand l'app est fermée ou
// l'écran verrouillé. Pour ce cas, Somnia programme en plus une notification push
// côté serveur (js/alarm/push.js) et recommande une alarme de secours système.

import { playTone, unlockAudio, releaseKeepAlive } from './tones.js';
import { nextOccurrence, toMs } from '../core/time.js';

const LATE_SEC = 90;

export function createAlarmEngine({ repo, onRing, onStateChange, clock = () => Date.now() }) {
  let timer = null;
  let ringing = null;      // { kind, alarm, startedAt, late, player }
  let wakeLock = null;
  const firedRecurring = new Map(); // alarmId → instant déjà sonné (évite les doublons)

  const now = clock;

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => { wakeLock = null; onStateChange?.(); });
        onStateChange?.();
        return true;
      }
    } catch { /* refusé (batterie faible, iOS < 18.4 en mode app…) */ }
    return false;
  }
  function releaseWakeLock() { try { wakeLock?.release(); } catch { /* déjà libéré */ } wakeLock = null; }

  function sessionAlarmDue() {
    const s = repo.session;
    if (!s || !s.alarm || !s.alarm.enabled || s.alarm.dismissedAt) return null;
    const at = toMs(s.alarm.nextAt || s.alarm.plannedAt);
    return at !== null && now() >= at ? at : null;
  }

  function recurringDue() {
    if (repo.session) return null; // pendant une session, seule l'alarme de la session compte
    for (const a of repo.alarms) {
      if (!a.enabled) continue;
      // Occurrence la plus récente dans les 3 dernières minutes
      const occ = nextOccurrence(a.time, now() - 3 * 60000, a.tz, a.days);
      if (occ !== null && occ <= now() && firedRecurring.get(a.id) !== occ) return { alarm: a, at: occ };
    }
    return null;
  }

  async function check() {
    if (ringing) return;
    const due = sessionAlarmDue();
    if (due !== null) return ring({ kind: 'session', at: due, alarm: repo.session.alarm });
    const rec = recurringDue();
    if (rec) { firedRecurring.set(rec.alarm.id, rec.at); return ring({ kind: 'recurring', at: rec.at, alarm: rec.alarm }); }
  }

  async function ring({ kind, at, alarm }) {
    const lateSec = Math.max(0, Math.round((now() - at) / 1000));
    const player = playTone({ tone: alarm.sound, volume: alarm.volume ?? 0.8, fadeInSec: lateSec > LATE_SEC ? 0 : alarm.fadeInSec ?? 0 });
    try { navigator.vibrate?.([600, 300, 600, 300, 600]); } catch { /* non pris en charge */ }
    ringing = { kind, alarm, at, startedAt: now(), late: lateSec > LATE_SEC, lateSec, player };
    if (kind === 'session') {
      const s = repo.session;
      await repo.setSession({ ...s, alarm: { ...s.alarm, rangAt: s.alarm.rangAt || new Date().toISOString(), lateSec: s.alarm.lateSec ?? lateSec }, events: [...(s.events || []), { t: new Date().toISOString(), kind: 'alarm-ring', lateSec }] });
    }
    await repo.logAlarm({ kind: 'ring', source: kind, label: alarm.label || 'Réveil', scheduledAt: new Date(at).toISOString(), lateSec, audio: player.ok });
    onRing?.(ringing);
  }

  async function stopRinging() {
    ringing?.player.stop();
    try { navigator.vibrate?.(0); } catch { /* ignoré */ }
  }

  async function snooze() {
    if (!ringing) return;
    const min = ringing.alarm.snoozeMin || 9;
    await stopRinging();
    const next = new Date(now() + min * 60000).toISOString();
    if (ringing.kind === 'session') {
      const s = repo.session;
      await repo.setSession({ ...s, alarm: { ...s.alarm, nextAt: next, snoozes: (s.alarm.snoozes || 0) + 1 }, events: [...(s.events || []), { t: new Date().toISOString(), kind: 'snooze', minutes: min }] });
    } else {
      // Rappel d'une alarme récurrente (tant que l'app reste ouverte)
      setTimeout(() => ring({ kind: 'recurring', at: toMs(next), alarm: ringing.alarm }), min * 60000);
    }
    await repo.logAlarm({ kind: 'snooze', label: ringing.alarm.label || 'Réveil', minutes: min });
    ringing = null;
    onStateChange?.();
    return next;
  }

  async function dismiss() {
    if (!ringing) return;
    await stopRinging();
    const r = ringing;
    ringing = null;
    if (r.kind === 'session') {
      const s = repo.session;
      await repo.setSession({ ...s, alarm: { ...s.alarm, dismissedAt: new Date().toISOString() }, events: [...(s.events || []), { t: new Date().toISOString(), kind: 'alarm-dismiss' }] });
    }
    await repo.logAlarm({ kind: 'dismiss', label: r.alarm.label || 'Réveil', afterSec: Math.round((now() - r.startedAt) / 1000) });
    onStateChange?.();
    return r;
  }

  function onVisibility() {
    const s = repo.session;
    if (s) {
      const kind = document.visibilityState === 'visible' ? 'resume' : 'background';
      repo.setSession({ ...s, events: [...(s.events || []), { t: new Date().toISOString(), kind }].slice(-200) });
      if (kind === 'resume') requestWakeLock();
    }
    check();
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(check, 1000);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pageshow', check);
      window.addEventListener('focus', check);
      if (repo.session) requestWakeLock();
      check();
    },
    /** Démarrage d'une session : appelé pendant le geste « Commencer ma nuit ». */
    async beginNight() {
      const audio = await unlockAudio({ keepAliveAll: true });
      const lock = await requestWakeLock();
      return { audio, wakeLock: lock };
    },
    async endNight() { releaseWakeLock(); releaseKeepAlive(); await stopRinging(); ringing = null; },
    get ringing() { return ringing; },
    get wakeLockActive() { return !!wakeLock; },
    snooze, dismiss, check, requestWakeLock,
  };
}
