import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights, evolution } from '../js/core/insights.js';
import { prepare } from '../js/core/analysis.js';
import { generateDemo } from '../js/data/demo.js';
import { fmtDuration, fmtP, fmtDateKey } from '../js/core/format.js';
import { REFERENCES, REF_BY_ID } from '../js/science/references.js';
import { METRIC_DOCS, EXPERIMENTS, DEVICE_LIMITS, CONSULT, QUALITY_MARKERS } from '../js/science/knowledge.js';

test('format français des durées et p-valeurs', () => {
  assert.equal(fmtDuration(452), '7 h 32');
  assert.equal(fmtDuration(420), '7 h');
  assert.equal(fmtDuration(-25, { signed: true }), '−25 min');
  assert.equal(fmtDuration(65, { signed: true }), '+1 h 05');
  assert.equal(fmtDuration(null), '—');
  assert.equal(fmtP(0.0004), 'p < 0,001');
  assert.equal(fmtDateKey('2026-10-28'), 'mercredi 28 octobre');
});

test('observations : vide → invitation, démo → observations chiffrées sans vocabulaire causal', () => {
  const empty = buildInsights(prepare([]), { todayKey: '2026-10-28', goalMin: 480 });
  assert.equal(empty[0].id, 'empty');
  const p = prepare(generateDemo({ todayKey: '2026-10-28', tz: 'Europe/Paris' }));
  const ins = buildInsights(p, { todayKey: '2026-10-28', goalMin: 480, limit: 20 });
  assert.ok(ins.length >= 2);
  for (const i of ins) {
    assert.ok(['personal', 'research', 'consensus'].includes(i.level));
    assert.doesNotMatch(i.text.replace(/pas une cause/g, ''), /\b(cause[sz]?|provoque|entraîne|à cause de)\b/i, i.text);
    for (const r of i.refs || []) assert.ok(REF_BY_ID[r], `réf. inconnue ${r}`);
  }
});

test('évolution sur 30 jours : statuts calculés avec effectifs', () => {
  const p = prepare(generateDemo({ todayKey: '2026-10-28', tz: 'Europe/Paris' }));
  const ev = evolution(p, '2026-10-28', 30);
  assert.ok(ev.nA > 20 && ev.nB > 20);
  const bed = ev.items.find(i => i.key === 'bedClock');
  assert.ok(['shifted', 'stable', 'uncertain'].includes(bed.status));
});

test('toute référence citée dans le contenu scientifique existe et a un DOI ou une URL', () => {
  const cited = [...METRIC_DOCS.flatMap(m => m.refs), ...EXPERIMENTS.flatMap(e => e.refs), ...DEVICE_LIMITS.flatMap(d => d.refs), ...CONSULT.refs, ...QUALITY_MARKERS.map(q => q.ref)];
  for (const id of cited) assert.ok(REF_BY_ID[id], `référence absente : ${id}`);
  for (const r of REFERENCES) {
    assert.ok(r.doi || r.url, r.id);
    if (r.doi) assert.match(r.doi, /^10\.\d{4,}\//);
    assert.equal(typeof r.verified, 'boolean');
  }
  const ids = REFERENCES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
});
