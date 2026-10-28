// Génère les icônes PNG et les écrans de démarrage iOS à partir de icons/icon.svg.
// Usage (développement uniquement) : node scripts/render-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const out = p => new URL('../icons/' + p, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();

async function shot(file, w, h, html) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:#070912;overflow:hidden">${html}</body></html>`);
  await page.screenshot({ path: out(file), type: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: file.endsWith('.jpg') ? 88 : undefined, omitBackground: false });
}
const plain = s => svg.replace('<svg ', `<svg width="${s}" height="${s}" `);
// Icônes « pleines » (iOS arrondit lui-même : on retire l'arrondi du fond)
const square = s => plain(s).replace('rx="112"', 'rx="0"');
await shot('icon-192.png', 192, 192, plain(192));
await shot('icon-512.png', 512, 512, plain(512));
await shot('apple-touch-icon.png', 180, 180, square(180));
// Maskable : contenu dans la zone de sécurité (80 %)
await shot('icon-maskable-512.png', 512, 512, `<div style="width:512px;height:512px;display:grid;place-items:center;background:#070912">${square(410).replace('<svg ', '<svg style="display:block" ')}</div>`);
for (const [w, h] of [[1125, 2436], [1170, 2532], [1179, 2556], [1290, 2796]]) {
  await shot(`splash-${w}x${h}.jpg`, w, h, `<div style="width:${w}px;height:${h}px;display:grid;place-items:center;background:radial-gradient(130% 55% at 50% 115%, #2a1e14 0%, #0c1020 45%, #070912 100%)"><div style="display:grid;justify-items:center;gap:48px">${square(Math.round(w * 0.26)).replace('<rect', '<rect opacity="0"')}<div style="font:300 ${Math.round(w * 0.07)}px Georgia,serif;color:#eef0f7;letter-spacing:.02em">Somnia</div></div></div>`);
}
await browser.close();
console.log('Icônes générées.');
