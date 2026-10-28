// Comprendre son sommeil : repères officiels, définitions des indicateurs,
// expérimentations personnelles, limites des appareils, quand consulter, sources.

import { h, icon } from '../ui/dom.js';
import { plate, evidenceBadge, cite } from '../ui/components.js';
import { REFERENCES, REF_BY_ID, REF_TYPES, shortCite } from '../science/references.js';
import { AGE_GROUPS, AGE_BY_ID, QUALITY_MARKERS, METRIC_DOCS, EXPERIMENTS, CONSULT, DEVICE_LIMITS, EVIDENCE } from '../science/knowledge.js';
import { workFree, inRange } from '../core/analysis.js';
import { addDays } from '../core/time.js';
import { fmtDuration } from '../core/format.js';

const TABS = [['guide', 'Repères'], ['metrics', 'Indicateurs'], ['experiments', 'Expériences'], ['limits', 'Limites'], ['refs', 'Sources']];

export function render(app, tab = 'guide', refId) {
  if (tab === 'ref' && refId) return refPage(refId);
  if (!TABS.some(([k]) => k === tab)) tab = 'guide';
  const root = h('div', { class: 'science' },
    h('header', { class: 'page-head' }, h('div', { class: 'grow' },
      h('p', { class: 'eyebrow' }, 'Science du sommeil'),
      h('h1', { class: 'h1', id: 'page-title', tabindex: '-1' }, TABS.find(([k]) => k === tab)[1]),
      h('p', { class: 'lead' }, 'Chaque affirmation renvoie à une source identifiable. Les niveaux de preuve distinguent consensus, recherche et observations tirées de vos données.'))),
    h('nav', { class: 'seg stats-tabs', 'aria-label': 'Rubriques' }, TABS.map(([k, t]) => h('a', { class: 'seg-link', href: `#/science/${k}`, 'aria-current': k === tab ? 'page' : null }, t))),
    h('div', { class: 'evidence-legend' }, Object.keys(EVIDENCE).map(k => h('span', null, evidenceBadge(k), h('span', { class: 'small faint' }, EVIDENCE[k].desc)))));
  root.append({ guide, metrics, experiments, limits, refs }[tab](app));
  return root;
}

function guide(app) {
  const age = AGE_BY_ID[app.repo.settings.ageGroup] || AGE_BY_ID['26-64'];
  const wrap = h('div', { class: 'section' });
  wrap.append(plate({ eyebrow: 'Durée recommandée', title: `Pour la tranche ${age.label}`, aside: evidenceBadge('consensus'), children: [
    h('div', { class: 'reco' },
      h('div', null, h('p', { class: 'eyebrow' }, 'National Sleep Foundation'), h('p', { class: 'display small-display' }, `${age.nsf[0]}–${age.nsf[1]} h`), h('p', { class: 'small muted' }, `recommandé ; ${age.nsfMay[0]}–${age.nsfMay[1]} h peut convenir`)),
      h('div', null, h('p', { class: 'eyebrow' }, 'AASM / SRS'), h('p', { class: 'display small-display' }, age.aasm), h('p', { class: 'small muted' }, 'par 24 h, de façon régulière'))),
    h('p', { class: 'small muted' }, 'Ces fourchettes décrivent des populations : vos besoins personnels peuvent s\'en écarter. ', h('a', { href: '#/settings' }, 'Changer de tranche d\'âge ou d\'objectif')),
    cite(['hirshkowitz2015', age.aasmRef].filter(Boolean)),
    h('details', { class: 'method' }, h('summary', null, 'Toutes les tranches d\'âge'), h('div', { class: 'body table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Durées recommandées par âge' },
      h('table', { class: 'data-table' }, h('thead', null, h('tr', null, h('th', null, 'Âge'), h('th', null, 'NSF recommandé'), h('th', null, 'Peut convenir'), h('th', null, 'AASM'))),
        h('tbody', null, AGE_GROUPS.map(a => h('tr', null, h('th', { scope: 'row' }, a.label), h('td', null, `${a.nsf[0]}–${a.nsf[1]} h`), h('td', null, `${a.nsfMay[0]}–${a.nsfMay[1]} h`), h('td', null, a.aasm))))))),
  ] }));
  wrap.append(h('div', { class: 'section' }, plate({ eyebrow: 'Continuité du sommeil (adultes)', title: 'Repères de bonne qualité', aside: evidenceBadge('consensus'), children: [
    h('dl', { class: 'kv' }, QUALITY_MARKERS.map(q => h('div', null, h('dt', null, q.label), h('dd', null, q.good)))),
    h('p', { class: 'small faint' }, 'Repères de la National Sleep Foundation associés à une bonne qualité de sommeil. Seuls ceux-ci ont pu être recoupés ; les seuils par âge et de « mauvaise qualité » figurent dans l\'article.'),
    cite(['ohayon2017']),
  ] })));
  wrap.append(h('div', { class: 'section' }, plate({ eyebrow: 'Au-delà de la durée', title: 'La régularité compte aussi', aside: evidenceBadge('research'), children: [
    h('p', { class: 'prose' }, 'Dans une grande cohorte britannique, la régularité du sommeil (SRI) prédisait la mortalité plus fortement que la durée. C\'est une association observationnelle : elle ne prouve pas qu\'améliorer sa régularité allonge la vie. Elle justifie toutefois de suivre la régularité autant que la durée.'),
    cite(['windred2024', 'phillips2017']),
  ] })));
  wrap.append(h('div', { class: 'section' }, plate({ eyebrow: 'Santé', title: 'Quand en parler à un professionnel', children: [
    h('p', { class: 'prose' }, CONSULT.intro),
    h('ul', { class: 'bullets' }, CONSULT.items.map(i => h('li', null, i))),
    h('p', { class: 'prose' }, CONSULT.cbti),
    h('p', { class: 'small muted' }, 'Pour préparer une consultation, exportez votre journal (Réglages → Exporter, CSV) : c\'est le format d\'agenda du sommeil que les soignants connaissent.'),
    cite(CONSULT.refs),
  ] })));
  return wrap;
}

function metrics() {
  return h('div', { class: 'section metric-docs' }, METRIC_DOCS.map(m => plate({ eyebrow: m.unit, title: m.name, children: [
    h('p', { class: 'metric-q' }, m.question),
    h('dl', { class: 'kv doc' },
      h('div', null, h('dt', null, 'Données'), h('dd', null, m.inputs)),
      h('div', null, h('dt', null, 'Formule'), h('dd', null, m.formula)),
      h('div', null, h('dt', null, 'Données manquantes'), h('dd', null, m.missing)),
      h('div', null, h('dt', null, 'Limites'), h('dd', null, m.limits))),
    cite(m.refs),
  ] })));
}

function experiments(app) {
  const today = app.todayKey();
  const wf = workFree(inRange(app.prepared().nights, addDays(today, -29), today));
  const sig = { socialJetlag: wf.socialJetlag };
  return h('div', { class: 'section' },
    h('p', { class: 'prose' }, 'Plutôt que des règles, des expériences de deux à trois semaines. Notez le contexte chaque matin, puis comparez avant et après dans Analyses → Comparer. Les recommandations « Recherche » s\'appuient sur des études ; le résultat chez vous peut différer.'),
    EXPERIMENTS.map(x => plate({ eyebrow: x.when && x.when(sig) ? 'Suggéré par vos données' : 'Expérience', title: x.title, aside: evidenceBadge(x.evidence), cls: x.when && x.when(sig) ? 'suggested' : null, children: [
      h('p', { class: 'prose' }, x.why),
      x.when && x.when(sig) ? h('p', { class: 'small' }, evidenceBadge('personal'), ` Votre jet-lag social sur 30 jours : ${fmtDuration(sig.socialJetlag)}.`) : null,
      h('dl', { class: 'kv' }, h('div', null, h('dt', null, 'Protocole'), h('dd', null, x.how)), h('div', null, h('dt', null, 'À observer'), h('dd', null, x.watch.join(', ')))),
      cite(x.refs),
    ] })),
    h('p', { class: 'small faint' }, 'Aucune de ces suggestions ne remplace un avis médical. En cas de trouble persistant, voir « Quand en parler à un professionnel ».'));
}

function limits() {
  return h('div', { class: 'section' }, DEVICE_LIMITS.map(d => plate({ title: d.title, children: [h('p', { class: 'prose' }, d.text), cite(d.refs)] })),
    plate({ title: 'Ce que Somnia mesure, et ce qu\'elle ne mesure pas', children: h('ul', { class: 'bullets' },
      h('li', null, 'Mesuré par l\'app : l\'heure de début et de fin d\'une session, l\'heure à laquelle l\'alarme a sonné et a été arrêtée, les passages en arrière-plan.'),
      h('li', null, 'Déclaré par vous : latence, réveils, qualité, contexte. Ce sont des estimations subjectives, signalées comme telles.'),
      h('li', null, 'Jamais estimé : les phases de sommeil (léger, profond, paradoxal), la respiration, le ronflement. Un score global de sommeil n\'est pas calculé non plus, car il mélangerait des grandeurs différentes.'),
      h('li', null, 'Importé (à venir) : une donnée provenant d\'une montre ou d\'Apple Santé / Health Connect conserve sa provenance et est marquée « mesurée ».')) }));
}

function refs() {
  const groups = {};
  for (const r of REFERENCES) (groups[r.type] ||= []).push(r);
  return h('div', { class: 'section' },
    h('p', { class: 'small muted' }, 'Méthode de vérification : chaque référence a été recoupée le 28 octobre 2026 dans plusieurs index (PubMed, PMC, éditeurs) par titre, DOI, revue, volume et pages. Le DOI permet de vérifier la source à l\'origine. ', h('a', { href: '#/science/limits' }, 'Pourquoi aucune phase de sommeil ?')),
    Object.entries(groups).map(([type, list]) => h('section', { class: 'section' },
      h('h2', { class: 'eyebrow' }, REF_TYPES[type] || type),
      h('ol', { class: 'refs' }, list.sort((a, b) => (b.year || 0) - (a.year || 0)).map(refItem)))));
}

function refItem(r) {
  return h('li', { id: `ref-${r.id}` },
    h('p', null, h('a', { href: `#/science/ref/${r.id}` }, h('b', null, shortCite(r.id))), ' — ', r.title),
    h('p', { class: 'small faint' }, [r.authors, r.journal, r.year, r.volume && `${r.volume}`, r.pages].filter(Boolean).join(' · '),
      r.doi ? [' · ', h('a', { href: `https://doi.org/${r.doi}`, target: '_blank', rel: 'noopener noreferrer' }, `doi:${r.doi}`)] : r.url ? [' · ', h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'lien')] : null));
}

function refPage(id) {
  const r = REF_BY_ID[id];
  if (!r) return h('div', { class: 'empty' }, h('h1', { class: 'h2', id: 'page-title', tabindex: '-1' }, 'Référence introuvable'), h('a', { class: 'btn ghost', href: '#/science/refs' }, 'Toutes les sources'));
  const usedBy = [
    ...METRIC_DOCS.filter(m => m.refs.includes(id)).map(m => ['Indicateur', m.name, '#/science/metrics']),
    ...EXPERIMENTS.filter(x => x.refs.includes(id)).map(x => ['Expérience', x.title, '#/science/experiments']),
    ...DEVICE_LIMITS.filter(x => x.refs.includes(id)).map(x => ['Limite', x.title, '#/science/limits']),
  ];
  return h('div', { class: 'science' },
    h('header', { class: 'page-head' }, h('div', { class: 'grow' }, h('p', { class: 'eyebrow' }, REF_TYPES[r.type] || r.type), h('h1', { class: 'h2', id: 'page-title', tabindex: '-1' }, r.title))),
    plate({ children: [
      h('dl', { class: 'kv' },
        ...[['Auteurs / organisme', r.authors], ['Publication', r.journal], ['Année', r.year], ['Volume', r.volume], ['Pages / article', r.pages], ['PMID', r.pmid]]
          .filter(([, v]) => v).map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, String(v)))),
        r.doi ? h('div', null, h('dt', null, 'DOI'), h('dd', null, h('a', { href: `https://doi.org/${r.doi}`, target: '_blank', rel: 'noopener noreferrer' }, r.doi, icon('external')))) : null,
        r.url && !r.doi ? h('div', null, h('dt', null, 'Lien'), h('dd', null, h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, 'Ouvrir', icon('external')))) : null,
        r.pubmed ? h('div', null, h('dt', null, 'PubMed'), h('dd', null, h('a', { href: r.pubmed, target: '_blank', rel: 'noopener noreferrer' }, 'Fiche PubMed', icon('external')))) : null),
      h('p', { class: 'small faint' }, r.check === 'search' ? 'Métadonnées concordantes dans plusieurs index.' : 'Métadonnées partiellement recoupées (un élément, souvent le PMID, n\'a pas été confirmé).'),
    ] }),
    usedBy.length ? h('div', { class: 'section' }, plate({ eyebrow: 'Utilisée dans Somnia', children: h('div', { class: 'list' }, usedBy.map(([k, t, href]) => h('a', { href }, h('span', { class: 'grow' }, h('span', { class: 'sub' }, k), h('span', { style: { display: 'block' } }, t)), icon('chevronRight', { class: 'chev' })))) })) : null,
    h('a', { class: 'btn ghost', href: '#/science/refs' }, icon('chevronLeft'), 'Toutes les sources'));
}
