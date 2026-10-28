// Parcours complet d'une nuit dans Chromium, avec horloge simulée :
// préparation → session → rechargement (persistance) → alarme → arrêt → bilan → journal.
// Usage : node scripts/e2e-session.mjs [url]
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8080/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Paris', locale: 'fr-FR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/api\/push\.php/.test(m.location().url)) errors.push(m.text()); });
await page.clock.install({ time: new Date('2026-10-28T22:30:00+01:00') });

const step = msg => console.log('✓', msg);
await page.goto(BASE + '#/sleep');
await page.getByRole('heading', { name: 'Préparer ma nuit' }).waitFor();
await page.getByLabel('Heure du réveil').fill('07:00');
await page.getByRole('button', { name: 'Commencer ma nuit' }).click();
await page.getByText('Réveil à 07:00').waitFor();
step('session démarrée, réveil 07:00 affiché');

await page.reload();
await page.getByText('Réveil à 07:00').waitFor();
step('session conservée après rechargement de l\'app');

// Avance jusqu'à 07:00:05
await page.clock.fastForward('08:30:05');
await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
step('l\'alarme sonne à l\'heure (écran de sonnerie)');
await page.getByRole('button', { name: /Répéter/ }).click();
await page.clock.fastForward('09:05');
await page.getByRole('alertdialog').waitFor({ timeout: 10000 });
step('répétition de 9 min puis nouvelle sonnerie');
await page.getByRole('button', { name: 'Arrêter' }).click();
await page.getByRole('heading', { name: /Comment s'est passée la nuit/ }).waitFor();
step('arrêt → questionnaire du matin');

await page.getByRole('button', { name: '15 min' }).click();
await page.getByRole('button', { name: 'Aucun réveil' }).click();
await page.getByRole('radiogroup', { name: 'Qualité du sommeil' }).getByRole('radio', { name: /4/ }).click();
await page.getByRole('button', { name: 'Enregistrer la nuit' }).click();
await page.waitForURL(/#\/entry\//);
const tst = await page.locator('.detail-hero .display').textContent();
// Coucher 22:30, latence 15 → endormi 22:45 ; réveil final = arrêt de l'alarme (07:09:05) → ≈ 8 h 24
assert.match(tst, /8 h 2[34]/, `temps de sommeil inattendu : ${tst}`);
step(`nuit enregistrée : ${tst} de sommeil estimé`);

await page.reload();
await page.goto(BASE + '#/journal');
await page.locator('.entry-row').first().waitFor();
const n = await page.locator('.entry-row').count();
assert.equal(n, 1);
const session = await page.evaluate(() => window.__somnia.repo.session);
assert.equal(session, null);
const log = await page.evaluate(() => window.__somnia.repo.alarmLog.map(l => l.kind));
assert.deepEqual(log, ['dismiss', 'ring', 'snooze', 'ring']);
step('journal persistant, session close, historique des réveils : ' + log.join(' ← '));

// Correction d'une saisie : rendre le lever incohérent est refusé
await page.locator('.entry-row').first().click();
await page.getByRole('link', { name: 'Modifier' }).first().click();
await page.getByLabel(/^Lever/).fill('2026-10-28T20:00');
await page.getByRole('button', { name: 'Enregistrer' }).click();
await page.locator('.form-errors').waitFor();
step('saisie incohérente refusée avec message explicite');

await browser.close();
if (errors.length) { console.error('Erreurs :', errors); process.exit(1); }
console.log('Parcours complet réussi.');
