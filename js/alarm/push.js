// Notifications de réveil quand l'app est fermée : Web Push (iOS ≥ 16.4 pour une
// app ajoutée à l'écran d'accueil ; Android, ordinateur).
//
// Fonctionnement : le navigateur crée un abonnement push ; Somnia envoie au
// serveur Hostinger (api/push.php) UNIQUEMENT cet abonnement, le fuseau horaire
// et les heures des réveils/rappels. Une tâche cron (api/cron.php), lancée chaque
// minute, envoie la notification à l'heure prévue. Aucune donnée de sommeil
// n'est transmise.
//
// Limite honnête : une notification n'est pas une sonnerie continue. Elle émet le
// son de notification du système (une fois), respecte le mode silencieux et les
// modes de concentration. Elle sert de filet de sécurité, pas d'alarme principale.

const API = 'api/push.php';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iOS : le push n'est disponible que dans l'app installée (écran d'accueil). */
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export async function serverStatus() {
  try {
    const r = await fetch(`${API}?action=status`, { cache: 'no-store' });
    if (!r.ok) return { available: false, reason: `Serveur indisponible (HTTP ${r.status}).` };
    const j = await r.json();
    return { available: !!j.ok, publicKey: j.publicKey, cronLastRun: j.cron?.lastRun || null, cronHealthy: !!j.cron?.healthy, reason: j.error || null };
  } catch {
    return { available: false, reason: 'Service de notification non joignable (hébergement sans PHP ou hors ligne).' };
  }
}

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function post(action, body) {
  const r = await fetch(`${API}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = null;
  try { j = await r.json(); } catch { /* réponse non JSON */ }
  if (!r.ok || !j?.ok) throw new Error(j?.error || `Erreur serveur (HTTP ${r.status})`);
  return j;
}

/** Active les notifications (doit être appelé pendant un geste utilisateur). */
export async function enablePush({ tz }) {
  if (!pushSupported()) throw new Error('Ce navigateur ne prend pas en charge les notifications push.');
  const st = await serverStatus();
  if (!st.available) throw new Error(st.reason || 'Service indisponible.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Autorisation de notification refusée. Vous pouvez la modifier dans les réglages du système.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(st.publicKey) });
  const j = await post('subscribe', { subscription: sub.toJSON(), tz });
  return { id: j.id, token: j.token, enabledAt: new Date().toISOString() };
}

export async function disablePush(cred) {
  try { if (cred?.id) await post('delete', cred); } catch { /* déjà supprimé côté serveur */ }
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); await sub?.unsubscribe(); } catch { /* ignoré */ }
}

export async function sendTest(cred) { return post('test', cred); }
export async function ack(cred, tag) { try { await post('ack', { ...cred, tag }); } catch { /* sans conséquence */ } }

/** Construit la liste des notifications à programmer à partir de l'état de l'app. */
export function buildSchedule(repo) {
  const items = [];
  for (const a of repo.alarms) {
    if (!a.enabled || a.push === false) continue;
    items.push({ key: `alarm-${a.id}`, kind: 'alarm', time: a.time, days: a.days || [], tz: a.tz, title: `⏰ ${a.label || 'Réveil'}`, body: `Il est ${a.time}. Ouvrez Somnia pour arrêter l'alarme.`, nag: true });
  }
  const s = repo.session;
  if (s?.alarm?.enabled && !s.alarm.dismissedAt) {
    const at = s.alarm.nextAt || s.alarm.plannedAt;
    items.push({ key: `session-${s.id}`, kind: 'once', at, title: '⏰ Réveil', body: 'C\'est l\'heure. Ouvrez Somnia pour arrêter l\'alarme et noter votre nuit.', nag: true });
  }
  const br = repo.settings.bedtimeReminder;
  if (br?.enabled && br.time) {
    items.push({ key: 'bedtime', kind: 'alarm', time: br.time, days: br.days || [], tz: br.tz, title: '🌙 Bientôt l\'heure de dormir', body: 'Rappel du coucher programmé dans Somnia.', nag: false });
  }
  return items;
}

/** Envoie le planning au serveur si les notifications sont actives. */
export async function syncSchedule(repo) {
  const cred = repo.settings.push;
  if (!cred?.enabled || !cred.id) return { skipped: true };
  return post('schedule', { id: cred.id, token: cred.token, items: buildSchedule(repo) });
}
