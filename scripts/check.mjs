// Vérifications rapides avant publication :
//  - syntaxe de tous les modules JavaScript et PHP ;
//  - la liste SHELL du service worker couvre tous les fichiers de l'app ;
//  - chaque import relatif pointe vers un fichier existant.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const walk = d => readdirSync(join(root, d)).flatMap(f => { const p = join(d, f); return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; });
let failed = 0;
const fail = m => { console.error('✗ ' + m); failed++; };

const js = walk('js').filter(f => f.endsWith('.js'));
for (const f of [...js, 'sw.js']) {
  try { execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'pipe' }); } catch (e) { fail(`syntaxe ${f} : ${e.stderr}`); }
  const src = readFileSync(join(root, f), 'utf8');
  for (const m of src.matchAll(/from '(\.[^']+)'/g)) if (!existsSync(join(root, dirname(f), m[1]))) fail(`${f} importe ${m[1]} introuvable`);
}
try {
  for (const f of walk('api').filter(f => f.endsWith('.php'))) execFileSync('php', ['-l', join(root, f)], { stdio: 'pipe' });
} catch (e) { if (e.code !== 'ENOENT') fail(`PHP : ${e.stdout || e.message}`); }

const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const shell = new Set([...sw.matchAll(/'([^']+\.(?:js|css|woff2|png|svg|html|webmanifest))'/g)].map(m => m[1]));
const needed = [...js, ...walk('css'), ...walk('fonts').filter(f => f.endsWith('.woff2')), 'index.html', 'manifest.webmanifest'];
for (const f of needed) if (!shell.has(f)) fail(`sw.js : « ${f} » absent de SHELL (mode hors ligne incomplet)`);
for (const f of shell) if (!existsSync(join(root, f))) fail(`sw.js : « ${f} » n'existe pas`);

if (failed) { console.error(`${failed} problème(s).`); process.exit(1); }
console.log(`✓ ${js.length} modules JS, service worker et PHP vérifiés.`);
