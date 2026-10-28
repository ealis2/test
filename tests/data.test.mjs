import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryAdapter } from '../js/data/db.js';
import { createRepo } from '../js/data/repo.js';
import { toCSV, parseCSVImport, parseJSONImport } from '../js/data/importexport.js';
import { convertV1Night } from '../js/data/migrate-v1.js';
import { generateDemo } from '../js/data/demo.js';
import { prepare, summarize, sleepRegularityIndex, associations } from '../js/core/analysis.js';
import { night } from './helpers.mjs';

test('dépôt : enregistrement, refus des épisodes invalides, session, suppression totale', async () => {
  const repo = await createRepo(memoryAdapter()).init();
  let events = 0; repo.on(() => events++);
  const ok = await repo.saveEpisode(night('2026-03-02', { bed: '23:00', wake: '07:00' }));
  assert.equal(ok.ok, true);
  const bad = await repo.saveEpisode(night('2026-03-02', { bed: '23:00', wake: '07:00', out: '06:00' }));
  assert.equal(bad.ok, false); assert.ok(bad.errors.length);
  assert.equal(repo.episodes.length, 1);
  await repo.setSession({ id: 's1', startedAt: '2026-03-01T22:00:00Z' });
  const again = await createRepo(repo.adapter).init(); // « réouverture de l'app »
  assert.equal(again.session.id, 's1');
  assert.equal(again.episodes.length, 1);
  await again.wipeAll();
  assert.equal(again.episodes.length, 0); assert.equal(again.session, null);
  assert.ok(events >= 2);
});

test('mise à jour : la date de création est conservée', async () => {
  const repo = await createRepo(memoryAdapter()).init();
  const { episode } = await repo.saveEpisode(night('2026-03-02', { bed: '23:00', wake: '07:00' }));
  const created = episode.createdAt;
  const r2 = await repo.saveEpisode({ ...episode, quality: 4 });
  assert.equal(r2.episode.createdAt, created);
  assert.equal(repo.episodes.length, 1);
  assert.equal(repo.episode(episode.id).quality, 4);
});

test('CSV : aller-retour sans perte des champs saisis ni invention de valeurs', () => {
  const eps = [
    night('2026-03-02', { bed: '23:00', off: '23:10', sol: 12, waso: 5, awk: 1, wake: '07:00', out: '07:05', q: 4, factors: { caffeineLate: true, alcohol: 2 } }),
    night('2026-03-03', { bed: '23:30', wake: '07:00' }),
  ];
  eps[1].notes = 'Note ; avec "guillemets"\net retour';
  const csv = toCSV(eps);
  const back = parseCSVImport(csv, 'Europe/Paris');
  assert.equal(back.rejected.length, 0);
  assert.equal(back.episodes.length, 2);
  const [a, b] = back.episodes;
  assert.equal(a.solMin, 12); assert.equal(a.wasoMin, 5); assert.equal(a.quality, 4);
  assert.equal(a.factors.caffeineLate, true); assert.equal(a.factors.alcohol, 2);
  assert.equal(a.bedtime, eps[0].bedtime);
  assert.equal(b.solMin, null, 'vide → null');
  assert.equal(b.notes, eps[1].notes);
});

test('CSV : lignes invalides rejetées avec numéro de ligne', () => {
  const csv = 'coucher,reveil_final\n2026-03-01T22:00:00Z,2026-03-02T06:00:00Z\n2026-03-02T22:00:00Z,2026-03-02T21:00:00Z\n';
  const r = parseCSVImport(csv, 'Europe/Paris');
  assert.equal(r.episodes.length, 1);
  assert.equal(r.rejected[0].line, 3);
});

test('JSON : export Somnia relu à l\'identique', async () => {
  const repo = await createRepo(memoryAdapter()).init();
  await repo.saveEpisode(night('2026-03-02', { bed: '23:00', sol: 10, waso: 0, wake: '07:00' }));
  const r = parseJSONImport(JSON.stringify(repo.exportData()), 'UTC');
  assert.equal(r.format, 'somnia-v2');
  assert.deepEqual(r.episodes[0].bedtime, repo.episodes[0].bedtime);
  assert.throws(() => parseJSONImport('{"x":1}', 'UTC'));
});

test('reprise Somnia v1 : horaires et ressenti conservés, phases estimées ignorées', () => {
  const start = Date.parse('2026-03-01T22:00:00Z'), end = Date.parse('2026-03-02T06:00:00Z');
  const e = convertV1Night({ id: 'abc', start, end, mood: 4, tags: ['café'], note: 'ok', stages: 'LLDDRR', summary: { deep: 90 } }, 'Europe/Paris');
  assert.equal(e.source.kind, 'legacy-v1');
  assert.equal(e.quality, 4);
  assert.equal(e.solMin, null);
  assert.equal(e.stages, undefined);
  assert.equal(convertV1Night({ start: 5, end: 1 }, 'UTC'), null);
  const r = parseJSONImport(JSON.stringify({ nights: [{ id: 'x', start, end }] }), 'Europe/Paris');
  assert.equal(r.format, 'somnia-v1'); assert.equal(r.episodes.length, 1);
});

test('démo : déterministe, toujours valide, identifiée, analyses calculables', () => {
  const a = generateDemo({ todayKey: '2026-10-28', tz: 'Europe/Paris' });
  const b = generateDemo({ todayKey: '2026-10-28', tz: 'Europe/Paris' });
  assert.deepEqual(a.map(e => e.bedtime), b.map(e => e.bedtime));
  assert.ok(a.every(e => e.source.kind === 'demo'));
  const p = prepare(a);
  assert.equal(p.invalid.length, 0, JSON.stringify(p.invalid.slice(0, 1).map(x => x.m.errors)));
  assert.ok(p.nights.length > 90);
  const s = summarize(p.nights);
  assert.ok(s.tst.mean > 360 && s.tst.mean < 540, `tst ${s.tst.mean}`);
  assert.equal(sleepRegularityIndex(p.nights, p.naps).insufficient, false);
  const caf = associations(p.nights, 'sol').find(r => r.factor.id === 'caffeineLate');
  assert.ok(caf.diff > 0);
});
