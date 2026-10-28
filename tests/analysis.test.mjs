import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, summarize, sleepRegularityIndex, workFree, dailySeries, rolling, cumulativeBalance, trend, unusualChanges, associations, comparePeriods, dataQuality, onePerNight, aggregate } from '../js/core/analysis.js';
import { addDays } from '../js/core/time.js';
import { night, close } from './helpers.mjs';

const days = (start, n) => Array.from({ length: n }, (_, i) => addDays(start, i));

test('horaires parfaitement réguliers : SRI = 100', () => {
  const eps = days('2026-03-02', 10).map(k => night(k, { bed: '23:00', sol: 0, waso: 0, wake: '07:00', out: '07:00' }));
  const p = prepare(eps);
  const r = sleepRegularityIndex(p.nights, p.naps);
  assert.equal(r.insufficient, false);
  assert.equal(r.pairs, 9);
  close(assert, r.sri, 100);
});

test('SRI : décalage d\'une nuit sur deux → SRI réduit, valeur exacte', () => {
  // Nuits alternées 23:00–07:00 et 01:00–09:00 : sur 1440 min comparées, 240 diffèrent.
  const eps = days('2026-03-02', 10).map((k, i) => (i % 2
    ? night(k, { bed: '01:00', sol: 0, waso: 0, wake: '09:00', out: '09:00' })
    : night(k, { bed: '23:00', sol: 0, waso: 0, wake: '07:00', out: '07:00' })));
  const p = prepare(eps);
  const r = sleepRegularityIndex(p.nights);
  close(assert, r.sri, -100 + 200 * (1200 / 1440), 1e-9);
});

test('SRI : jours manquants exclus (pas supposés éveillés) et seuil de paires', () => {
  const ks = days('2026-03-02', 12).filter((_, i) => i !== 4 && i !== 8);
  const p = prepare(ks.map(k => night(k, { bed: '23:00', sol: 0, waso: 0, wake: '07:00', out: '07:00' })));
  const r = sleepRegularityIndex(p.nights);
  assert.equal(r.pairs, 7);
  close(assert, r.sri, 100);
  const few = prepare(days('2026-03-02', 5).map(k => night(k, { bed: '23:00', sol: 0, waso: 0, wake: '07:00' })));
  assert.equal(sleepRegularityIndex(few.nights).insufficient, true);
});

test('SRI : une sieste régulière compte comme du sommeil', () => {
  const ks = days('2026-03-02', 9);
  const nights = ks.map(k => night(k, { bed: '23:00', sol: 0, waso: 0, wake: '07:00', out: '07:00' }));
  const naps = ks.slice(0, 4).map(k => night(k, { type: 'nap', bed: '14:00', sol: 0, waso: 0, wake: '14:30', out: '14:30' }));
  // La sieste de 14:00 est placée la veille par l'assistant (≥ 12:00) ; on la ramène au jour du réveil.
  for (const n of naps) { n.bedtime = new Date(Date.parse(n.bedtime) + 86400e3).toISOString(); }
  const p = prepare([...nights, ...naps]);
  const r = sleepRegularityIndex(p.nights, p.naps);
  assert.ok(r.sri < 100 && r.sri > 90, `sri ${r.sri}`);
});

test('jet-lag social : différence de milieu du sommeil semaine / week-end', () => {
  const ks = days('2026-03-02', 14); // lundi 2 mars → dimanche 15 mars
  const eps = ks.map(k => {
    const wd = new Date(k + 'T12:00:00Z').getUTCDay();
    const free = wd === 0 || wd === 6;
    return free
      ? night(k, { bed: '01:00', sol: 0, waso: 0, wake: '09:00', out: '09:15' }) // milieu 05:00
      : night(k, { bed: '23:00', sol: 0, waso: 0, wake: '07:00', out: '07:10' }); // milieu 03:00
  });
  const wf = workFree(prepare(eps).nights);
  assert.equal(wf.free.n, 4); assert.equal(wf.work.n, 10);
  close(assert, wf.socialJetlag, 120, 1e-6);
});

test('synthèse : effectifs, jours manquants, doublons, pas de zéro', () => {
  const eps = [
    night('2026-03-02', { bed: '23:00', sol: 10, waso: 0, wake: '07:00', out: '07:00' }),
    night('2026-03-03', { bed: '23:00', wake: '07:00', out: '07:00' }), // TST inconnu
    night('2026-03-05', { bed: '22:00', sol: 20, waso: 10, wake: '06:30', out: '06:40' }),
    night('2026-03-06', { bed: '00:00', sol: 15, waso: 5, wake: '07:00', out: '07:30' }),
    night('2026-03-06', { bed: '03:00', sol: 0, waso: 0, wake: '04:00', out: '04:00' }), // doublon plus court
  ];
  const p = prepare(eps);
  const s = summarize(p.nights, { from: '2026-03-01', to: '2026-03-07' });
  assert.equal(s.n, 4); assert.equal(s.duplicates, 1);
  assert.equal(s.expectedDays, 7); assert.equal(s.missingDays, 3);
  assert.equal(s.tst.n, 3); assert.equal(s.tst.missing, 1);
  close(assert, s.tst.mean, (470 + 480 + 400) / 3);
  assert.equal(s.tst.min, 400);
});

test('série quotidienne : jours sans données = null, moyenne glissante exigeante', () => {
  const p = prepare([night('2026-03-02', { bed: '23:00', sol: 0, waso: 0, wake: '07:00' }), night('2026-03-04', { bed: '23:00', sol: 0, waso: 0, wake: '06:00' })]);
  const s = dailySeries(p.nights, '2026-03-01', '2026-03-05');
  assert.deepEqual(s.map(x => x.value), [null, 480, null, 420, null]);
  const r = rolling(s, 7, 4);
  assert.ok(r.every(x => x.value === null));
  const r2 = rolling(s, 3, 2);
  close(assert, r2[3].value, 450);
});

test('agrégation hebdomadaire (semaines du lundi)', () => {
  const s = days('2026-03-02', 14).map((k, i) => ({ key: k, value: i < 7 ? 420 : 480 }));
  const w = aggregate(s, 'week');
  assert.equal(w.length, 2);
  assert.equal(w[0].key, '2026-03-02');
  close(assert, w[1].mean, 480);
});

test('bilan cumulé : refuse de conclure sur une semaine trop incomplète', () => {
  const s = days('2026-03-02', 7).map((k, i) => ({ key: k, value: i < 3 ? 400 : null }));
  assert.equal(cumulativeBalance(s, 480, 7).insufficient, true);
  const full = days('2026-03-02', 7).map(k => ({ key: k, value: 450 }));
  const b = cumulativeBalance(full, 480, 7);
  assert.equal(b.balance, -210); assert.equal(b.complete, true);
});

test('tendance : pente en minutes par semaine', () => {
  const s = days('2026-03-02', 21).map((k, i) => ({ key: k, value: 400 + i * 2 }));
  const t = trend(s);
  close(assert, t.slopePerWeek, 14);
  assert.ok(t.p < 0.001);
  assert.equal(trend(s.slice(0, 10)).insufficient, true);
});

test('changement inhabituel détecté uniquement s\'il est net et important', () => {
  const ks = days('2026-01-01', 35);
  const eps = ks.map((k, i) => {
    const jitter = [0, 10, -10, 5, -5][i % 5];
    return i < 28
      ? night(k, { bed: '23:00', sol: 10, waso: 10 + jitter + 10, wake: '07:00', out: '07:00' })
      : night(k, { bed: '23:00', sol: 10, waso: 70 + jitter, wake: '07:00', out: '07:00' });
  });
  const ch = unusualChanges(prepare(eps).nights);
  const tst = ch.find(c => c.key === 'tst');
  assert.equal(tst.notable, true);
  assert.ok(tst.diff < -40);
  assert.equal(ch.find(c => c.key === 'sol')?.notable ?? false, false);
});

test('associations : différence avec / sans facteur, effectifs et correction multiple', () => {
  const ks = days('2026-01-01', 30);
  const eps = ks.map((k, i) => {
    const coffee = i % 3 === 0;
    return night(k, { bed: '23:00', sol: coffee ? 40 + (i % 4) : 10 + (i % 4), waso: 10, wake: '07:00', out: '07:00', factors: { caffeineLate: coffee, stress: (i % 5) + 1 } });
  });
  const res = associations(prepare(eps).nights, 'sol');
  const c = res.find(r => r.factor.id === 'caffeineLate');
  assert.equal(c.nYes, 10); assert.equal(c.nNo, 20);
  close(assert, c.diff, 30, 1);
  assert.equal(c.robust, true);
  const alcohol = res.find(r => r.factor.id === 'alcohol');
  assert.equal(alcohol.insufficient, true, 'facteur jamais renseigné → pas de test');
  const stress = res.find(r => r.factor.id === 'stress');
  assert.equal(stress.method, 'spearman');
  assert.equal(stress.insufficient, false);
});

test('comparaison de périodes (avant / après)', () => {
  const a = days('2026-01-01', 10).map(k => night(k, { bed: '23:30', sol: 30, waso: 20, wake: '07:00', out: '07:10' }));
  const b = days('2026-01-11', 10).map((k, i) => night(k, { bed: '22:45', sol: 15 + (i % 2), waso: 20, wake: '07:00', out: '07:10' }));
  const p = prepare([...a, ...b]);
  const cmp = comparePeriods(p.nights, { from: '2026-01-01', to: '2026-01-10' }, { from: '2026-01-11', to: '2026-01-20' });
  assert.equal(cmp.nA, 10); assert.equal(cmp.nB, 10);
  const bed = cmp.rows.find(r => r.key === 'bedClock');
  close(assert, bed.diff, -45, 1e-6);
  const sol = cmp.rows.find(r => r.key === 'sol');
  close(assert, sol.diff, -14.5, 1e-6);
});

test('qualité des données : exclusions et champs manquants comptés', () => {
  const eps = [
    night('2026-03-02', { bed: '23:00', sol: 10, waso: 0, wake: '07:00', out: '07:00' }),
    night('2026-03-03', { bed: '23:00', wake: '07:00', out: '06:00' }), // invalide
    night('2026-03-04', { bed: '23:00', wake: '07:00' }),
  ];
  const q = dataQuality(prepare(eps), '2026-03-01', '2026-03-07');
  assert.equal(q.days, 7); assert.equal(q.recorded, 2); assert.equal(q.missingDays, 5);
  assert.equal(q.invalid, 1); assert.equal(q.tstKnown, 1);
});

test('une nuit par date : la plus longue est retenue', () => {
  const p = prepare([night('2026-03-02', { bed: '23:00', wake: '07:00' }), night('2026-03-02', { bed: '04:00', wake: '06:00' })]);
  const o = onePerNight(p.nights);
  assert.equal(o.nights.length, 1); assert.equal(o.duplicates, 1);
  assert.equal(o.nights[0].m.tib, 480);
});
