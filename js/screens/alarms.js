// Réveils et routines : alarmes récurrentes, objectifs horaires, rappel du
// coucher, notifications de secours, export calendrier, historique.

import { h, icon, toast, openSheet, confirmSheet, downloadFile, fill } from '../ui/dom.js';
import { plate, switchInput, insufficient } from '../ui/components.js';
import { DEFAULT_ALARM } from '../data/repo.js';
import { TONES, previewTone } from '../alarm/tones.js';
import { pushSupported, isStandalone, serverStatus, enablePush, disablePush, sendTest, syncSchedule } from '../alarm/push.js';
import { buildICS } from '../alarm/ics.js';
import { nextOccurrence, parseHHMM, formatHHMM, deviceTimeZone } from '../core/time.js';
import { fmtDuration, fmtInstant, WEEKDAYS_LETTER, WEEKDAYS_LONG } from '../core/format.js';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function daysLabel(days) {
  if (!days || !days.length) return 'Une seule fois';
  if (days.length === 7) return 'Tous les jours';
  const s = [...days].sort().join(',');
  if (s === '1,2,3,4,5') return 'En semaine';
  if (s === '0,6') return 'Le week-end';
  return DAY_ORDER.filter(d => days.includes(d)).map(d => WEEKDAYS_LONG[d].slice(0, 3) + '.').join(' ');
}

export function render(app) {
  const { repo } = app;
  const root = h('div', { class: 'alarms' },
    h('header', { class: 'page-head' },
      h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'Réveils et routines'), h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, 'Réveils')),
      h('button', { class: 'btn small primary', type: 'button', onclick: () => editAlarm(app, DEFAULT_ALARM(), true) }, icon('plus'), 'Nouveau réveil')));

  root.append(h('div', { class: 'banner info', role: 'note' }, icon('info'), h('span', { class: 'grow' },
    'Un réveil sonne dans Somnia si l\'app est ouverte au premier plan. Si elle est fermée, une notification de secours peut être envoyée (ci-dessous). Pour un réveil important, gardez une alarme système.')));

  // --- Liste des alarmes
  const alarms = repo.alarms;
  root.append(plate({ eyebrow: 'Alarmes', children: alarms.length ? h('div', { class: 'list alarm-list' }, alarms.map(a => {
    const next = a.enabled ? nextOccurrence(a.time, Date.now(), a.tz, a.days) : null;
    return h('div', { class: ['item', !a.enabled && 'off'] },
      h('button', { class: 'alarm-main', type: 'button', onclick: () => editAlarm(app, structuredClone(a), false), 'aria-label': `Modifier le réveil ${a.label} de ${a.time}` },
        h('span', { class: 'alarm-time' }, a.time),
        h('span', { class: 'grow' }, h('b', null, a.label || 'Réveil'), h('span', { class: 'sub', style: { display: 'block' } }, daysLabel(a.days), next ? ` · prochain : ${fmtInstant(new Date(next).toISOString(), a.tz, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '', a.tz !== deviceTimeZone() ? ` · fuseau ${a.tz}` : ''))),
      switchInput({ label: '', checked: a.enabled, onChange: async v => { await repo.saveAlarm({ ...a, enabled: v }); app.rerender(); } }));
  })) : insufficient('Aucun réveil programmé. Ajoutez-en un pour vos jours habituels ; vous pourrez aussi choisir l\'heure chaque soir en préparant la nuit.') }));

  // --- Objectifs horaires et rappel du coucher
  const goal = repo.settings.goalMin;
  const br = repo.settings.bedtimeReminder || {};
  const targetWake = repo.settings.targetWake || (alarms.find(a => a.enabled)?.time) || '07:00';
  const targetBed = formatHHMM(parseHHMM(targetWake) - goal - 15);
  root.append(h('div', { class: 'section' }, plate({ eyebrow: 'Objectifs horaires', title: 'Mon rythme cible', children: [
    h('div', { class: 'fields two' },
      h('label', { class: 'field' }, h('span', null, 'Lever visé'), h('input', { type: 'time', value: targetWake, onchange: async e => { if (parseHHMM(e.target.value) !== null) { await repo.setSettings({ targetWake: e.target.value }); app.rerender(); } } })),
      h('label', { class: 'field' }, h('span', null, 'Objectif de sommeil'), h('select', { onchange: async e => { await repo.setSettings({ goalMin: +e.target.value }); app.rerender(); } }, [360, 390, 420, 450, 480, 510, 540, 570, 600].map(v => h('option', { value: v, selected: v === goal }, fmtDuration(v)))))),
    h('p', { class: 'small muted' }, `Pour dormir ${fmtDuration(goal)} et vous lever à ${targetWake}, visez le coucher vers `, h('b', null, targetBed), ' (15 min d\'endormissement supposées).'),
    h('hr', { class: 'rule' }),
    switchInput({ label: 'Rappel du coucher', hint: 'Notification avant l\'heure de coucher visée (nécessite les notifications de secours).', checked: !!br.enabled, onChange: async v => {
      await repo.setSettings({ bedtimeReminder: { ...br, enabled: v, minutesBefore: br.minutesBefore || 30, time: formatHHMM(parseHHMM(targetBed) - (br.minutesBefore || 30)), days: br.days || [], tz: deviceTimeZone() } });
      if (v && !repo.settings.push?.enabled) toast('Activez les notifications de secours pour recevoir ce rappel.');
      app.rerender();
    } }),
    br.enabled ? h('label', { class: 'field' }, h('span', null, 'Prévenir'), h('select', { onchange: async e => { const m = +e.target.value; await repo.setSettings({ bedtimeReminder: { ...br, minutesBefore: m, time: formatHHMM(parseHHMM(targetBed) - m) } }); app.rerender(); } },
      [15, 30, 45, 60, 90].map(v => h('option', { value: v, selected: v === (br.minutesBefore || 30) }, `${v} min avant (${formatHHMM(parseHHMM(targetBed) - v)})`)))) : null,
  ] })));

  // --- Notifications de secours
  root.append(h('div', { class: 'section' }, pushPanel(app)));

  // --- Calendrier
  const enabled = alarms.filter(a => a.enabled);
  root.append(h('div', { class: 'section' }, plate({ eyebrow: 'Alarme de secours système', title: 'Ajouter mes réveils au calendrier', children: [
    h('p', { class: 'prose' }, 'Les rappels du calendrier se déclenchent même si Somnia est fermée et le téléphone verrouillé. Le fichier est créé sur votre appareil.'),
    enabled.length ? h('div', { class: 'row-actions' },
      h('a', { class: 'btn ghost', href: icsServerUrl(enabled), target: '_blank', rel: 'noopener' }, icon('calendar'), 'Ouvrir dans Calendrier'),
      h('button', { class: 'btn quiet', type: 'button', onclick: () => downloadFile('somnia-reveils.ics', buildICS(enabled, app.todayKey()), 'text/calendar') }, icon('download'), 'Télécharger le .ics')) : insufficient('Activez au moins un réveil pour l\'exporter.'),
    h('p', { class: 'small faint' }, 'Sur iPhone, « Ouvrir dans Calendrier » propose d\'ajouter les événements récurrents ; vérifiez que les alertes du calendrier sont autorisées.'),
  ] })));

  // --- Historique
  const log = repo.alarmLog.slice(0, 30);
  const KIND = { ring: 'A sonné', snooze: 'Répété', dismiss: 'Arrêté' };
  root.append(h('div', { class: 'section' }, plate({ eyebrow: 'Historique', title: 'Derniers réveils', children: log.length ? h('ol', { class: 'timeline' }, log.map(l => h('li', null,
    h('span', { class: 'mono small' }, fmtInstant(l.at, app.tz, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })), ' ',
    `${KIND[l.kind] || l.kind} · ${l.label || 'Réveil'}`,
    l.lateSec > 90 ? h('span', { class: 'tag warn' }, ` retard ${fmtDuration(l.lateSec / 60)}`) : null,
    l.kind === 'snooze' ? ` (${l.minutes} min)` : '',
    l.kind === 'dismiss' && l.afterSec !== undefined ? ` après ${l.afterSec} s` : '',
    l.audio === false ? ' · son indisponible' : ''))) : insufficient('Aucun réveil enregistré pour l\'instant.') })));
  return root;
}

function icsServerUrl(alarms) {
  const q = alarms.map(a => `a=${encodeURIComponent([a.time, (a.days || []).join(','), a.label || 'Réveil', a.tz].join('|'))}`).join('&');
  return `api/ics.php?${q}`;
}

function editAlarm(app, a, isNew) {
  const { repo } = app;
  const daysWrap = h('div', { class: 'chips', role: 'group', 'aria-label': 'Jours de répétition' });
  const renderDays = () => fill(daysWrap, ...DAY_ORDER.map(d => h('button', { type: 'button', class: 'chip day', 'aria-pressed': String(a.days.includes(d)), 'aria-label': WEEKDAYS_LONG[d], onclick: () => { a.days = a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d]; renderDays(); } }, WEEKDAYS_LETTER[d])),
    h('span', { class: 'small faint days-hint' }, a.days.length ? '' : 'Aucun jour : une seule fois'));
  renderDays();
  const volLabel = h('span', null, `Volume : ${Math.round(a.volume * 100)} %`);
  openSheet({
    title: isNew ? 'Nouveau réveil' : 'Modifier le réveil',
    body: h('div', { class: 'fields' },
      h('label', { class: 'field' }, h('span', null, 'Heure'), h('input', { type: 'time', class: 'big-time', value: a.time, required: true, oninput: e => { if (parseHHMM(e.target.value) !== null) a.time = e.target.value; } })),
      h('label', { class: 'field' }, h('span', null, 'Nom'), h('input', { type: 'text', maxlength: 40, value: a.label, oninput: e => { a.label = e.target.value; } })),
      h('div', { class: 'field' }, h('span', null, 'Répétition'), daysWrap,
        h('div', { class: 'row-actions' }, [['En semaine', [1, 2, 3, 4, 5]], ['Week-end', [0, 6]], ['Tous les jours', [0, 1, 2, 3, 4, 5, 6]]].map(([t, d]) => h('button', { type: 'button', class: 'btn small quiet', onclick: () => { a.days = [...d]; renderDays(); } }, t)))),
      h('label', { class: 'field' }, h('span', null, 'Son'), h('div', { class: 'tone-row' },
        h('select', { onchange: e => { a.sound = e.target.value; } }, TONES.map(t => h('option', { value: t.id, selected: t.id === a.sound }, `${t.label} — ${t.desc}`))),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => previewTone(a.sound, a.volume) }, icon('volume'), 'Écouter'))),
      h('label', { class: 'field' }, volLabel, h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: a.volume, oninput: e => { a.volume = +e.target.value; volLabel.textContent = `Volume : ${Math.round(a.volume * 100)} %`; } })),
      h('div', { class: 'fields two' },
        h('label', { class: 'field' }, h('span', null, 'Montée progressive'), h('select', { onchange: e => { a.fadeInSec = +e.target.value; } }, [[0, 'Aucune'], [30, '30 s'], [60, '1 min'], [120, '2 min']].map(([v, t]) => h('option', { value: v, selected: v === a.fadeInSec }, t)))),
        h('label', { class: 'field' }, h('span', null, 'Répétition (snooze)'), h('select', { onchange: e => { a.snoozeMin = +e.target.value; } }, [5, 9, 10, 15].map(v => h('option', { value: v, selected: v === a.snoozeMin }, `${v} min`))))),
      switchInput({ label: 'Notification de secours si l\'app est fermée', checked: a.push !== false, onChange: v => { a.push = v; } }),
      h('p', { class: 'small faint' }, `Fuseau horaire : ${a.tz}. Pas de « réveil intelligent » : aucune mesure fiable ne permet de détecter le sommeil léger avec le téléphone.`)),
    foot: close => [
      !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmSheet({ title: 'Supprimer ce réveil ?', text: `${a.time} · ${a.label}`, confirm: 'Supprimer', danger: true })) { await repo.deleteAlarm(a.id); close(); app.rerender(); } } }, icon('trash')) : null,
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { await repo.saveAlarm({ ...a, enabled: isNew ? true : a.enabled }); close(); toast(`Réveil ${a.time} enregistré.`); app.rerender(); } }, 'Enregistrer'),
    ],
  });
}

function pushPanel(app) {
  const { repo } = app;
  const cred = repo.settings.push || {};
  const body = h('div', { class: 'push-body' }, h('p', { class: 'small muted' }, 'Vérification du service…'));
  const panel = plate({ eyebrow: 'Notifications de secours', title: 'Être prévenu même si l\'app est fermée', children: [
    h('p', { class: 'prose' }, 'Le serveur Hostinger envoie une notification à l\'heure du réveil. Seuls l\'abonnement technique, le fuseau et les heures des réveils lui sont transmis, jamais vos nuits.'),
    body,
    h('details', { class: 'method' }, h('summary', null, 'Limites'), h('div', { class: 'body' },
      h('p', null, 'Une notification émet le son de notification du système une seule fois (puis une relance 5 min plus tard si vous n\'avez pas ouvert l\'app). Elle respecte le mode silencieux et les modes de concentration : ce n\'est pas une sonnerie continue.'),
      h('p', null, 'Sur iPhone, elle n\'est disponible que si Somnia est ajoutée à l\'écran d\'accueil (iOS 16.4 ou plus récent). L\'hébergeur doit exécuter la tâche planifiée chaque minute (voir la documentation d\'installation).'))),
  ] });
  (async () => {
    const st = await serverStatus();
    const lines = [];
    const ok = (good, text) => h('li', { class: ['check', good ? 'ok' : 'ko'] }, icon(good ? 'check' : 'close'), h('div', null, h('p', null, text)));
    lines.push(ok(pushSupported(), pushSupported() ? 'Navigateur compatible' : 'Navigateur incompatible avec les notifications push'));
    if (/iPhone|iPad/.test(navigator.userAgent)) lines.push(ok(isStandalone(), isStandalone() ? 'Somnia est ouverte depuis l\'écran d\'accueil' : 'Ajoutez Somnia à l\'écran d\'accueil (Partager → Sur l\'écran d\'accueil)'));
    lines.push(ok(st.available, st.available ? 'Service de notification disponible' : st.reason));
    if (st.available) lines.push(ok(st.cronHealthy, st.cronHealthy ? `Tâche planifiée active (dernier passage : ${new Date(st.cronLastRun).toLocaleTimeString('fr-FR')})` : 'Tâche planifiée inactive : les notifications ne partiront pas tant que le cron n\'est pas configuré.'));
    const canEnable = pushSupported() && st.available && (!/iPhone|iPad/.test(navigator.userAgent) || isStandalone());
    fill(body, h('ul', { class: 'checks' }, lines),
      cred.enabled
        ? h('div', { class: 'row-actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: async () => { try { await sendTest(cred); toast('Notification de test envoyée.'); } catch (e) { toast(e.message); } } }, icon('bell'), 'Tester'),
          h('button', { class: 'btn quiet', type: 'button', onclick: async () => { await disablePush(cred); await repo.setSettings({ push: { enabled: false } }); toast('Notifications désactivées et abonnement supprimé du serveur.'); app.rerender(); } }, 'Désactiver'))
        : h('button', { class: 'btn primary', type: 'button', disabled: !canEnable, onclick: async e => {
          e.currentTarget.disabled = true;
          try {
            const c = await enablePush({ tz: deviceTimeZone() });
            await repo.setSettings({ push: { enabled: true, ...c } });
            await syncSchedule(repo);
            toast('Notifications de secours activées.');
          } catch (err) { toast(err.message, { timeout: 8000 }); }
          app.rerender();
        } }, icon('bell'), 'Activer les notifications'));
  })();
  return panel;
}
