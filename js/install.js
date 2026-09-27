// Écran d'installation : un bouton « Installer » qui guide l'ajout à l'écran d'accueil.
// - Android / Chrome / Edge : vraie installation en un geste (beforeinstallprompt).
// - iPhone (Safari) : guide animé Partager → « Sur l'écran d'accueil » → Ajouter.
// - iPhone dans un autre navigateur ou une app (Instagram, Gmail…) : invite à ouvrir Safari.

const SKIP_KEY = 'somnia.skipInstall';
const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line|Snapchat|musical_ly/.test(ua);

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });

export const installState = { isIOS, isStandalone, isIOSSafari };

function skipped() { try { return localStorage.getItem(SKIP_KEY) === '1'; } catch { return false; } }

export function maybeShowInstall(force = false) {
  if (isStandalone) return;
  if (!force && skipped()) return;
  const el = document.createElement('div');
  el.className = 'install-screen';
  el.innerHTML = `
    <div class="install-inner">
      <img src="icons/icon-192.png" alt="" class="install-icon">
      <h1>Somnia</h1>
      <p class="install-tag">Ton coach de sommeil, basé sur la science</p>
      <ul class="install-feats">
        <li>🌙 Suivi de tes nuits : mouvements, respiration, ronflements</li>
        <li>⏰ Réveil intelligent en sommeil léger</li>
        <li>📊 Analyses, rythme circadien et tests cliniques</li>
        <li>🔒 Tes données restent sur ton iPhone</li>
      </ul>
      <div id="install-action"></div>
      <button class="install-skip" id="install-skip">Continuer dans le navigateur</button>
    </div>`;
  document.body.appendChild(el);
  const action = el.querySelector('#install-action');

  const close = () => { try { localStorage.setItem(SKIP_KEY, '1'); } catch {} el.remove(); };
  el.querySelector('#install-skip').addEventListener('click', close);

  if (isIOS && !isIOSSafari) {
    action.innerHTML = `
      <div class="install-note">Pour installer Somnia, ouvre cette page dans <b>Safari</b>.</div>
      <button class="btn primary block big" id="copy-link">📋 Copier le lien</button>
      <p class="install-small">Puis colle-le dans la barre d'adresse de Safari.</p>`;
    action.querySelector('#copy-link').addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(location.href.split('#')[0]); e.target.textContent = '✅ Lien copié'; }
      catch { e.target.textContent = location.href.split('#')[0]; }
    });
    return;
  }

  action.innerHTML = `<button class="btn primary block big" id="install-btn">📲 Installer Somnia</button>
    <p class="install-small">Gratuit · sans App Store · 1 Mo</p>`;
  action.querySelector('#install-btn').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const r = await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      if (r?.outcome === 'accepted') close();
      return;
    }
    if (isIOS) { showIOSGuide(el); return; }
    action.innerHTML = `<div class="install-note">Ouvre cette page sur ton iPhone dans Safari :<br><b style="word-break:break-all">${location.href.split('#')[0]}</b></div>`;
  });
}

function showIOSGuide(el) {
  el.querySelector('.install-inner').innerHTML = `
    <h1 style="margin-top:0">Plus que 3 gestes</h1>
    <ol class="install-steps">
      <li><span class="n">1</span><div>Touche le bouton <b>Partager</b>
        <svg class="share-ico" viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>
        de Safari <span class="install-small">(en bas de l'écran, ou dans le menu « ••• »)</span></div></li>
      <li><span class="n">2</span><div>Fais défiler et touche <b>« Sur l'écran d'accueil »</b> <span class="plus">＋</span></div></li>
      <li><span class="n">3</span><div>Touche <b>Ajouter</b> en haut à droite. C'est installé ! 🎉</div></li>
    </ol>
    <p class="install-small">Ensuite, ouvre Somnia depuis son icône : l'app s'affiche en plein écran et fonctionne hors ligne.</p>
    <button class="install-skip" id="install-done">J'ai compris</button>
    <div class="install-arrow">⬇︎</div>`;
  el.querySelector('#install-done').addEventListener('click', () => { try { localStorage.setItem(SKIP_KEY, '1'); } catch {} el.remove(); });
}
