import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEpisode, completeness } from '../js/core/metrics.js';
import { validateEpisode, normalizeEpisode } from '../js/core/model.js';
import { night, close } from './helpers.mjs';

test('nuit de référence : TIB, latence, TST, efficacité, milieu du sommeil', () => {
  const e = night('2026-03-11', { bed: '22:30', off: '22:45', sol: 15, waso: 20, awk: 2, wake: '06:30', out: '06:50', q: 4 });
  const m = computeEpisode(e);
  assert.equal(m.valid, true);
  assert.equal(m.tib, 500);          // 22:30 → 06:50
  assert.equal(m.spt, 450);          // 23:00 → 06:30
  assert.equal(m.tst, 430);          // 450 − 20
  close(assert, m.se, 86);           // 430 / 500
  assert.equal(m.linger, 20);
  assert.equal(m.bedClock, 22 * 60 + 30);
  assert.equal(m.onsetClock, 23 * 60);
  assert.equal(m.midSleepClock, 2 * 60 + 45);
  assert.equal(m.nightKey, '2026-03-11');
  assert.equal(m.tstSource, 'declared');
});

test('passage à l\'heure d\'été : la nuit dure une heure de moins', () => {
  const m = computeEpisode(night('2026-03-29', { bed: '23:00', sol: 0, waso: 0, wake: '07:00', out: '07:00' }));
  assert.equal(m.tib, 420);
  assert.equal(m.tst, 420);
});

test('passage à l\'heure d\'hiver : la nuit dure une heure de plus', () => {
  const m = computeEpisode(night('2026-10-25', { bed: '23:00', sol: 0, waso: 0, wake: '07:00', out: '07:00' }));
  assert.equal(m.tib, 540);
});

test('coucher après minuit : même nuit, heure d\'horloge correcte', () => {
  const m = computeEpisode(night('2026-03-11', { bed: '01:30', sol: 10, waso: 0, wake: '08:00', out: '08:10' }));
  assert.equal(m.tib, 400);
  assert.equal(m.bedClock, 90);
  assert.equal(m.nightKey, '2026-03-11');
});

test('données manquantes : jamais remplacées par zéro', () => {
  const m = computeEpisode(night('2026-03-11', { bed: '23:00', wake: '07:00', out: '07:15' }));
  assert.equal(m.valid, true);
  assert.equal(m.tib, 495);
  assert.equal(m.sol, null);
  assert.equal(m.tst, null, 'sans latence ni éveils, le temps de sommeil n\'est pas calculable');
  assert.equal(m.se, null);
  const m2 = computeEpisode(night('2026-03-11', { bed: '23:00', sol: 20, wake: '07:00', out: '07:15' }));
  assert.equal(m2.spt, 460);
  assert.equal(m2.tst, null, 'éveils nocturnes inconnus → TST inconnu');
});

test('sans heure de lever : TIB estimé jusqu\'au réveil, efficacité non calculée', () => {
  const m = computeEpisode(night('2026-03-11', { bed: '23:00', sol: 0, waso: 0, wake: '07:00' }));
  assert.equal(m.tib, 480);
  assert.equal(m.tibEstimated, true);
  assert.equal(m.se, null);
});

test('donnée mesurée importée prioritaire et marquée', () => {
  const e = night('2026-03-11', { bed: '23:00', sol: 10, waso: 30, wake: '07:00', out: '07:00' });
  e.measured = { tstMin: 401, provider: 'test' };
  const m = computeEpisode(e);
  assert.equal(m.tst, 401);
  assert.equal(m.tstSource, 'measured');
});

test('validation : incohérences exclues', () => {
  assert.equal(validateEpisode(night('2026-03-11', { bed: '23:00', wake: '07:00', out: '06:00' })).valid, false);
  assert.equal(validateEpisode(night('2026-03-11', { bed: '23:00', sol: 400, waso: 200, wake: '07:00', out: '07:00' })).valid, false);
  assert.equal(validateEpisode(night('2026-03-11', { bed: '23:00', sol: -5, wake: '07:00' })).valid, false);
  const noWake = night('2026-03-11', { bed: '23:00' });
  assert.equal(validateEpisode(noWake).valid, false);
  const badTz = night('2026-03-11', { bed: '23:00', wake: '07:00' }); badTz.tz = 'Mars/Olympus';
  assert.equal(validateEpisode(badTz).valid, false);
  const m = computeEpisode(night('2026-03-11', { bed: '23:00', wake: '07:00', out: '06:00' }));
  assert.equal(m.valid, false);
  assert.equal(m.tib, null);
});

test('validation : avertissements non bloquants', () => {
  const v = validateEpisode(night('2026-03-11', { bed: '23:00', sol: 150, waso: 0, awk: 0, wake: '07:00', out: '07:00' }));
  assert.equal(v.valid, true);
  assert.ok(v.warnings.length >= 1);
});

test('normalisation des saisies (chaînes vides → null, pas 0)', () => {
  const e = normalizeEpisode({ tz: 'Europe/Paris', bedtime: '2026-03-10T22:00:00Z', finalWake: '2026-03-11T06:00:00Z', solMin: '', wasoMin: '12', quality: '4', tags: [' café ', '', 3] });
  assert.equal(e.solMin, null);
  assert.equal(e.wasoMin, 12);
  assert.equal(e.quality, 4);
  assert.deepEqual(e.tags, ['café']);
});

test('jour libre déduit (réveil samedi/dimanche) ou choisi', () => {
  assert.equal(computeEpisode(night('2026-10-31', { bed: '23:00', wake: '09:00' })).freeDay, true);  // samedi
  assert.equal(computeEpisode(night('2026-10-28', { bed: '23:00', wake: '07:00' })).freeDay, false); // mercredi
  assert.equal(computeEpisode(night('2026-10-28', { bed: '23:00', wake: '07:00', free: true })).freeDay, true);
});

test('complétude des champs', () => {
  const c = completeness(night('2026-03-11', { bed: '23:00', wake: '07:00' }));
  assert.equal(c.filled, 2);
  assert.ok(c.missing.includes('Latence'));
});
