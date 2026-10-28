// Accueil : la dernière nuit, la régularité, la tendance, le prochain réveil et
// une observation pertinente. Les analyses détaillées restent dans « Analyses ».

import { h, icon } from '../ui/dom.js';
import { dial } from '../ui/charts.js';
import { statTile, evidenceBadge, cite } from '../ui/components.js';
import { onePerNight, inRange, summarize, sleepRegularityIndex, dailySeries, cumulativeBalance } from '../core/analysis.js';
import { buildInsights } from '../core/insights.js';
import { fmtDuration, fmtDateKey, fmtClock, fmtRelativeDays, fmtNumber } from '../core/format.js';
import { addDays, nextOccurrence, zonedParts, daysBetweenKeys, toMs } from '../core/time.js';
import { demoBanner } from './shared.js';

export function nextAlarm(app) {
  const now = Date.now();
  let best = null;
  const s = app.repo.session;
  if (s?.alarm?.enabled && !s.alarm.dismissedAt) {
    const at = toMs(s.alarm.nextAt || s.alarm.plannedAt);
    if (at) best = { at, label: 'Réveil de la session', tz: app.tz };
  }
  for (const a of app.repo.alarms) {
    if (!a.enabled) continue;
    const at = nextOccurrence(a.time, now, a.tz, a.days);
    if (at && (!best || at < best.at)) best = { at, label: a.label, tz: a.tz, alarm: a };
  }
  return best;
}

export function render(app) {
  const { repo } = app;
  const today = app.todayKey();
  const p = app.prepared();
  const { nights } = onePerNight(p.nights);
  const last = nights.at(-1);
  const hour = zonedParts(Date.now(), app.tz).hour;
  const greeting = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  const root = h('div', { class: 'home' });
  if (repo.hasDemo) root.append(demoBanner(app));
  if (repo.session) {
    root.append(h('a', { class: 'banner info', href: '#/sleep' }, icon('moon'), h('span', { class: 'grow' }, `Session de sommeil en cours depuis ${fmtClock(zonedParts(repo.session.startedAt, repo.session.tz).minutesOfDay)}.`), h('b', null, 'Reprendre')));
  }

  root.append(h('header', { class: 'home-head' },
    h('p', { class: 'eyebrow' }, fmtDateKey(today)),
    h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, greeting)));

  if (!last) {
    root.append(h('section', { class: 'hero plate' },
      h('div', { class: 'hero-empty' },
        dial({ size: 220, bed: null, onset: null, wake: null, now: zonedParts(Date.now(), app.tz).minutesOfDay, label: 'Cadran de 24 heures vide' }),
        h('div', { class: 'grid-gap' },
          h('h2', { class: 'h2' }, 'Votre journal commence ce soir'),
          h('p', { class: 'prose' }, 'Lancez une session au coucher : Somnia note vos horaires, vous réveille et vous pose quelques questions le matin. Vous pouvez aussi saisir une nuit passée.'),
          h('div', { class: 'row-actions' },
            h('a', { class: 'btn primary', href: '#/sleep' }, icon('moon'), 'Préparer ma nuit'),
            h('a', { class: 'btn ghost', href: '#/entry/new' }, icon('plus'), 'Ajouter une nuit')),
          !repo.hasDemo ? h('p', { class: 'small faint' }, 'Envie d\'explorer d\'abord ? ', h('a', { href: '#/settings/data' }, 'Charger un jeu de démonstration'), ' (clairement identifié et supprimable).') : null))));
  } else {
    root.append(heroLastNight(app, last, today));
  }

  // Indicateurs clés
  const recent = inRange(p.nights, addDays(today, -6), today);
  const prev = inRange(p.nights, addDays(today, -13), addDays(today, -7));
  const s7 = summarize(recent), sp = summarize(prev);
  const sri = sleepRegularityIndex(inRange(p.nights, addDays(today, -29), today), p.naps);
  const series = dailySeries(p.nights, addDays(today, -6), today);
  const bal = cumulativeBalance(series, repo.settings.goalMin, 7);
  const next = nextAlarm(app);

  const delta = !s7.tst.insufficient && !sp.tst.insufficient ? s7.tst.mean - sp.tst.mean : null;
  root.append(h('section', { class: 'section', 'aria-labelledby': 'k-title' },
    h('h2', { class: 'eyebrow', id: 'k-title' }, 'En un coup d\'œil'),
    h('div', { class: 'stats four' },
      statTile({
        label: 'Moyenne 7 j', na: s7.tst.insufficient,
        value: s7.tst.insufficient ? 'Pas assez de nuits' : fmtDuration(s7.tst.mean),
        delta: delta === null ? null : `${fmtDuration(delta, { signed: true })} vs 7 j précédents`,
        deltaTone: delta === null || Math.abs(delta) < 15 ? 'neutral' : delta > 0 ? 'positive' : 'attention',
        meta: `${s7.tst.n} nuit(s) avec temps de sommeil`,
      }),
      statTile({
        label: 'Régularité (SRI 30 j)', na: sri.insufficient,
        value: sri.insufficient ? (s7.bedSd !== null ? `± ${fmtDuration(s7.bedSd)}` : '—') : fmtNumber(sri.sri),
        meta: sri.insufficient ? (s7.bedSd !== null ? 'variabilité du coucher (7 j) · SRI : 7 paires de jours requises' : `SRI : ${sri.pairs} paire(s) de jours consécutifs sur 7 requises`) : `sur 100 · ${sri.pairs} paires de jours`,
      }),
      statTile({
        label: 'Bilan 7 nuits', na: bal.insufficient,
        value: bal.insufficient ? '—' : fmtDuration(bal.balance, { signed: true }),
        meta: bal.insufficient ? `${bal.known}/7 nuits connues (5 requises)` : `vs objectif ${fmtDuration(repo.settings.goalMin)} · ${bal.known}/7 nuits`,
        deltaTone: 'neutral',
      }),
      statTile({
        label: 'Prochain réveil', na: !next,
        value: next ? fmtClock(zonedParts(next.at, next.tz).minutesOfDay) : 'Aucun',
        meta: next ? `${fmtRelativeDays(-daysBetweenKeys(today, zonedParts(next.at, next.tz).dateKey)).replace('dans 0 jours', 'aujourd\'hui')} · ${next.label}` : 'Programmer un réveil',
      }))));

  // Actions
  root.append(h('div', { class: 'section row-actions home-actions' },
    h('a', { class: 'btn primary', href: '#/sleep' }, icon('moon'), repo.session ? 'Reprendre la nuit' : 'Préparer ma nuit'),
    h('a', { class: 'btn ghost', href: '#/entry/new' }, icon('plus'), 'Ajouter une nuit'),
    h('a', { class: 'btn ghost', href: '#/alarms' }, icon('alarm'), 'Réveils')));

  // Observations
  const insights = buildInsights(p, { todayKey: today, goalMin: repo.settings.goalMin, limit: 3 });
  root.append(h('section', { class: 'section' },
    h('div', { class: 'plate-head' }, h('h2', { class: 'eyebrow' }, 'Observations'), h('a', { class: 'small', href: '#/stats' }, 'Toutes les analyses')),
    h('div', { class: 'plate' }, insights.map(i => h('article', { class: 'insight' },
      h('div', { class: 'title' }, h('span', { class: 'row' }, h('span', { class: ['tone', i.tone] }), ' ', i.title), evidenceBadge(i.level)),
      h('p', null, i.text),
      i.refs ? cite(i.refs) : null,
      i.link ? h('a', { class: 'small', href: i.link }, 'Voir le détail') : null)))));
  return root;
}

function heroLastNight(app, last, today) {
  const m = last.m, e = last.e;
  const ago = daysBetweenKeys(m.nightKey, today);
  const value = m.tst ?? m.spt ?? m.tib;
  const what = m.tst !== null ? (m.tstSource === 'measured' ? 'de sommeil mesuré' : 'de sommeil estimé')
    : m.spt !== null ? 'de période de sommeil (éveils nocturnes non renseignés)'
    : 'au lit (latence et éveils non renseignés)';
  const h_ = Math.floor(Math.round(value) / 60), mm = Math.round(value) % 60;
  return h('section', { class: 'hero plate', 'aria-labelledby': 'hero-title' },
    h('div', { class: 'hero-grid' },
      h('div', { class: 'hero-text' },
        h('p', { class: 'eyebrow', id: 'hero-title' }, ago <= 1 ? 'Dernière nuit' : `Dernière nuit enregistrée · ${fmtRelativeDays(ago)}`),
        h('p', { class: 'display', 'aria-label': fmtDuration(value) }, String(h_), h('span', { class: 'unit' }, 'h'), String(mm).padStart(2, '0')),
        h('p', { class: 'muted' }, what, m.tst !== null ? ` · objectif ${fmtDuration(app.repo.settings.goalMin)}` : ''),
        h('dl', { class: 'kv hero-kv' },
          h('div', null, h('dt', null, 'Coucher'), h('dd', null, fmtClock(m.bedClock))),
          h('div', null, h('dt', null, 'Lever'), h('dd', null, m.outClock === null ? 'non renseigné' : fmtClock(m.outClock))),
          h('div', null, h('dt', null, 'Qualité ressentie'), h('dd', null, m.quality === null ? 'non renseignée' : `${m.quality} / 5`))),
        h('a', { class: 'btn small ghost', href: `#/entry/${e.id}` }, 'Détail de la nuit', icon('chevronRight'))),
      h('div', { class: 'hero-dial' },
        dial({ size: 232, bed: m.bedClock, onset: m.onsetClock, wake: m.wakeClock, out: m.outClock, label: `Nuit du ${fmtDateKey(m.nightKey)} : coucher ${fmtClock(m.bedClock)}, réveil ${fmtClock(m.wakeClock)}` }),
        h('p', { class: 'dial-caption micro faint' }, h('i', { class: 'lg dusk' }), 'coucher ', h('i', { class: 'lg moon' }), 'sommeil ', h('i', { class: 'lg dawn' }), 'réveil'))));
}
