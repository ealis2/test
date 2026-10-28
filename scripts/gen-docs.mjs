// Génère docs/METRICS.md et docs/SCIENCE.md à partir du code (source unique) :
// js/science/knowledge.js, js/science/references.js et js/core/analysis.js.
import { writeFileSync } from 'node:fs';
import { METRIC_DOCS, EXPERIMENTS, AGE_GROUPS, QUALITY_MARKERS, DEVICE_LIMITS, CONSULT, EVIDENCE } from '../js/science/knowledge.js';
import { REFERENCES, REF_TYPES, shortCite } from '../js/science/references.js';
import { THRESHOLDS, PRACTICAL } from '../js/core/analysis.js';

const refs = ids => ids.length ? ids.map(id => `[${shortCite(id)}](#${id})`).join(' ; ') : '—';
const head = '<!-- Fichier généré par `node scripts/gen-docs.mjs` : ne pas modifier à la main. -->\n\n';

let m = head + '# Indicateurs de Somnia : définitions, formules, règles\n\n';
m += 'Toutes les formules sont implémentées dans `js/core/` et testées dans `tests/` (voir la colonne « Tests »).\n\n';
m += '## Principes\n\n- Une valeur inconnue vaut `null`, jamais 0 : « aucun réveil » (0) et « je ne sais pas » (`null`) sont distincts.\n- Les durées se calculent entre instants absolus (UTC) : elles restent justes lors des changements d\'heure.\n- Les heures d\'horloge se lisent dans le fuseau **de l\'épisode** (enregistré à la saisie), pas dans celui de l\'appareil au moment de l\'analyse.\n- Une nuit appartient au jour du réveil. S\'il y a plusieurs épisodes nocturnes à la même date, le plus long est retenu pour les statistiques par nuit, et le doublon est compté.\n- Un épisode incohérent (lever avant coucher, latence plus éveil supérieurs à la nuit, fuseau invalide…) est exclu des statistiques, et l\'exclusion est affichée.\n- Les moyennes et dispersions d\'heures utilisent les statistiques circulaires (23:50 et 00:10 donnent 00:00).\n\n';
m += '## Effectifs minimaux de publication\n\n| Calcul | Minimum |\n|---|---|\n';
m += `| Moyenne, médiane, min, max | ${THRESHOLDS.describe} valeurs |\n| Écart-type, variabilité | ${THRESHOLDS.spread} valeurs |\n| Indice de régularité (SRI) | ${THRESHOLDS.sriPairs} paires de jours consécutifs |\n| Jet-lag social | ${THRESHOLDS.jetlagFree} jours libres et ${THRESHOLDS.jetlagWork} jours travaillés |\n| Tendance (Theil–Sen + Mann–Kendall) | ${THRESHOLDS.trend} nuits |\n| Changement inhabituel | ${THRESHOLDS.change.recent} nuits récentes et ${THRESHOLDS.change.baseline} nuits de référence |\n| Association oui/non (Welch) | ${THRESHOLDS.association} nuits par groupe |\n| Corrélation (Spearman) | ${THRESHOLDS.spearman} nuits |\n\n`;
m += `Seuils pratiques d\'un « changement inhabituel » : ${Object.entries(PRACTICAL).map(([k, v]) => `${k} ${v}`).join(', ')} (minutes, points d'efficacité ou points de qualité).\n\n`;
for (const d of METRIC_DOCS) {
  m += `## ${d.name}\n\n*${d.question}* — unité : ${d.unit}\n\n| | |\n|---|---|\n| Données d'entrée | ${d.inputs} |\n| Formule | ${d.formula} |\n| Valeurs manquantes | ${d.missing} |\n| Limites | ${d.limits} |\n| Sources | ${refs(d.refs)} |\n\n`;
}
m += '## Tests de référence\n\n`npm test` exécute notamment les vérifications suivantes :\n\n';
m += '- **Nuit de référence** : coucher 22:30, extinction 22:45, latence 15 min, éveil 20 min, réveil 06:30, lever 06:50 → temps au lit 500 min, période 450, TST 430, efficacité 86 %, milieu 02:45.\n';
m += '- **Changement d\'heure** : 23:00 → 07:00 dure 420 min la nuit du passage à l\'heure d\'été et 540 min la nuit du passage à l\'heure d\'hiver (Europe/Paris).\n';
m += '- **Statistiques** : Welch identique à `t.test()` de R (t = 1,897 ; ddl = 5,882 ; p = 0,1075) ; quantiles de type 7 ; loi de Student et loi normale contrôlées sur valeurs de table.\n';
m += '- **SRI** : horaires identiques → 100 ; alternance 23:00–07:00 / 01:00–09:00 → −100 + 200 × 1200/1440 ; jours manquants exclus.\n';
m += '- **Jet-lag social** : milieu 03:00 en semaine et 05:00 le week-end → 120 min.\n';
m += '- **Données manquantes** : jours sans saisie = `null` dans les séries, jamais 0 ; bilan cumulé refusé sous 5 nuits sur 7.\n';
writeFileSync('docs/METRICS.md', m);

let s = head + '# Bases scientifiques de Somnia\n\n';
s += '## Niveaux de preuve affichés\n\n' + Object.entries(EVIDENCE).map(([k, v]) => `- **${v.label}** : ${v.desc}`).join('\n') + '\n\n';
s += '## Durées recommandées par âge\n\n| Âge | NSF recommandé | NSF peut convenir | AASM / SRS |\n|---|---|---|---|\n';
s += AGE_GROUPS.map(a => `| ${a.label} | ${a.nsf[0]}–${a.nsf[1]} h | ${a.nsfMay[0]}–${a.nsfMay[1]} h | ${a.aasm} |`).join('\n') + `\n\nSources : ${refs(['hirshkowitz2015', 'watson2015', 'paruthi2016'])}\n\n`;
s += '## Repères de continuité (NSF, adultes)\n\n' + QUALITY_MARKERS.map(q => `- ${q.label} : ${q.good}`).join('\n') + `\n\nSource : ${refs(['ohayon2017'])}. Seuls les repères de « bonne qualité » ont été recoupés. Les seuils par âge et ceux de « mauvaise qualité » figurent dans les tableaux de l'article et n'ont pas pu être consultés : ils ne sont pas utilisés.\n\n`;
s += '## Expérimentations proposées\n\n' + EXPERIMENTS.map(x => `### ${x.title} (${EVIDENCE[x.evidence].label})\n\n${x.why}\n\n- Protocole : ${x.how}\n- À observer : ${x.watch.join(', ')}\n- Sources : ${refs(x.refs)}\n`).join('\n') + '\n';
s += '## Limites des appareils et méthodes\n\n' + DEVICE_LIMITS.map(d => `- **${d.title}.** ${d.text} (${refs(d.refs)})`).join('\n') + '\n\n';
s += `## Quand consulter\n\n${CONSULT.intro}\n\n${CONSULT.items.map(i => `- ${i}`).join('\n')}\n\n${CONSULT.cbti}\n\nSources : ${refs(CONSULT.refs)}\n\n`;
s += '## Bibliographie\n\nMéthode : chaque référence a été recoupée le 28 octobre 2026 dans plusieurs index (PubMed, PMC, éditeurs) sur le titre, le DOI, la revue, le volume et les pages. L\'environnement de développement ne pouvait pas ouvrir directement Crossref ni PubMed : le champ `verified` reste donc `false`, et `check` indique le niveau de recoupement (`search` = concordant, `search-partial` = un élément non confirmé, souvent le PMID). Détail : `docs/research/sources-verifiees.md`.\n\n';
const groups = {};
for (const r of REFERENCES) (groups[r.type] ||= []).push(r);
for (const [type, list] of Object.entries(groups)) {
  s += `### ${REF_TYPES[type] || type}\n\n`;
  for (const r of list) s += `- <a id="${r.id}"></a>**${shortCite(r.id)}** — ${r.authors}. *${r.title}*. ${r.journal}${r.year ? `, ${r.year}` : ''}${r.volume ? `, ${r.volume}` : ''}${r.pages ? `:${r.pages}` : ''}. ${r.doi ? `DOI [${r.doi}](https://doi.org/${r.doi})` : `[lien](${r.url})`}${r.pmid ? ` · PMID ${r.pmid}` : ''} · recoupement : \`${r.check}\`\n`;
  s += '\n';
}
writeFileSync('docs/SCIENCE.md', s);
console.log('✓ docs/METRICS.md et docs/SCIENCE.md générés.');
