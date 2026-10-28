// Écran de sonnerie : plein écran, lumière d'aube, deux gestes (arrêter / répéter).

import { h, icon, fill } from '../ui/dom.js';
import { zonedParts } from '../core/time.js';
import { fmtClock, fmtDuration } from '../core/format.js';
import { ack } from '../alarm/push.js';

export function showRinging(app, ringing) {
  const root = document.getElementById('overlay-root');
  const tz = app.repo.session?.tz || app.tz;
  const time = h('p', { class: 'ring-time' }, fmtClock(zonedParts(Date.now(), tz).minutesOfDay));
  const tick = setInterval(() => { time.textContent = fmtClock(zonedParts(Date.now(), tz).minutesOfDay); }, 5000);
  const close = () => { clearInterval(tick); overlay.remove(); };

  const dismiss = async () => {
    const r = await app.engine.dismiss();
    close();
    const cred = app.repo.settings.push;
    if (cred?.enabled) ack(cred, r?.kind === 'session' ? `session-${app.repo.session?.id}` : `alarm-${r?.alarm?.id}`);
    if (r?.kind === 'session') {
      const s = app.repo.session;
      await app.repo.setSession({ ...s, endedAt: new Date().toISOString() });
      await app.engine.endNight();
      app.navigate('#/sleep/morning');
    }
  };
  const snooze = async () => {
    const next = await app.engine.snooze();
    close();
    if (next && ringing.kind === 'session') app.rerender();
  };

  const overlay = h('div', { class: 'ring', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'ring-title' },
    h('div', { class: 'ring-sun', 'aria-hidden': 'true' }),
    h('div', { class: 'ring-inner' },
      h('p', { class: 'eyebrow', id: 'ring-title' }, ringing.alarm.label || 'Réveil'),
      time,
      ringing.late ? h('p', { class: 'ring-late' }, `Sonne avec ${fmtDuration(ringing.lateSec / 60)} de retard : l'app était suspendue.`) : null,
      !ringing.player.ok ? h('p', { class: 'ring-late' }, 'Son indisponible sur cet appareil.') : null,
      h('div', { class: 'ring-actions' },
        h('button', { class: 'btn primary ring-stop', type: 'button', onclick: dismiss }, icon('sunrise'), 'Arrêter'),
        h('button', { class: 'btn ghost', type: 'button', onclick: snooze }, icon('snooze'), `Répéter dans ${ringing.alarm.snoozeMin || 9} min`))));
  fill(root, overlay);
  overlay.querySelector('.ring-stop').focus();
}
