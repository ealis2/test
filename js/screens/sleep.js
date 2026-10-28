// Mode sommeil : préparer la nuit, l'écran de nuit minimaliste, puis le
// questionnaire du matin qui transforme la session en épisode du journal.

import { h, icon, toast, confirmSheet, openSheet, fill } from '../ui/dom.js';
import { dial } from '../ui/charts.js';
import { switchInput, cite } from '../ui/components.js';
import { TONES, previewTone } from '../alarm/tones.js';
import { pushSupported, isStandalone, syncSchedule, ack } from '../alarm/push.js';
import { nextOccurrence, zonedParts, toMs, MIN, addDays, parseHHMM } from '../core/time.js';
import { inRange, onePerNight } from '../core/analysis.js';
import { describe } from '../core/stats.js';
import { fmtDuration, fmtClock, fmtDateKey } from '../core/format.js';
import { newEpisode, uid } from '../core/model.js';
import { episodeForm } from './episodeForm.js';
import { nextAlarm } from './home.js';

const clockOf = (ms, tz) => zonedParts(ms, tz).minutesOfDay;
const hhmm = (ms, tz) => fmtClock(clockOf(ms, tz));

export function render(app) {
  return app.repo.session ? renderNight(app) : renderPrepare(app);
}

// ------------------------------------------------------------------ Préparation
function typicalLatency(app) {
  const today = app.todayKey();
  const { nights } = onePerNight(inRange(app.prepared().nights, addDays(today, -29), today));
  const d = describe(nights.map(x => x.m.sol), { minN: 3 });
  return d.insufficient ? { value: 15, personal: false, n: d.n } : { value: Math.round(d.median), personal: true, n: d.n };
}

function renderPrepare(app) {
  const { repo, tz } = app;
  const now = Date.now();
  const na = nextAlarm(app);
  const within20h = na && na.at - now < 20 * 3600e3;
  const def = within20h ? na.alarm : null;
  const goal = repo.settings.goalMin;
  const state = {
    enabled: true,
    time: def ? def.time : repo.settings.targetWake || '07:00',
    sound: def?.sound || 'aube', volume: def?.volume ?? 0.8, fadeInSec: def?.fadeInSec ?? 60, snoozeMin: def?.snoozeMin ?? 9,
  };
  const lat = typicalLatency(app);

  const summary = h('div', { class: 'prep-summary', 'aria-live': 'polite' });
  const dialWrap = h('div', { class: 'prep-dial' });
  const renderSummary = () => {
    const wakeAt = state.enabled ? nextOccurrence(state.time, Date.now(), tz, []) : null;
    const nowC = clockOf(Date.now(), tz);
    fill(dialWrap, dial({ size: 250, bed: nowC, onset: (nowC + lat.value) % 1440, wake: wakeAt ? clockOf(wakeAt, tz) : null, now: nowC, planned: true, label: wakeAt ? `Nuit prévue de ${fmtClock(nowC)} à ${hhmm(wakeAt, tz)}` : 'Nuit sans alarme' }));
    if (!wakeAt) { fill(summary, h('p', { class: 'muted' }, 'Sans alarme : la session enregistre vos horaires et vous noterez votre réveil vous-même.')); return; }
    const inBed = (wakeAt - Date.now()) / MIN;
    const potential = inBed - lat.value;
    const idealBed = (clockOf(wakeAt, tz) - goal - lat.value + 1440) % 1440;
    fill(summary, 
      h('p', { class: 'prep-big' }, h('span', { class: 'display small-display' }, fmtDuration(potential)), h('span', { class: 'muted' }, ' de sommeil possible')),
      h('dl', { class: 'kv' },
        h('div', null, h('dt', null, 'Au lit jusqu\'au réveil'), h('dd', null, fmtDuration(inBed))),
        h('div', null, h('dt', null, lat.personal ? 'Votre latence habituelle' : 'Latence supposée'), h('dd', null, `${lat.value} min`, h('small', null, lat.personal ? ` (médiane de ${lat.n} nuits)` : ' (hypothèse, pas encore de données)'))),
        h('div', null, h('dt', null, `Coucher pour ${fmtDuration(goal)}`), h('dd', null, fmtClock(idealBed)))),
      potential < goal - 30 ? h('p', { class: 'small muted' }, `C'est ${fmtDuration(goal - potential)} de moins que votre objectif. Aucun problème ponctuellement : c'est la régularité qui compte sur la durée.`) : null);
  };

  const timeInput = h('input', { type: 'time', class: 'input big-time', value: state.time, 'aria-label': 'Heure du réveil', oninput: e => { if (parseHHMM(e.target.value) !== null) { state.time = e.target.value; renderSummary(); } } });
  const options = h('div', { class: 'fields prep-options' });
  const renderOptions = () => fill(options, 
    h('label', { class: 'field' }, h('span', null, 'Son'),
      h('div', { class: 'tone-row' },
        h('select', { onchange: e => { state.sound = e.target.value; } }, TONES.map(t => h('option', { value: t.id, selected: t.id === state.sound }, `${t.label} — ${t.desc}`))),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => previewTone(state.sound, state.volume) }, icon('volume'), 'Écouter'))),
    h('label', { class: 'field' }, h('span', null, `Volume : ${Math.round(state.volume * 100)} %`),
      h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: state.volume, oninput: e => { state.volume = +e.target.value; e.target.previousSibling.textContent = `Volume : ${Math.round(state.volume * 100)} %`; } })),
    h('div', { class: 'fields two' },
      h('label', { class: 'field' }, h('span', null, 'Montée progressive'), h('select', { onchange: e => { state.fadeInSec = +e.target.value; } }, [[0, 'Aucune'], [30, '30 s'], [60, '1 min'], [120, '2 min']].map(([v, t]) => h('option', { value: v, selected: v === state.fadeInSec }, t)))),
      h('label', { class: 'field' }, h('span', null, 'Répétition'), h('select', { onchange: e => { state.snoozeMin = +e.target.value; } }, [5, 9, 10, 15].map(v => h('option', { value: v, selected: v === state.snoozeMin }, `${v} min`))))));
  renderOptions();

  const pushOn = repo.settings.push?.enabled;
  const reliability = h('section', { class: 'plate reliability' },
    h('p', { class: 'eyebrow' }, 'Fiabilité de l\'alarme'),
    h('ul', { class: 'checks' },
      check(true, 'Sonne à l\'heure si Somnia reste ouverte au premier plan.', 'L\'écran est maintenu allumé quand le système le permet (iOS 18.4+ en mode app).'),
      check(pushOn, pushOn ? 'Notification de secours active si l\'app est fermée.' : 'Notification de secours inactive.', pushOn ? 'Envoyée par le serveur à l\'heure du réveil : un son de notification, pas une sonnerie continue.' : pushSupported() ? (isStandalone() ? h('a', { href: '#/alarms' }, 'Activer dans Réveils') : 'Sur iPhone : ajoutez Somnia à l\'écran d\'accueil pour pouvoir l\'activer.') : 'Non prise en charge par ce navigateur.'),
      check(null, 'Pour un réveil important, gardez une alarme système de secours.', h('a', { href: '#/alarms' }, 'Exporter vers le calendrier (.ics)'))),
    h('details', { class: 'method' }, h('summary', null, 'Pourquoi pas de « réveil intelligent » ?'),
      h('div', { class: 'body' }, h('p', null, 'Réveiller en « sommeil léger » suppose de détecter les phases de sommeil. Un téléphone posé sur le matelas ne le fait pas de façon fiable, et aucune étude solide ne montre que ces apps réduisent la somnolence du réveil. Somnia sonne donc à l\'heure choisie, sans promesse.'), cite(['bhat2015', 'campanella2024']))));

  const start = async btn => {
    btn.disabled = true;
    const startedAt = new Date().toISOString();
    const plannedAt = state.enabled ? new Date(nextOccurrence(state.time, Date.now(), tz, [])).toISOString() : null;
    const caps = await app.engine.beginNight();
    await repo.setSession({
      id: uid(), tz, startedAt,
      alarm: state.enabled ? { enabled: true, plannedAt, sound: state.sound, volume: state.volume, fadeInSec: state.fadeInSec, snoozeMin: state.snoozeMin, label: 'Réveil', snoozes: 0 } : { enabled: false },
      events: [{ t: startedAt, kind: 'start', audio: caps.audio, wakeLock: caps.wakeLock }],
    });
    sessionStorage.setItem('somnia.leftNight', '1');
    document.body.classList.add('entering-night');
    setTimeout(() => document.body.classList.remove('entering-night'), 1600);
    app.rerender();
  };

  renderSummary();
  return h('div', { class: 'sleep-prep' },
    h('header', { class: 'page-head' },
      h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, fmtDateKey(app.todayKey())), h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, 'Préparer ma nuit'))),
    h('div', { class: 'prep-grid' },
      h('section', { class: 'plate prep-main' },
        h('div', { class: 'prep-time' },
          h('div', null,
            h('p', { class: 'eyebrow' }, 'Réveil'),
            timeInput),
          switchInput({ label: 'Alarme', checked: state.enabled, onChange: v => { state.enabled = v; timeInput.disabled = !v; options.hidden = !v; renderSummary(); } })),
        dialWrap, summary,
        h('details', { class: 'method' }, h('summary', null, 'Son, volume et répétition'), h('div', { class: 'body' }, options)),
        h('button', { class: 'btn primary block start-night', type: 'button', onclick: e => start(e.currentTarget) }, icon('moon'), 'Commencer ma nuit'),
        h('p', { class: 'micro faint center' }, 'Laissez Somnia ouverte, l\'écran vers le bas ou en luminosité minimale, branchée si possible.')),
      reliability));
}

function check(ok, text, sub) {
  return h('li', { class: ['check', ok === true ? 'ok' : ok === false ? 'ko' : 'tip'] },
    icon(ok === true ? 'check' : ok === false ? 'close' : 'info'),
    h('div', null, h('p', null, text), sub ? h('p', { class: 'small faint' }, sub) : null));
}

// ------------------------------------------------------------------ Écran de nuit
function renderNight(app) {
  const { repo } = app;
  const s = repo.session;
  const tz = s.tz;
  const startedMs = toMs(s.startedAt);
  const root = h('div', { class: 'night', role: 'region', 'aria-label': 'Session de sommeil en cours' });
  const clock = h('p', { class: 'night-clock', 'aria-live': 'off' });
  const sub = h('p', { class: 'night-sub' });
  const dialWrap = h('div', { class: 'night-dial' });
  const status = h('p', { class: 'night-status micro' });
  const horizon = h('div', { class: 'night-horizon', 'aria-hidden': 'true' });
  let dim = false;
  const veil = h('button', { class: 'night-veil', type: 'button', 'aria-label': 'Rallumer l\'affichage', hidden: true, onclick: () => { dim = false; veil.hidden = true; } });

  const tick = () => {
    if (!root.isConnected) { clearInterval(timer); return; }
    const cur = repo.session;
    if (!cur) return;
    const now = Date.now();
    const nowC = clockOf(now, tz);
    clock.textContent = fmtClock(nowC);
    const at = cur.alarm?.enabled ? toMs(cur.alarm.nextAt || cur.alarm.plannedAt) : null;
    sub.textContent = at
      ? (at > now ? `Réveil à ${hhmm(at, tz)} · dans ${fmtDuration((at - now) / MIN)}` : 'Réveil en cours')
      : `Sans alarme · nuit commencée à ${hhmm(startedMs, tz)}`;
    if (cur.alarm?.snoozes) sub.textContent += ` · ${cur.alarm.snoozes} répétition(s)`;
    fill(dialWrap, dial({ size: 280, bed: clockOf(startedMs, tz), onset: null, wake: at ? clockOf(at, tz) : null, out: null, now: nowC, planned: true, label: 'Progression de la nuit' }));
    const progress = at ? Math.min(1, Math.max(0, (now - startedMs) / (at - startedMs))) : 0;
    horizon.style.opacity = String(0.15 + progress * 0.85);
    status.textContent = [
      app.engine.wakeLockActive ? 'Écran maintenu allumé' : 'Écran : verrouillage automatique possible — gardez Somnia ouverte',
      repo.settings.push?.enabled ? 'notification de secours programmée' : null,
    ].filter(Boolean).join(' · ');
  };
  const timer = setInterval(tick, 15000);

  const stopNow = async () => {
    await app.engine.endNight();
    const cur = repo.session;
    await repo.setSession({ ...cur, endedAt: new Date().toISOString(), events: [...(cur.events || []), { t: new Date().toISOString(), kind: 'end' }] });
    if (repo.settings.push?.enabled) ack(repo.settings.push, `session-${cur.id}`);
    app.navigate('#/sleep/morning');
  };
  const cancel = async () => {
    if (!(await confirmSheet({ title: 'Annuler la session ?', text: 'La session sera supprimée sans créer d\'entrée dans le journal. L\'alarme de cette nuit sera désactivée.', confirm: 'Annuler la session', danger: true }))) return;
    await app.engine.endNight();
    await repo.setSession(null);
    toast('Session annulée.');
    app.navigate('#/home');
  };
  const editAlarm = () => {
    const cur = repo.session;
    const input = h('input', { type: 'time', class: 'input big-time', value: cur.alarm?.enabled ? hhmm(toMs(cur.alarm.nextAt || cur.alarm.plannedAt), tz) : '07:00' });
    openSheet({
      title: 'Modifier le réveil',
      body: h('div', { class: 'fields' }, h('label', { class: 'field' }, h('span', null, 'Nouvelle heure'), input)),
      foot: close => [
        cur.alarm?.enabled ? h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await repo.setSession({ ...repo.session, alarm: { ...repo.session.alarm, enabled: false } }); close(); tick(); } }, 'Désactiver') : null,
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const at = nextOccurrence(input.value, Date.now(), tz, []);
          if (!at) return;
          const base = repo.session.alarm?.enabled ? repo.session.alarm : { enabled: true, sound: 'aube', volume: 0.8, fadeInSec: 60, snoozeMin: 9, label: 'Réveil', snoozes: 0 };
          await repo.setSession({ ...repo.session, alarm: { ...base, enabled: true, plannedAt: new Date(at).toISOString(), nextAt: null, dismissedAt: null } });
          close(); tick(); toast(`Réveil à ${input.value}.`);
        } }, 'Enregistrer'),
      ],
    });
  };

  const forgotten = Date.now() - startedMs > 20 * 3600e3;
  root.append(horizon,
    h('div', { class: 'night-inner' },
      h('p', { class: 'eyebrow' }, `Nuit commencée à ${hhmm(startedMs, tz)}`),
      h('h1', { class: 'sr-only', id: 'page-title', tabindex: '-1' }, 'Nuit en cours'),
      clock, sub, dialWrap,
      forgotten ? h('p', { class: 'banner' }, icon('warning'), h('span', { class: 'grow' }, 'Cette session dure depuis plus de 20 h : vous pourrez corriger les horaires à l\'étape suivante.')) : null,
      h('div', { class: 'night-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: stopNow }, icon('sunrise'), 'Je me réveille'),
        h('div', { class: 'row-actions center' },
          h('button', { class: 'btn quiet small', type: 'button', onclick: () => { dim = true; veil.hidden = false; } }, 'Assombrir'),
          h('button', { class: 'btn quiet small', type: 'button', onclick: editAlarm }, 'Modifier le réveil'),
          h('button', { class: 'btn quiet small', type: 'button', onclick: cancel }, 'Annuler la session'),
          h('a', { class: 'btn quiet small', href: '#/home' }, 'Quitter l\'écran'))),
      status),
    veil);
  requestAnimationFrame(tick);
  syncSchedule(repo).catch(() => {});
  return root;
}

// ------------------------------------------------------------------ Questionnaire du matin
export function renderMorning(app) {
  const { repo } = app;
  const s = repo.session;
  if (!s) {
    return h('div', { class: 'empty' }, h('h1', { class: 'h2', id: 'page-title', tabindex: '-1' }, 'Aucune session en cours'), h('a', { class: 'btn ghost', href: '#/entry/new' }, 'Ajouter une nuit au journal'));
  }
  const tz = s.tz;
  const started = toMs(s.startedAt), ended = toMs(s.endedAt) ?? Date.now();
  const forgotten = ended - started > 20 * 3600e3;
  const plannedWake = s.alarm?.enabled ? toMs(s.alarm.plannedAt) : null;
  const finalWake = toMs(s.alarm?.dismissedAt) ?? (forgotten && plannedWake ? plannedWake : ended);
  const outOfBed = forgotten && plannedWake ? plannedWake + 10 * MIN : Math.max(ended, finalWake);
  const draft = newEpisode({
    tz, type: 'night',
    bedtime: s.startedAt,
    finalWake: new Date(finalWake).toISOString(),
    outOfBed: new Date(outOfBed).toISOString(),
    source: { kind: 'session' },
    session: { id: s.id, startedAt: s.startedAt, endedAt: new Date(ended).toISOString(), events: s.events || [] },
    alarm: s.alarm?.enabled ? { plannedAt: s.alarm.plannedAt, rangAt: s.alarm.rangAt || null, dismissedAt: s.alarm.dismissedAt || null, snoozes: s.alarm.snoozes || 0, lateSec: s.alarm.lateSec ?? null } : null,
  });
  const form = episodeForm(draft, { mode: 'morning' });
  const save = async () => {
    const r = await repo.saveEpisode(form.getDraft());
    if (!r.ok) { toast('Vérifiez les champs signalés.'); form.el.querySelector('.form-errors')?.scrollIntoView({ block: 'center' }); return; }
    await app.engine.endNight();
    await repo.setSession(null);
    sessionStorage.removeItem('somnia.leftNight');
    toast('Nuit enregistrée.');
    app.navigate(`#/entry/${r.episode.id}`);
  };
  const late = s.alarm?.lateSec > 90;
  return h('div', { class: 'morning' },
    h('header', { class: 'page-head' }, h('div', { class: 'grow' },
      h('p', { class: 'eyebrow' }, 'Bilan du matin'),
      h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, 'Comment s\'est passée la nuit ?'),
      h('p', { class: 'lead' }, 'Quelques estimations suffisent. Laissez vide ce dont vous ne vous souvenez pas.'))),
    late ? h('p', { class: 'banner' }, icon('warning'), h('span', { class: 'grow' }, `L'alarme a sonné avec ${fmtDuration(s.alarm.lateSec / 60)} de retard : Somnia était probablement suspendue par le système.`)) : null,
    forgotten ? h('p', { class: 'banner' }, icon('info'), h('span', { class: 'grow' }, 'Session restée ouverte longtemps : les heures de réveil et de lever ont été pré-remplies d\'après l\'alarme prévue. Corrigez-les si besoin.')) : null,
    h('div', { class: 'plate' }, form.el),
    h('div', { class: 'sticky-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        if (!(await confirmSheet({ title: 'Abandonner cette nuit ?', text: 'La session sera supprimée sans rien enregistrer.', confirm: 'Abandonner', danger: true }))) return;
        await repo.setSession(null); app.navigate('#/home');
      } }, 'Abandonner'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, icon('check'), 'Enregistrer la nuit')));
}
