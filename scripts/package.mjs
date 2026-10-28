// Construit dist/somnia-hostinger.zip : uniquement les fichiers à publier
// (ni tests, ni scripts, ni données). À extraire dans public_html ou un sous-dossier.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', '.htaccess', 'css', 'js', 'fonts', 'icons', 'design',
  'api/push.php', 'api/cron.php', 'api/ics.php', 'api/lib', 'api/data/.htaccess', 'docs/PRIVACY.md', 'LISEZ-MOI.txt'];
mkdirSync('dist', { recursive: true });
rmSync('dist/somnia-hostinger.zip', { force: true });
writeFileSync('LISEZ-MOI.txt', [
  'Somnia — installation sur Hostinger',
  '',
  '1. hPanel → Fichiers → Gestionnaire de fichiers → public_html (ou créez public_html/sommeil).',
  '2. Téléversez ce ZIP dans ce dossier, clic droit → Extraire, puis supprimez le ZIP.',
  '   index.html doit se trouver directement dans le dossier choisi.',
  '3. Vérifiez que le SSL est actif (hPanel → Sécurité → SSL).',
  '4. Notifications de secours (facultatif) : hPanel → Avancé → Tâches Cron →',
  '   Type « PHP », toutes les minutes, fichier : public_html/<dossier>/api/cron.php',
  '5. Ouvrez https://cryptologist.pro/<dossier>/ dans Safari, puis Partager → Sur l\'écran d\'accueil.',
  '',
  'Documentation complète : README.md du dépôt.',
].join('\r\n'));
execFileSync('zip', ['-qr', 'dist/somnia-hostinger.zip', ...FILES]);
rmSync('LISEZ-MOI.txt');
console.log('✓ dist/somnia-hostinger.zip');
