// Parcours de bout en bout dans Chromium : chaque écran, sans erreur console.
// Usage : node scripts/smoke.mjs [url] [dossier-captures]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8080/';
const SHOTS = process.argv[3] || null;
const ROUTES = ['home', 'sleep', 'journal', 'journal/calendar', 'stats', 'stats/duration', 'stats/timing', 'stats/rhythm', 'stats/quality', 'stats/habits', 'stats/compare', 'stats/data', 'science', 'science/metrics', 'science/experiments', 'science/limits', 'science/refs', 'science/ref/windred2024', 'alarms', 'settings', 'entry/new', 'entry/new/nap'];

const browser = await chromium.launch();
const errors = [];
async function run(label, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, timezoneId: 'Europe/Paris', locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${label}] pageerror: ${e.message}`));
  await page.goto(BASE + '#/home');
  await page.waitForSelector('#page-title');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}-empty-home.png`, fullPage: true });
  // Charge la démonstration via l'interface
  await page.goto(BASE + '#/settings/data');
  await page.getByRole('button', { name: 'Charger la démonstration' }).click();
  await page.waitForFunction(() => location.hash === '#/home');
  for (const r of ROUTES) {
    await page.goto(BASE + '#/' + r);
    await page.waitForSelector('#page-title', { timeout: 5000 }).catch(() => errors.push(`[${label}] ${r}: pas de titre`));
    await page.waitForTimeout(250);
    const err = await page.$('.empty h1');
    if (err && /erreur/i.test(await err.textContent())) errors.push(`[${label}] ${r}: ${await page.textContent('.empty .prose')}`);
    // Débordement horizontal
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) errors.push(`[${label}] ${r}: débordement horizontal de ${overflow}px`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}-${r.replace(/\//g, '_')}.png`, fullPage: true });
  }
  // Un épisode de démonstration
  const id = await page.evaluate(() => window.__somnia.repo.episodes.at(-1).id);
  await page.goto(BASE + '#/entry/' + id); await page.waitForTimeout(200);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${label}-entry.png`, fullPage: true });
  await page.goto(BASE + '#/entry/' + id + '/edit'); await page.waitForTimeout(200);
  await ctx.close();
}
await run('mobile', { width: 390, height: 844 });
await run('desktop', { width: 1366, height: 900 });
await browser.close();
if (errors.length) { console.log(errors.join('\n')); process.exit(1); }
console.log('OK : tous les écrans se chargent sans erreur.');
