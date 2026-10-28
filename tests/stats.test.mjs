import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, circularDescribe, clockDiff, tTwoSidedP, tQuantile, welch, theilSen, mannKendall, spearman, benjaminiHochberg, quantile, normalCdf } from '../js/core/stats.js';
import { close } from './helpers.mjs';

test('statistiques descriptives et valeurs manquantes', () => {
  const d = describe([1, 2, 3, 4, null, NaN]);
  assert.equal(d.n, 4); assert.equal(d.missing, 2);
  close(assert, d.mean, 2.5); close(assert, d.median, 2.5);
  close(assert, d.sd, 1.2909944487);
  assert.equal(d.min, 1); assert.equal(d.max, 4);
  close(assert, d.q1, 1.75); close(assert, d.q3, 3.25);
});

test('effectif insuffisant : aucune statistique publiée', () => {
  const d = describe([420, null, null], { minN: 3 });
  assert.equal(d.insufficient, true);
  assert.equal(d.mean, null);
  assert.equal(d.n, 1);
});

test('quantiles (type 7, comme R)', () => {
  close(assert, quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1);
});

test('moyenne circulaire autour de minuit', () => {
  const c = circularDescribe([23 * 60 + 50, 10]);
  assert.equal(c.insufficient, true); // minN = 3 par défaut
  const c3 = circularDescribe([23 * 60 + 50, 10, 0]);
  close(assert, Math.abs(clockDiff(c3.mean, 0)), 0, 1e-6);
  assert.ok(c3.sd > 7 && c3.sd < 9, `sd ${c3.sd}`); // ≈ écart-type linéaire 8,2 min
  // L'approche naïve donnerait une moyenne vers midi :
  const naive = (23 * 60 + 50 + 10 + 0) / 3;
  assert.ok(Math.abs(clockDiff(naive, 0)) > 400);
});

test('écart circulaire ≈ écart-type linéaire pour de faibles dispersions', () => {
  const xs = [1380, 1395, 1410, 1425, 1440 - 1, 5, 20];
  const c = circularDescribe(xs);
  const lin = describe(xs.map(x => (x < 720 ? x + 1440 : x))).sd;
  close(assert, c.sd, lin, lin * 0.1);
});

test('différence d\'horloge la plus courte', () => {
  assert.equal(clockDiff(1430, 10), 20);
  assert.equal(clockDiff(10, 1430), -20);
  assert.equal(clockDiff(360, 1080), -720);
});

test('loi de Student : valeurs de référence', () => {
  close(assert, tTwoSidedP(2.0, 10), 0.07338803, 1e-6);
  close(assert, tTwoSidedP(2.228138852, 10), 0.05, 1e-6);
  close(assert, tQuantile(0.975, 10), 2.228138852, 1e-6);
  close(assert, tQuantile(0.975, 1000), 1.962339, 1e-5);
  close(assert, normalCdf(1.959964), 0.975, 1e-6);
});

test('test de Welch : résultat identique à R t.test()', () => {
  const w = welch([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
  close(assert, w.diff, 3);
  close(assert, w.t, 1.897367, 1e-5);
  close(assert, w.df, 5.882353, 1e-5);
  close(assert, w.p, 0.1075, 1e-4);
  close(assert, w.ci[0], -0.8877, 1e-3);
  close(assert, w.ci[1], 6.8877, 1e-3);
});

test('Theil–Sen et Mann–Kendall', () => {
  const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const ts = theilSen(xs, xs.map(x => 2 * x + 1));
  close(assert, ts.slope, 2); close(assert, ts.intercept, 1);
  const robust = theilSen(xs, xs.map(x => (x === 9 ? 500 : 2 * x + 1)));
  close(assert, robust.slope, 2);
  const mk = mannKendall(xs.map(x => x + 1));
  assert.equal(mk.S, 45);
  close(assert, mk.z, 3.935, 1e-3);
  assert.ok(mk.p < 0.001);
  close(assert, mannKendall([5, 5, 5, 5, 5]).p, 1, 1e-6);
});

test('Spearman', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  close(assert, spearman(xs, xs.map(x => x * x)).rho, 1);
  close(assert, spearman(xs, xs.map(x => -x)).rho, -1);
  assert.equal(spearman([1, 2, 3], [1, 2, 3]).insufficient, true);
  const s = spearman([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [2, 1, 4, 3, 6, 5, 8, 7, 10, 9]);
  close(assert, s.rho, 0.9393939, 1e-6);
});

test('Benjamini–Hochberg', () => {
  const adj = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
  close(assert, adj[0], 0.04); close(assert, adj[1], 0.0533333, 1e-6);
  close(assert, adj[2], 0.0533333, 1e-6); close(assert, adj[3], 0.5);
});
