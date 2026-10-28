// Réglages, données (export / import / suppression), confidentialité, à propos.

import { h, icon, toast, confirmSheet, downloadFile } from '../ui/dom.js';
import { plate, segmented } from '../ui/components.js';
import { AGE_GROUPS } from '../science/knowledge.js';
import { toCSV, parseJSONImport, parseCSVImport } from '../data/importexport.js';
import { generateDemo } from '../data/demo.js';
import { disablePush } from '../alarm/push.js';
import { fmtDuration } from '../core/format.js';
import { DB_VERSION } from '../data/db.js';
import { SCHEMA_VERSION } from '../core/model.js';

export const APP_VERSION = '2.0.0';

export function render(app, section) {
  const { repo } = app;
  const s = repo.settings;
  const root = h('div', { class: 'settings' },
    h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, 'Somnia ' + APP_VERSION), h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, 'Réglages'))));

  root.append(plate({ eyebrow: 'Objectifs', title: 'Vous', children: h('div', { class: 'fields' },
    h('label', { class: 'field' }, h('span', null, 'Objectif de sommeil'), h('select', { onchange: e => repo.setSettings({ goalMin: +e.target.value }).then(() => app.rerender()) }, [360, 390, 420, 450, 480, 510, 540, 570, 600].map(v => h('option', { value: v, selected: v === s.goalMin }, fmtDuration(v)))),
      h('span', { class: 'hint' }, 'Sert de repère dans les graphiques et le calendrier. Il ne modifie aucun calcul.')),
    h('label', { class: 'field' }, h('span', null, 'Tranche d\'âge'), h('select', { onchange: e => repo.setSettings({ ageGroup: e.target.value }).then(() => app.rerender()) }, AGE_GROUPS.map(a => h('option', { value: a.id, selected: a.id === s.ageGroup }, a.label))),
      h('span', { class: 'hint' }, 'Utilisée pour afficher les recommandations adaptées. Somnia ne demande pas votre âge exact.'))) }));

  root.append(h('div', { class: 'section' }, plate({ eyebrow: 'Affichage', title: 'Apparence', children: h('div', { class: 'fields' },
    h('div', { class: 'field' }, h('span', null, 'Thème'), segmented([['night', 'Nuit'], ['dawn', 'Aube (clair)'], ['system', 'Système']], s.theme, v => repo.setSettings({ theme: v }).then(() => app.rerender()), 'Thème')),
    h('div', { class: 'field' }, h('span', null, 'Animations'), segmented([['system', 'Selon le système'], ['on', 'Réduites']], s.reducedMotion, v => repo.setSettings({ reducedMotion: v }).then(() => app.rerender()), 'Animations'))) })));

  // Données
  const fileInput = h('input', { type: 'file', 'aria-label': 'Fichier à importer (JSON ou CSV)', accept: '.json,.csv,application/json,text/csv', class: 'sr-only', onchange: async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const res = /\.csv$/i.test(f.name) || f.type === 'text/csv' ? parseCSVImport(text, app.tz) : parseJSONImport(text, app.tz);
      const existing = new Set(repo.episodes.map(x => x.id));
      const fresh = res.episodes.filter(x => !existing.has(x.id));
      const ok = await confirmSheet({ title: 'Importer ces données ?', text: `${res.episodes.length} épisode(s) valides (${fresh.length} nouveaux, ${res.episodes.length - fresh.length} déjà présents qui seront mis à jour), ${res.rejected.length} rejeté(s) pour incohérence. Format : ${res.format}.`, confirm: 'Importer' });
      if (!ok) return;
      await repo.bulkAddEpisodes(res.episodes);
      for (const a of res.alarms || []) if (a && a.id && a.time) await repo.saveAlarm(a);
      toast(`${res.episodes.length} épisode(s) importé(s).`);
      app.rerender();
    } catch (err) { toast(err.message, { timeout: 8000 }); }
  } });
  const stamp = new Date().toISOString().slice(0, 10);
  root.append(h('div', { class: 'section', id: 'data' }, plate({ eyebrow: 'Vos données', title: 'Export, import, suppression', children: [
    h('p', { class: 'prose' }, `${repo.episodes.length} épisode(s) et ${repo.alarms.length} réveil(s) enregistrés sur cet appareil${repo.persistent ? '' : ' (stockage temporaire : rien ne sera conservé à la fermeture)'}.`),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => downloadFile(`somnia-${stamp}.json`, JSON.stringify(repo.exportData(), null, 2), 'application/json') }, icon('download'), 'Exporter (JSON complet)'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => downloadFile(`somnia-journal-${stamp}.csv`, toCSV(repo.episodes), 'text/csv;charset=utf-8') }, icon('download'), 'Exporter (CSV tableur)'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Importer'), fileInput),
    h('p', { class: 'small faint' }, 'Import accepté : export Somnia (JSON, y compris l\'ancienne version) ou CSV avec au minimum les colonnes « coucher » et « reveil_final » ou « lever » (dates ISO 8601). Les lignes incohérentes sont rejetées et comptées.'),
    h('hr', { class: 'rule' }),
    h('p', { class: 'h3' }, 'Jeu de démonstration'),
    h('p', { class: 'small muted' }, '120 nuits synthétiques, clairement signalées partout, pour explorer les analyses. Elles ne décrivent aucune personne réelle.'),
    repo.hasDemo
      ? h('button', { class: 'btn ghost', type: 'button', onclick: async () => { const n = await repo.removeDemo(); toast(`${n} épisodes de démonstration supprimés.`); app.rerender(); } }, 'Retirer la démonstration')
      : h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await repo.bulkAddEpisodes(generateDemo({ todayKey: app.todayKey(), tz: app.tz })); toast('Démonstration chargée.'); app.navigate('#/home'); } }, icon('sparkle'), 'Charger la démonstration'),
    h('hr', { class: 'rule' }),
    h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!(await confirmSheet({ title: 'Tout supprimer ?', text: 'Toutes les nuits, réveils, réglages et l\'historique seront effacés de cet appareil, et l\'abonnement aux notifications sera supprimé du serveur. Exportez d\'abord si vous souhaitez conserver une copie. Action irréversible.', confirm: 'Tout supprimer', danger: true }))) return;
      if (repo.settings.push?.enabled) await disablePush(repo.settings.push);
      await repo.wipeAll();
      toast('Toutes les données ont été supprimées.');
      app.navigate('#/home');
    } }, icon('trash'), 'Supprimer toutes mes données'),
  ] })));

  root.append(h('div', { class: 'section', id: 'privacy' }, plate({ eyebrow: 'Confidentialité', title: 'Où vont vos données ?', children: h('div', { class: 'prose' },
    h('p', null, h('strong', null, 'Sur votre appareil uniquement. '), 'Votre journal, vos statistiques et vos réglages sont stockés localement (IndexedDB). Somnia n\'a ni compte, ni publicité, ni mesure d\'audience, et n\'utilise aucun service d\'intelligence artificielle.'),
    h('p', null, h('strong', null, 'Exception, sur demande : les notifications de secours. '), 'Si vous les activez, le serveur de Somnia reçoit l\'adresse technique d\'abonnement push fournie par votre navigateur, votre fuseau horaire et les heures de vos réveils et rappels. Aucune donnée de sommeil n\'est transmise. Désactiver les notifications ou tout supprimer efface cet abonnement du serveur.'),
    h('p', null, h('strong', null, 'Liens externes. '), 'Les liens DOI et PubMed ouvrent les sites des éditeurs, qui ont leur propre politique.'),
    h('p', null, h('strong', null, 'Vos droits. '), 'Exportez à tout moment (JSON ou CSV) et supprimez tout en un geste. Les données de sommeil peuvent être sensibles : protégez l\'accès à votre appareil.'),
    h('p', null, h('a', { href: 'docs/PRIVACY.md' }, 'Politique de confidentialité complète'))) })));

  root.append(h('div', { class: 'section' }, plate({ eyebrow: 'À propos', title: 'Somnia', children: [
    h('p', { class: 'prose' }, 'Journal et analyse du sommeil. Somnia n\'est pas un dispositif médical et ne pose aucun diagnostic.'),
    h('dl', { class: 'kv' },
      h('div', null, h('dt', null, 'Version'), h('dd', null, APP_VERSION)),
      h('div', null, h('dt', null, 'Schéma des données'), h('dd', null, `v${SCHEMA_VERSION} · base v${DB_VERSION}`)),
      h('div', null, h('dt', null, 'Stockage'), h('dd', null, repo.persistent ? 'IndexedDB (persistant)' : 'Mémoire (temporaire)')),
      h('div', null, h('dt', null, 'Fuseau de l\'appareil'), h('dd', null, app.tz))),
    h('a', { class: 'btn quiet small', href: 'design/directions.html' }, 'Directions artistiques explorées'),
  ] })));

  if (section === 'data') requestAnimationFrame(() => document.getElementById('data')?.scrollIntoView());
  return root;
}
