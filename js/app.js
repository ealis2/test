import { store, uid, fmtDur, fmtTime, fmtDate, fmtShortDate, esc, pad, timeToMinutes, minutesToTime, nightKey } from './store.js';
import { STAGES, buildNight, scoreLabel, statsFor, tagImpact, bedtimesFor, wakeTimesFrom, sleepRegularityIndex, chronotype } from './analysis.js';
import { hypnogram, miniHypno, phaseBar, legend, scoreRing, durationBars, lineChart, scheduleChart } from './charts.js';
import { tracker, wakeLockActive } from './tracker.js';
import * as snd from './sounds.js';
import * as sci from './science.js';
import { TESTS } from './tests.js';
import { maybeShowInstall } from './install.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');

const TITLES = { nuit: 'Nuit', journal: 'Journal', analyses: 'Analyses', detente: 'Détente', science: 'Science' };
const TAGS = ['☕ Café', '🍷 Alcool', '🏃 Sport', '😰 Stress', '📱 Écrans tard', '🍝 Repas tardif', '😴 Sieste', '💊 Médicament', '📖 Lecture', '🧘 Méditation', '🤒 Malade', '✈️ Voyage'];
const MOODS = ['😫', '😕', '😐', '🙂', '😄'];

let tab = 'nuit';
let clockTimer = null;
let cleanup = [];

// ---------- Utilitaires UI ----------
function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function openSheet(html, onMount) {
  $('#sheet-content').innerHTML = html;
  $('#sheet').hidden = false;
  $('#sheet-backdrop').hidden = false;
  $('#sheet').scrollTop = 0;
  onMount && onMount($('#sheet-content'));
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  $('#sheet-content').innerHTML = '';
}
$('#sheet-backdrop').addEventListener('click', closeSheet);

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function go(t) {
  tab = t;
  cleanup.forEach(fn => fn()); cleanup = [];
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $('#page-title').textContent = TITLES[t];
  window.scrollTo(0, 0);
  ({ nuit: renderNuit, journal: renderJournal, analyses: renderAnalyses, detente: renderDetente, science: renderScience })[t]();
}
$$('#tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
$('#btn-settings').addEventListener('click', openSettings);

// =====================================================================
// 1) NUIT
// =====================================================================
function renderNuit() {
  const s = store.settings;
  const last = store.nights[0];
  const wakeMin = timeToMinutes(s.alarm);
  const beds = bedtimesFor(wakeMin);
  view.className = 'stars';
  view.innerHTML = `
    ${isIOS && !isStandalone ? `
      <div class="card install-hint">
        <h2>📲 Installe Somnia sur ton iPhone</h2>
        <p class="small">Installée, l'app s'ouvre en plein écran, fonctionne hors ligne et le suivi de nuit est plus fiable.</p>
        <button class="btn primary block" id="btn-install">Installer l'app</button>
      </div>` : ''}

    <div class="hero-clock">
      <div class="time" id="clock">--:--</div>
      <div class="date">${fmtDate(Date.now())}</div>
    </div>

    <div class="card alarm-card" id="alarm-card">
      <div>
        <div class="muted small">⏰ Réveil intelligent</div>
        <div class="t">${s.alarmOn ? s.alarm : 'Désactivé'}</div>
        <div class="muted tiny">${s.alarmOn ? (s.smartWindow ? `Entre ${minutesToTime(wakeMin - s.smartWindow)} et ${s.alarm}, pendant un sommeil léger` : 'Heure fixe') : 'Touchez pour régler'}</div>
      </div>
      <label class="switch" onclick="event.stopPropagation()"><input type="checkbox" id="alarm-on" ${s.alarmOn ? 'checked' : ''}><span></span></label>
    </div>

    <button class="btn primary block big" id="btn-start">🌙 Commencer ma nuit</button>
    <p class="muted tiny center" style="margin-top:8px">Pour une mesure précise : iPhone <b>sur le matelas</b> près de l'oreiller, écran vers le haut, <b>branché</b>, et l'app laissée ouverte. L'écran restera allumé (très sombre).</p>

    <div class="section-title">Ce soir</div>
    <div class="card">
      <h2>🛏️ Heures de coucher idéales</h2>
      <p class="muted small">Pour te réveiller à ${s.alarm} en fin de cycle (≈ 15 min d'endormissement) :</p>
      <div class="grid3" style="margin-top:10px">
        ${beds.map((b, i) => `<div class="stat center"><div class="v" style="${i === 0 ? 'color:var(--good)' : ''}">${minutesToTime(b.min)}</div><div class="l">${b.cycles} cycles · ${fmtDur(b.sleep)}</div></div>`).join('')}
      </div>
    </div>

    ${last ? `
      <div class="section-title">Dernière nuit</div>
      <div class="card" id="last-night" style="cursor:pointer">
        <div class="row" style="gap:16px">
          ${scoreRing(last.score, 96)}
          <div style="flex:1">
            <div style="font-weight:700;text-transform:capitalize">${fmtShortDate(last.start)}</div>
            <div class="muted small">${fmtTime(last.start)} → ${fmtTime(last.end)}</div>
            <div style="font-size:22px;font-weight:800;margin-top:4px">${fmtDur(last.summary.asleep)}</div>
            <span class="pill ${scoreLabel(last.score).cls}">${scoreLabel(last.score).txt}</span>
          </div>
        </div>
        ${phaseBar(last.summary)}
        ${legend()}
      </div>` : `
      <div class="card empty"><div class="ico">🌙</div>Aucune nuit enregistrée pour l'instant.<br>Lance ta première nuit ce soir !</div>`}

    <button class="btn ghost block" id="btn-manual">✍️ Ajouter une nuit manuellement</button>
  `;

  const tickClock = () => { const c = $('#clock'); if (c) c.textContent = fmtTime(Date.now()); };
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
  cleanup.push(() => clearInterval(clockTimer));

  $('#alarm-on').addEventListener('change', e => { store.setSettings({ alarmOn: e.target.checked }); renderNuit(); });
  $('#alarm-card').addEventListener('click', openAlarmSheet);
  $('#btn-start').addEventListener('click', startNight);
  $('#btn-install')?.addEventListener('click', () => maybeShowInstall(true));
  $('#btn-manual').addEventListener('click', openManualNight);
  last && $('#last-night').addEventListener('click', () => openNightDetail(last.id));
}

function openAlarmSheet() {
  const s = store.settings;
  openSheet(`
    <h2>⏰ Réveil</h2>
    <label class="field"><span>Heure de réveil</span><input type="time" id="a-time" value="${s.alarm}"></label>
    <label class="field"><span>Fenêtre de réveil intelligent</span>
      <select id="a-win">${[0, 10, 20, 30, 45].map(v => `<option value="${v}" ${v === s.smartWindow ? 'selected' : ''}>${v ? v + ' minutes avant' : 'Désactivée (heure fixe)'}</option>`).join('')}</select>
    </label>
    <p class="muted small">Pendant cette fenêtre, Somnia sonne dès qu'il détecte que tu bouges (sommeil léger) : le réveil est plus doux qu'en plein sommeil profond.</p>
    <label class="field"><span>Sonnerie</span>
      <select id="a-sound"><option value="aube" ${s.alarmSound === 'aube' ? 'selected' : ''}>Aube (douce, progressive)</option><option value="bip" ${s.alarmSound === 'bip' ? 'selected' : ''}>Bip classique</option></select>
    </label>
    <div class="grid2">
      <button class="btn ghost" id="a-test">🔊 Tester</button>
      <button class="btn primary" id="a-save">Enregistrer</button>
    </div>
  `, root => {
    let testing = false;
    $('#a-test', root).addEventListener('click', e => {
      testing = !testing;
      if (testing) { snd.startAlarm($('#a-sound', root).value); e.target.textContent = '⏹ Arrêter'; }
      else { snd.stopAlarm(); e.target.textContent = '🔊 Tester'; }
    });
    $('#a-save', root).addEventListener('click', () => {
      snd.stopAlarm();
      store.setSettings({ alarm: $('#a-time', root).value || '07:00', smartWindow: +$('#a-win', root).value, alarmSound: $('#a-sound', root).value, alarmOn: true });
      closeSheet(); renderNuit(); toast('Réveil enregistré');
    });
  });
}

// ---------- Mode nuit ----------
let nightEl = null;

async function startNight() {
  const btn = $('#btn-start');
  if (btn) { btn.disabled = true; btn.textContent = 'Préparation…'; }
  snd.stopAll();
  const live = await tracker.start();
  showNightMode();
  if (!live.sensors.motion) toast('Capteur de mouvement refusé ou indisponible : les phases seront seulement estimées. Autorise « Mouvement et orientation » pour une vraie mesure.', 5000);
  else if (store.settings.useMic && !live.sensors.mic) toast('Micro indisponible : les bruits ne seront pas mesurés (le suivi du sommeil fonctionne quand même).', 4000);
}

function showNightMode() {
  if (nightEl) nightEl.remove();
  nightEl = document.createElement('div');
  nightEl.className = 'night-mode';
  const live = tracker.live;
  nightEl.innerHTML = `
    <div class="meta" id="nm-alarm"></div>
    <div class="center">
      <div class="time" id="nm-clock">--:--</div>
      <div class="meta" id="nm-elapsed"></div>
    </div>
    <div class="meters">
      <div class="meta small" style="text-align:left">Mouvements ${live.sensors.motion ? '' : '(indisponible)'}</div>
      <div class="meter"><i id="nm-m"></i></div>
      <div class="meta small" style="text-align:left">Sons ${live.sensors.mic ? '' : '(indisponible)'}</div>
      <div class="meter"><i id="nm-n"></i></div>
      <div class="meta small" id="nm-status" style="text-align:left;margin-bottom:10px"></div>
      <button class="btn block" id="nm-reenable" style="margin-bottom:10px" hidden>🔄 Réactiver les capteurs</button>
      <button class="btn block hold" id="nm-stop"><i></i><span>Maintenir pour terminer la nuit</span></button>
      <p class="meta tiny">Touchez l'écran pour l'assombrir. Laissez l'app ouverte toute la nuit.</p>
    </div>`;
  document.body.appendChild(nightEl);

  const update = () => {
    const l = tracker.live;
    if (!l) return;
    $('#nm-clock', nightEl).textContent = fmtTime(Date.now());
    $('#nm-elapsed', nightEl).textContent = `Au lit depuis ${fmtDur((Date.now() - l.start) / 60000)}`;
    $('#nm-alarm', nightEl).textContent = l.alarmAt
      ? `⏰ ${l.windowStart ? `Réveil entre ${fmtTime(l.windowStart)} et ${fmtTime(l.alarmAt)}` : `Réveil à ${fmtTime(l.alarmAt)}`}`
      : 'Pas de réveil programmé';
    const c = tracker.current();
    const m = c.samples ? Math.min(1, c.motion / c.samples * 4) : 0;
    const n = c.noiseN ? c.noiseSum / c.noiseN : 0;
    $('#nm-m', nightEl).style.width = `${Math.max(2, m * 100)}%`;
    $('#nm-n', nightEl).style.width = `${Math.max(2, n * 100)}%`;
    const warn = [];
    if (l.motionUsed && !tracker.motionOk && Date.now() - l.start > 10000) warn.push('⚠️ Aucun signal de mouvement');
    if (!wakeLockActive()) warn.push('⚠️ Écran : désactive le verrouillage auto');
    $('#nm-status', nightEl).textContent = warn.length ? warn.join(' · ') : '✅ Capteurs actifs · écran maintenu allumé';
    $('#nm-reenable', nightEl).hidden = !(l.resumed && (!l.sensors.motion || (store.settings.useMic && !l.sensors.mic)));
  };
  update();
  nightEl._u = setInterval(update, 1000);

  nightEl.addEventListener('click', e => { if (!e.target.closest('button')) nightEl.classList.toggle('dim'); });
  $('#nm-reenable', nightEl).addEventListener('click', async () => { await tracker.reenableSensors(); tracker.live.resumed = false; toast('Capteurs réactivés'); });

  // Appui long (1,2 s) pour éviter un arrêt accidentel dans le noir
  const stopBtn = $('#nm-stop', nightEl);
  const bar = stopBtn.querySelector('i');
  let holdT = null, holdStart = 0, raf = 0;
  const down = e => {
    e.preventDefault();
    holdStart = Date.now();
    const anim = () => { bar.style.width = Math.min(100, (Date.now() - holdStart) / 12) + '%'; raf = requestAnimationFrame(anim); };
    anim();
    holdT = setTimeout(() => { cancelAnimationFrame(raf); finishNight(); }, 1200);
  };
  const up = () => { clearTimeout(holdT); cancelAnimationFrame(raf); bar.style.width = '0'; };
  stopBtn.addEventListener('pointerdown', down);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => stopBtn.addEventListener(ev, up));
}

function hideNightMode() {
  if (!nightEl) return;
  clearInterval(nightEl._u);
  nightEl.remove(); nightEl = null;
}

tracker.on('alarm', () => {
  const el = document.createElement('div');
  el.className = 'alarm-ring';
  el.id = 'alarm-ring';
  el.innerHTML = `
    <div style="font-size:60px">☀️</div>
    <div class="time">${fmtTime(Date.now())}</div>
    <div style="font-size:22px;font-weight:700">Bonjour !</div>
    <button class="btn big block" style="max-width:320px;background:#fff;color:#3a1c5c" id="al-stop">Je suis réveillé·e</button>
    <button class="btn block" style="max-width:320px;background:rgba(255,255,255,.2);color:#fff" id="al-snooze">Répéter dans 9 min</button>`;
  document.body.appendChild(el);
  $('#al-stop', el).addEventListener('click', () => { el.remove(); finishNight(); });
  $('#al-snooze', el).addEventListener('click', () => { tracker.snooze(9); el.remove(); toast('Réveil dans 9 minutes'); });
});

function finishNight() {
  const raw = tracker.stop();
  hideNightMode();
  $('#alarm-ring')?.remove();
  if (!raw) return;
  const minutes = (raw.end - raw.start) / 60000;
  if (minutes < 20) {
    toast('Nuit de moins de 20 minutes : non enregistrée.');
    go('nuit');
    return;
  }
  const hasSensors = raw.motionUsed || raw.sensors.motion || raw.epochs.some(e => e.c || e.m);
  const night = buildNight({ id: raw.id, start: raw.start, end: raw.end, epochs: raw.epochs, events: raw.events, source: hasSensors ? 'capteurs' : 'estimation', prevEnd: prevEndBefore(raw.start) }, store.settings.goalMin);
  store.addNight(night);
  go('nuit');
  openMorning(night.id);
  const count = store.nights.filter(x => !x.demo).length;
  if (count % 7 === 0) setTimeout(() => toast('💾 Pense à sauvegarder tes nuits : ⚙️ → Exporter', 4000), 1500);
}

// Questionnaire du matin
function openMorning(id) {
  const n = store.getNight(id);
  const lbl = scoreLabel(n.score);
  openSheet(`
    <h2>☀️ Bilan de ta nuit</h2>
    <div class="row" style="gap:16px">
      ${scoreRing(n.score, 110)}
      <div>
        <div style="font-size:26px;font-weight:800">${fmtDur(n.summary.asleep)}</div>
        <div class="muted small">de sommeil · ${fmtTime(n.start)} → ${fmtTime(n.end)}</div>
        <span class="pill ${lbl.cls}">${lbl.txt}</span>
      </div>
    </div>
    ${hypnogram(n.stages, n.start, { events: n.events })}
    ${legend()}
    <div class="grid3" style="margin-top:12px">
      <div class="stat center"><div class="v" style="font-size:18px">${fmtDur(n.summary.latency)}</div><div class="l">Endormissement</div></div>
      <div class="stat center"><div class="v" style="font-size:18px">${Math.round(n.summary.efficiency * 100)} %</div><div class="l">Efficacité</div></div>
      <div class="stat center"><div class="v" style="font-size:18px">${n.summary.awakenings}</div><div class="l">Réveils</div></div>
    </div>
    ${respBlock(n)}
    ${qualityBlock(n)}
    <div class="section-title">Comment te sens-tu ?</div>
    <div class="row between" id="moods">${MOODS.map((m, i) => `<button class="chip" data-v="${i + 1}" style="font-size:26px;padding:8px 12px">${m}</button>`).join('')}</div>
    <div class="section-title">Hier, tu as eu…</div>
    <div id="tags">${TAGS.map(t => `<button class="chip" data-t="${t}">${t}</button>`).join('')}</div>
    <label class="field"><span>Note (rêves, réveils…)</span><textarea id="note" placeholder="Facultatif"></textarea></label>
    <button class="btn primary block" id="m-save">Enregistrer</button>
  `, root => bindNightEdit(root, n, () => { closeSheet(); go(tab); toast('Nuit enregistrée ✅'); }));
}

function prevEndBefore(ts) {
  const prev = store.nights.find(x => x.end <= ts);
  return prev ? prev.end : undefined;
}

function respBlock(n) {
  const r = n.resp;
  if (!r) return '';
  return `<div class="grid2" style="margin-top:10px">
    <div class="stat"><div class="v" style="font-size:18px">${r.bpm ? r.bpm.toFixed(1).replace('.', ',') + ' /min' : '—'}</div><div class="l">Respiration pendant le sommeil (normal : 12-20)</div></div>
    <div class="stat"><div class="v" style="font-size:18px">${r.snoreMin == null ? '—' : fmtDur(r.snoreMin)}</div><div class="l">Ronflements détectés</div></div>
  </div>
  ${r.snoreMin > 60 ? '<p class="muted small">Ronflements fréquents : fais le test STOP-BANG (onglet Science). En cas de pauses respiratoires ou de fatigue en journée, parles-en à un médecin.</p>' : ''}
  ${r.bpm && (r.bpm < 8 || r.bpm > 24) ? '<p class="muted small">Rythme respiratoire inhabituel : la mesure peut être perturbée (ventilateur, partenaire, animal). Si cela se répète, demande un avis médical.</p>' : ''}`;
}

function qualityBlock(n) {
  const q = n.quality;
  if (!q) return '';
  const cls = { 'élevée': 'good', moyenne: 'warn', faible: 'bad', estimation: 'warn' }[q.level] || 'warn';
  return `<div class="card" style="background:var(--card);margin-top:12px">
    <div class="row between"><b>🎯 Fiabilité de la mesure</b><span class="pill ${cls}">${q.level === 'estimation' ? 'Estimation' : q.level[0].toUpperCase() + q.level.slice(1)}${q.pct ? ' · ' + q.pct + ' %' : ''}</span></div>
    ${q.phasePct ? `<div class="row between small" style="margin-top:8px"><span>Éveil / sommeil</span><b>${q.pct} %</b></div>
    <div class="row between small"><span>Phases (profond, léger, paradoxal)</span><b>${q.phasePct} %</b></div>` : ''}
    ${q.reasons.map(r => `<p class="muted small" style="margin:6px 0 0">• ${esc(r)}</p>`).join('')}
  </div>`;
}

function bindNightEdit(root, n, done) {
  let mood = n.mood;
  const tags = new Set(n.tags || []);
  $$('#moods .chip', root).forEach(b => {
    b.classList.toggle('on', +b.dataset.v === mood);
    b.addEventListener('click', () => { mood = +b.dataset.v; $$('#moods .chip', root).forEach(x => x.classList.toggle('on', x === b)); });
  });
  $$('#tags .chip', root).forEach(b => {
    b.classList.toggle('on', tags.has(b.dataset.t));
    b.addEventListener('click', () => { tags.has(b.dataset.t) ? tags.delete(b.dataset.t) : tags.add(b.dataset.t); b.classList.toggle('on'); });
  });
  $('#note', root).value = n.note || '';
  $('#m-save', root).addEventListener('click', () => {
    store.updateNight(n.id, { mood, tags: [...tags], note: $('#note', root).value.trim() });
    done();
  });
}

function openManualNight() {
  const now = new Date();
  const y = new Date(now); y.setDate(y.getDate() - 1); y.setHours(23, 0, 0, 0);
  const w = new Date(now); w.setHours(7, 0, 0, 0);
  const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  openSheet(`
    <h2>✍️ Ajouter une nuit</h2>
    <p class="muted small">Les phases seront estimées à partir du modèle des cycles de sommeil.</p>
    <label class="field"><span>Coucher</span><input type="datetime-local" id="mn-start" value="${local(y)}"></label>
    <label class="field"><span>Réveil</span><input type="datetime-local" id="mn-end" value="${local(w)}"></label>
    <button class="btn primary block" id="mn-save">Continuer</button>
  `, root => {
    $('#mn-save', root).addEventListener('click', () => {
      const start = new Date($('#mn-start', root).value).getTime();
      const end = new Date($('#mn-end', root).value).getTime();
      if (!start || !end || end <= start) return toast('Vérifie les horaires');
      if (end - start > 20 * 3600e3) return toast('Durée supérieure à 20 h ?');
      const night = buildNight({ id: uid(), start, end, source: 'manuel', prevEnd: prevEndBefore(start) }, store.settings.goalMin);
      store.addNight(night);
      openMorning(night.id);
    });
  });
}

// =====================================================================
// 2) JOURNAL
// =====================================================================
function renderJournal() {
  view.className = '';
  const nights = store.nights;
  if (!nights.length) {
    view.innerHTML = `<div class="card empty"><div class="ico">📓</div>Ton journal est vide.<br>Chaque nuit suivie apparaîtra ici.</div>
      <button class="btn ghost block" id="j-add">✍️ Ajouter une nuit</button>`;
    $('#j-add').addEventListener('click', openManualNight);
    return;
  }
  const groups = {};
  for (const n of nights) {
    const k = new Date(n.start - 12 * 3600e3).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    (groups[k] = groups[k] || []).push(n);
  }
  view.innerHTML = Object.entries(groups).map(([month, list]) => `
    <div class="section-title">${month}</div>
    <div class="card" style="padding:4px 16px">
      ${list.map(n => {
        const l = scoreLabel(n.score);
        return `<div class="list-item" data-id="${n.id}" style="cursor:pointer">
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;text-transform:capitalize">${fmtShortDate(n.start)} ${n.mood ? MOODS[n.mood - 1] : ''}</div>
            <div class="muted small">${fmtTime(n.start)} → ${fmtTime(n.end)} · ${fmtDur(n.summary.asleep)}</div>
          </div>
          ${miniHypno(n.stages)}
          <span class="pill ${l.cls}" style="min-width:38px;text-align:center">${n.score}</span>
        </div>`;
      }).join('')}
    </div>`).join('') + `<button class="btn ghost block" id="j-add">✍️ Ajouter une nuit</button>`;
  $$('.list-item[data-id]').forEach(el => el.addEventListener('click', () => openNightDetail(el.dataset.id)));
  $('#j-add').addEventListener('click', openManualNight);
}

function openNightDetail(id) {
  const n = store.getNight(id);
  if (!n) return;
  const s = n.summary;
  const pct = v => s.inBed ? Math.round(v / s.inBed * 100) : 0;
  const lbl = scoreLabel(n.score);
  const srcTxt = { capteurs: '📡 Mesurée par les capteurs', manuel: '✍️ Saisie manuelle (phases estimées)', estimation: '📐 Estimée (capteurs indisponibles)' }[n.source] || '';
  openSheet(`
    <h2 style="text-transform:capitalize">${fmtDate(n.start)}</h2>
    <div class="row" style="gap:16px">
      ${scoreRing(n.score, 110)}
      <div>
        <div style="font-size:26px;font-weight:800">${fmtDur(s.asleep)}</div>
        <div class="muted small">${fmtTime(n.start)} → ${fmtTime(n.end)} · au lit ${fmtDur(s.inBed)}</div>
        <span class="pill ${lbl.cls}">${lbl.txt}</span>
        <div class="muted tiny" style="margin-top:6px">${srcTxt}</div>
      </div>
    </div>
    <div class="spacer"></div>
    ${hypnogram(n.stages, n.start, { events: n.events })}
    ${legend()}
    ${n.events?.length ? `<p class="muted tiny">● ${n.events.length} bruit(s) détecté(s) (points jaunes)</p>` : ''}
    <div class="grid2" style="margin-top:12px">
      <div class="stat"><div class="v">${Math.round(s.efficiency * 100)} %</div><div class="l">Efficacité</div></div>
      <div class="stat"><div class="v">${fmtDur(s.latency)}</div><div class="l">Endormissement</div></div>
      <div class="stat"><div class="v">${s.awakenings}</div><div class="l">Réveils (≥ 3 min)</div></div>
      <div class="stat"><div class="v">${fmtDur(s.waso ?? 0)}</div><div class="l">Éveil nocturne total</div></div>
    </div>
    ${respBlock(n)}
    ${qualityBlock(n)}
    <div class="card" style="margin-top:12px;background:var(--card)">
      ${[['D', s.deep], ['L', s.light], ['R', s.rem], ['W', s.awake]].map(([k, v]) => `
        <div class="row between small" style="margin:6px 0"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${STAGES[k].hex};margin-right:8px"></i>${STAGES[k].name}</span><span><b>${fmtDur(v)}</b> <span class="muted">${pct(v)} %</span></span></div>`).join('')}
    </div>
    <div class="section-title">Ressenti</div>
    <div class="row between" id="moods">${MOODS.map((m, i) => `<button class="chip" data-v="${i + 1}" style="font-size:26px;padding:8px 12px">${m}</button>`).join('')}</div>
    <div class="section-title">Habitudes de la veille</div>
    <div id="tags">${TAGS.map(t => `<button class="chip" data-t="${t}">${t}</button>`).join('')}</div>
    <label class="field"><span>Note</span><textarea id="note"></textarea></label>
    <button class="btn primary block" id="m-save">Enregistrer</button>
    <div class="spacer"></div>
    <button class="btn danger block" id="n-del">Supprimer cette nuit</button>
  `, root => {
    bindNightEdit(root, n, () => { closeSheet(); go(tab); toast('Modifications enregistrées'); });
    $('#n-del', root).addEventListener('click', () => {
      if (confirm('Supprimer définitivement cette nuit ?')) { store.deleteNight(n.id); closeSheet(); go(tab); toast('Nuit supprimée'); }
    });
  });
}

// =====================================================================
// 3) ANALYSES
// =====================================================================
let period = 7;
function renderAnalyses() {
  view.className = '';
  const goal = store.settings.goalMin;
  const all = store.nights;
  const st = statsFor(all, period, goal);
  const seg = `<div class="seg" id="seg">${[[7, '7 jours'], [30, '30 jours'], [90, '3 mois']].map(([v, l]) => `<button data-v="${v}" class="${v === period ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (!st) {
    view.innerHTML = seg + `<div class="card empty"><div class="ico">📊</div>Pas encore de données sur cette période.<br>Tes tendances apparaîtront après quelques nuits.</div>`;
    bindSeg();
    return;
  }

  // Une valeur par jour (dernière nuit du jour)
  const byDay = {};
  st.list.forEach(n => { byDay[nightKey(n.start)] = n; });
  const days = [];
  for (let i = period - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400e3 - 12 * 3600e3);
    const k = nightKey(d.getTime() + 12 * 3600e3);
    const n = byDay[k];
    const showLbl = period === 7 || i % Math.ceil(period / 7) === 0;
    days.push({ n, label: showLbl ? (period === 7 ? d.toLocaleDateString('fr-FR', { weekday: 'narrow' }) : `${d.getDate()}/${d.getMonth() + 1}`) : '' });
  }
  const debtH = st.debt / 60;
  const reg = st.bedSd < 30 ? ['Très régulier', 'good'] : st.bedSd < 60 ? ['Assez régulier', 'warn'] : ['Irrégulier', 'bad'];
  const impact = tagImpact(all);
  const phaseSum = { inBed: st.avgDeep + st.avgLight + st.avgRem + st.avgAwake, deep: st.avgDeep, light: st.avgLight, rem: st.avgRem, awake: st.avgAwake };
  const insights = buildInsights(st, goal);

  view.innerHTML = seg + `
    <div class="card">
      <div class="row" style="gap:16px">
        ${scoreRing(Math.round(st.avgScore), 100, 'moyen')}
        <div class="grid2" style="flex:1;gap:8px">
          <div class="stat"><div class="v" style="font-size:18px">${fmtDur(st.avgAsleep)}</div><div class="l">Sommeil moyen</div></div>
          <div class="stat"><div class="v" style="font-size:18px">${Math.round(st.avgEff * 100)} %</div><div class="l">Efficacité</div></div>
          <div class="stat"><div class="v" style="font-size:18px">${minutesToTime(st.bedMean)}</div><div class="l">Coucher moyen</div></div>
          <div class="stat"><div class="v" style="font-size:18px">${minutesToTime(st.wakeMean)}</div><div class="l">Lever moyen</div></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>💡 À retenir</h2>
      ${insights.map(t => `<p class="small">• ${t}</p>`).join('')}
    </div>

    <div class="card"><h2>Durée de sommeil</h2>${durationBars(days.map(d => ({ v: d.n ? d.n.summary.asleep : 0, label: d.label })), goal)}</div>

    <div class="card"><h2>Score de sommeil</h2>${lineChart(days.map(d => ({ v: d.n ? d.n.score : null, label: d.label })))}</div>

    <div class="card">
      <div class="row between"><h2>Régularité des horaires</h2><span class="pill ${reg[1]}">${reg[0]}</span></div>
      <p class="muted small">Variation de l'heure du coucher : ± ${Math.round(st.bedSd)} min. Visez moins de 30 min, même le week-end.</p>
      ${scheduleChart(st.list.slice(-14))}
    </div>

    ${circadianCard(st.list)}

    <div class="card">
      <h2>Phases moyennes</h2>
      ${phaseBar(phaseSum)}
      ${legend()}
      <div class="grid2" style="margin-top:10px">
        <div class="stat"><div class="v" style="font-size:18px">${fmtDur(st.avgDeep)}</div><div class="l">Profond (repères : 13-23 %)</div></div>
        <div class="stat"><div class="v" style="font-size:18px">${fmtDur(st.avgRem)}</div><div class="l">Paradoxal (repères : 20-25 %)</div></div>
      </div>
    </div>

    <div class="card">
      <div class="row between"><h2>Dette de sommeil</h2><span class="pill ${debtH <= 2 ? 'good' : debtH <= 5 ? 'warn' : 'bad'}">${debtH > 0 ? '−' + fmtDur(st.debt) : 'Aucune'}</span></div>
      <p class="muted small">Cumul sur les 7 dernières nuits par rapport à ton objectif de ${fmtDur(goal)}. Une dette se rattrape progressivement (≈ 30-60 min de plus par nuit), pas en une grasse matinée.</p>
    </div>

    <div class="card">
      <h2>Impact de tes habitudes</h2>
      ${impact.length ? impact.map(i => `
        <div class="row between small" style="margin:8px 0"><span>${esc(i.tag)} <span class="muted">(${i.n} nuits)</span></span>
        <b style="color:${i.diff < -2 ? 'var(--bad)' : i.diff > 2 ? 'var(--good)' : 'var(--muted)'}">${i.diff > 0 ? '+' : ''}${i.diff.toFixed(0)} pts</b></div>`).join('')
        : '<p class="muted small">Renseigne tes habitudes (café, sport, écrans…) le matin : après quelques nuits, Somnia te montrera celles qui influencent ton score.</p>'}
    </div>
  `;
  bindSeg();
}
function circadianCard(list) {
  const sri = sleepRegularityIndex(list);
  const ch = chronotype(list);
  const h = v => minutesToTime(v * 60);
  const sriCls = sri ? (sri.sri >= 85 ? 'good' : sri.sri >= 70 ? 'warn' : 'bad') : '';
  return `<div class="card">
    <h2>🧬 Rythme circadien</h2>
    <div class="row between"><b class="small">Indice de régularité (SRI)</b>${sri ? `<span class="pill ${sriCls}">${sri.sri} / 100</span>` : '<span class="muted small">3 nuits consécutives min.</span>'}</div>
    <p class="muted small">Probabilité d'être dans le même état (endormi/éveillé) à 24 h d'intervalle (Phillips et al., 2017). Un SRI élevé est associé à une mortalité plus faible, indépendamment de la durée de sommeil (Windred et al., Sleep 2024). Objectif : 85 ou plus.</p>
    <div class="spacer"></div>
    <div class="row between"><b class="small">Chronotype (méthode MCTQ)</b>${ch ? `<span class="pill good">${ch.type}</span>` : '<span class="muted small">Il faut des nuits en semaine et le week-end</span>'}</div>
    ${ch ? `<div class="grid3" style="margin-top:8px">
      <div class="stat center"><div class="v" style="font-size:17px">${h(ch.MSFsc)}</div><div class="l">Milieu de sommeil naturel</div></div>
      <div class="stat center"><div class="v" style="font-size:17px">${h(ch.MSW)}</div><div class="l">Milieu en semaine</div></div>
      <div class="stat center"><div class="v" style="font-size:17px;color:${ch.jetlag > 1 ? 'var(--warn)' : 'var(--good)'}">${fmtDur(ch.jetlag * 60)}</div><div class="l">Jet-lag social</div></div>
    </div>
    <p class="muted small">${ch.jetlag > 1 ? 'Plus d\'1 h d\'écart entre semaine et week-end : c\'est comme changer de fuseau horaire chaque week-end (Roenneberg et al., 2012). Rapproche tes horaires du week-end de ceux de la semaine.' : 'Tes horaires de semaine et de week-end sont bien alignés.'}</p>` : ''}
  </div>`;
}

function bindSeg() {
  $$('#seg button').forEach(b => b.addEventListener('click', () => { period = +b.dataset.v; renderAnalyses(); }));
}

function buildInsights(st, goal) {
  const out = [];
  if (st.avgAsleep < 420) out.push(`Tu dors en moyenne <b>${fmtDur(st.avgAsleep)}</b>, sous le minimum de 7 h recommandé pour un adulte.`);
  else if (st.avgAsleep >= goal) out.push(`Bravo, ta durée moyenne (<b>${fmtDur(st.avgAsleep)}</b>) atteint ton objectif.`);
  else out.push(`Il te manque en moyenne <b>${fmtDur(goal - st.avgAsleep)}</b> par nuit pour atteindre ton objectif.`);
  if (st.bedSd > 60) out.push('Tes horaires de coucher varient beaucoup : un horaire fixe aide l\'horloge biologique.');
  if (st.avgLatency > 30) out.push(`Tu mets environ ${Math.round(st.avgLatency)} min à t'endormir : essaie la respiration 4-7-8 (onglet Détente) et évite les écrans 1 h avant.`);
  if (st.avgEff < 0.85) out.push(`Efficacité de ${Math.round(st.avgEff * 100)} % : réserve le lit au sommeil, et lève-toi si tu ne dors pas au bout de 20 min.`);
  if (out.length < 3 && st.count < 5) out.push('Plus tu suis de nuits, plus les analyses seront précises.');
  return out;
}

// =====================================================================
// 4) DÉTENTE
// =====================================================================
const BREATHS = {
  '478': { name: '4-7-8', desc: 'Inspire 4 s, retiens 7 s, expire 8 s. Technique du Dr Andrew Weil pour s\'endormir.', steps: [['Inspire', 4, 1.7], ['Retiens', 7, 1.7], ['Expire', 8, 1]] },
  coherence: { name: 'Cohérence cardiaque', desc: '6 respirations par minute (5 s / 5 s) pendant 5 min : réduit le stress.', steps: [['Inspire', 5, 1.7], ['Expire', 5, 1]] },
  carre: { name: 'Respiration carrée', desc: '4 s par étape. Utilisée pour calmer rapidement le système nerveux.', steps: [['Inspire', 4, 1.7], ['Retiens', 4, 1.7], ['Expire', 4, 1], ['Pause', 4, 1]] },
};
let breathMode = '478';
let breathTimer = null;

function renderDetente() {
  view.className = '';
  view.innerHTML = `
    <div class="card">
      <div class="row between"><h2>Sons pour dormir</h2><button class="btn ghost" id="stop-all" style="padding:8px 12px;font-size:14px">⏹ Tout arrêter</button></div>
      <p class="muted small">Combine plusieurs sons et règle chaque volume. Générés en direct : fonctionnent hors ligne.</p>
      <div class="sound-grid" style="margin-top:10px">
        ${snd.SOUNDS.map(s => `
          <div class="sound ${snd.isPlaying(s.id) ? 'on' : ''}" data-id="${s.id}">
            <div class="ico">${s.ico}</div><div class="n">${s.name}</div>
            <input type="range" min="0" max="1" step="0.05" value="0.6" aria-label="Volume ${s.name}">
          </div>`).join('')}
      </div>
      <h3>Minuteur d'arrêt</h3>
      <div id="timers">${[0, 15, 30, 45, 60, 90].map(v => `<button class="chip" data-v="${v}">${v ? v + ' min' : 'Aucun'}</button>`).join('')}</div>
      <p class="muted tiny" id="timer-left"></p>
    </div>

    <div class="card">
      <h2>Respiration guidée</h2>
      <div class="seg" id="bseg">${Object.entries(BREATHS).map(([k, b]) => `<button data-k="${k}" class="${k === breathMode ? 'on' : ''}">${b.name}</button>`).join('')}</div>
      <p class="muted small" id="bdesc">${BREATHS[breathMode].desc}</p>
      <div class="breath-wrap"><div class="breath" id="breath">Prêt</div></div>
      <button class="btn primary block" id="bstart">${breathTimer ? 'Arrêter' : 'Commencer'}</button>
    </div>

    <div class="card">
      <h2>Routine du coucher</h2>
      ${[
        ['📵', 'Écrans rangés 60 min avant', 'La lumière et la stimulation retardent la mélatonine.'],
        ['🌡️', 'Chambre fraîche (16-19 °C)', 'La baisse de température corporelle déclenche le sommeil.'],
        ['🚿', 'Douche tiède 1-2 h avant', 'Accélère l\'endormissement d\'environ 10 min (Haghayegh, 2019).'],
        ['📝', 'Vider sa tête', 'Écrire sa to-do du lendemain aide à s\'endormir plus vite (Scullin, 2018).'],
        ['🌑', 'Obscurité totale', 'Même une faible lumière la nuit perturbe le métabolisme (Mason, PNAS 2022).'],
      ].map(([i, t, d]) => `<div class="list-item"><div style="font-size:24px">${i}</div><div><div style="font-weight:700">${t}</div><div class="muted small">${d}</div></div></div>`).join('')}
    </div>
  `;

  $$('.sound').forEach(el => {
    const id = el.dataset.id;
    const range = el.querySelector('input');
    el.addEventListener('click', e => {
      if (e.target === range) return;
      const on = snd.toggleSound(id, +range.value);
      el.classList.toggle('on', on);
    });
    range.addEventListener('input', () => {
      if (!snd.isPlaying(id)) { snd.toggleSound(id, +range.value); el.classList.add('on'); }
      snd.setVolume(id, +range.value);
    });
  });
  $('#stop-all').addEventListener('click', () => { snd.stopAll(); $$('.sound').forEach(e => e.classList.remove('on')); updateTimerLabel(); });
  $$('#timers .chip').forEach(b => b.addEventListener('click', () => {
    snd.setSleepTimer(+b.dataset.v);
    $$('#timers .chip').forEach(x => x.classList.toggle('on', x === b));
    updateTimerLabel();
  }));
  const tl = setInterval(updateTimerLabel, 5000);
  updateTimerLabel();
  cleanup.push(() => clearInterval(tl));

  $$('#bseg button').forEach(b => b.addEventListener('click', () => {
    breathMode = b.dataset.k; stopBreath();
    $$('#bseg button').forEach(x => x.classList.toggle('on', x === b));
    $('#bdesc').textContent = BREATHS[breathMode].desc;
  }));
  $('#bstart').addEventListener('click', () => (breathTimer ? stopBreath() : startBreath()));
  cleanup.push(stopBreath);
}

function updateTimerLabel() {
  const el = $('#timer-left');
  if (!el) return;
  const r = snd.timerRemaining();
  el.textContent = r ? `Arrêt progressif dans ${Math.ceil(r / 60000)} min` : '';
}

function startBreath() {
  const b = BREATHS[breathMode];
  const el = $('#breath');
  let i = 0;
  const step = () => {
    const [txt, sec, scale] = b.steps[i % b.steps.length];
    el.style.transitionDuration = sec + 's';
    el.style.transform = `scale(${scale})`;
    let left = sec;
    el.textContent = `${txt} ${left}`;
    clearInterval(el._c);
    el._c = setInterval(() => { left--; if (left > 0) el.textContent = `${txt} ${left}`; }, 1000);
    i++;
    breathTimer = setTimeout(step, sec * 1000);
  };
  step();
  $('#bstart').textContent = 'Arrêter';
}
function stopBreath() {
  clearTimeout(breathTimer); breathTimer = null;
  const el = $('#breath');
  if (el) { clearInterval(el._c); el.style.transform = 'scale(1)'; el.textContent = 'Prêt'; }
  const b = $('#bstart'); if (b) b.textContent = 'Commencer';
}

// =====================================================================
// 5) SCIENCE (données en temps réel)
// =====================================================================
let studyTopic = 'general';
function renderScience() {
  view.className = '';
  const s = store.settings;
  const moon = sci.moonPhase();
  const reco = sci.RECO.find(r => s.age >= r.min && s.age < r.max);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const wakes = wakeTimesFrom(nowMin);
  view.innerHTML = `
    <p class="muted small" style="margin:0 4px 12px">Données mises à jour en direct depuis Open-Meteo et Europe PMC (publications scientifiques).</p>

    <div class="card" id="env"><h2>🌡️ Conditions de ce soir</h2><p class="muted small">Chargement de la météo…</p></div>

    <div class="card" id="sun"><h2>☀️ Lumière & horloge biologique</h2><p class="muted small">Chargement…</p></div>

    <div class="card">
      <div class="row between"><h2>${moon.ico} Lune</h2><span class="muted small">${Math.round(moon.illum * 100)} % éclairée</span></div>
      <p><b>${moon.name}</b> · jour ${Math.floor(moon.age)} du cycle lunaire</p>
      <p class="muted small">Certaines études observent un sommeil un peu plus court et plus tardif les jours précédant la pleine lune (Casiraghi et al., Science Advances 2021). L'effet reste faible et débattu.</p>
    </div>

    <div class="card">
      <h2>⏱️ Si je m'endors maintenant…</h2>
      <p class="muted small">Heures de réveil en fin de cycle (≈ 15 min pour s'endormir) :</p>
      <div class="grid3" style="margin-top:8px">${wakes.map((w, i) => `<div class="stat center"><div class="v" style="${i === 2 ? 'color:var(--good)' : ''}">${minutesToTime(w.min)}</div><div class="l">${w.cycles} cycles</div></div>`).join('')}</div>
    </div>

    <div class="card">
      <h2>🩺 Tests cliniques validés</h2>
      <p class="muted small">Les questionnaires utilisés par les médecins du sommeil. Refais-les tous les 1 à 3 mois pour suivre ton évolution.</p>
      ${TESTS.map(t => {
        const r = (s.tests || {})[t.id];
        const it = r ? t.interpret(r.score, r.answers) : null;
        return `<div class="list-item" data-test="${t.id}" style="cursor:pointer">
          <div style="font-size:24px">${t.ico}</div>
          <div style="flex:1"><b>${t.short}</b><div class="muted tiny">${r ? `${r.score}/${t.max} · ${new Date(r.date).toLocaleDateString('fr-FR')}` : 'Pas encore fait · 1 min'}</div></div>
          ${it ? `<span class="pill ${it.cls}" style="max-width:45%;text-align:right">${it.txt}</span>` : '<span class="muted">›</span>'}
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <h2>📏 Combien dormir ?</h2>
      <p class="muted small">Recommandations de la National Sleep Foundation (Hirshkowitz et al., 2015). Ton âge : ${s.age} ans.</p>
      <table class="reco">${sci.RECO.slice(4).map(r => `<tr class="${r === reco ? 'me' : ''}"><td>${r.label}</td><td style="text-align:right">${r.range}</td></tr>`).join('')}</table>
    </div>

    <div class="card">
      <h2>🔬 Dernières études publiées</h2>
      <div id="topics">${sci.TOPICS.map(t => `<button class="chip ${t.id === studyTopic ? 'on' : ''}" data-t="${t.id}">${t.name}</button>`).join('')}</div>
      <div id="studies"><p class="muted small">Chargement des publications…</p></div>
      <p class="muted tiny">Source : Europe PMC (inclut PubMed/MEDLINE). Articles en anglais, publiés ces 4 derniers mois.</p>
    </div>

    <div class="card">
      <h2>📚 Ce que dit la science</h2>
      ${sci.FACTS.map(f => `<div class="fact"><div class="small">${f.t}</div><div class="ref">${f.ref}</div></div>`).join('')}
    </div>

    <p class="muted tiny center">Somnia n'est pas un dispositif médical. En cas de ronflements forts, de pauses respiratoires ou de fatigue persistante, consulte un médecin.</p>
  `;
  $$('[data-test]').forEach(el => el.addEventListener('click', () => openTest(el.dataset.test)));
  $$('#topics .chip').forEach(b => b.addEventListener('click', () => {
    studyTopic = b.dataset.t;
    $$('#topics .chip').forEach(x => x.classList.toggle('on', x === b));
    loadStudies();
  }));
  loadEnv();
  loadStudies();
}

function openTest(id) {
  const t = TESTS.find(x => x.id === id);
  const answers = new Array(t.questions.length).fill(null);
  openSheet(`
    <h2>${t.ico} ${esc(t.name)}</h2>
    <p class="muted small">${esc(t.intro)}</p>
    ${t.questions.map((q, i) => `
      <div class="card" style="background:var(--card);padding:12px">
        <div class="small" style="font-weight:700;margin-bottom:8px">${i + 1}. ${esc(q.q)}</div>
        <div data-q="${i}">${q.o.map((o, j) => `<button class="chip" data-a="${j}" style="font-size:13px">${esc(o)}</button>`).join('')}</div>
      </div>`).join('')}
    <div id="t-result"></div>
    <button class="btn primary block" id="t-go" disabled>Voir mon résultat</button>
    <p class="muted tiny" style="margin-top:10px">Référence : ${esc(t.ref)}. Outil de dépistage, pas un diagnostic.</p>
  `, root => {
    $$('[data-q]', root).forEach(g => $$('.chip', g).forEach(b => b.addEventListener('click', () => {
      answers[+g.dataset.q] = +b.dataset.a;
      $$('.chip', g).forEach(x => x.classList.toggle('on', x === b));
      $('#t-go', root).disabled = answers.includes(null);
    })));
    $('#t-go', root).addEventListener('click', () => {
      const score = t.score(answers, t);
      const it = t.interpret(score, answers);
      store.setSettings({ tests: { ...(store.settings.tests || {}), [t.id]: { score, answers, date: Date.now() } } });
      $('#t-result', root).innerHTML = `<div class="card" style="border-color:var(--accent)">
        <div class="row between"><b>Score : ${score} / ${t.max}</b><span class="pill ${it.cls}">${esc(it.txt)}</span></div>
        ${it.advice ? `<p class="small">${esc(it.advice)}</p>` : ''}
      </div>`;
      const b = $('#t-go', root);
      b.textContent = 'Terminé';
      b.onclick = () => { closeSheet(); go('science'); };
      $('#t-result', root).scrollIntoView({ behavior: 'smooth' });
    }, { once: true });
  });
}

async function loadEnv() {
  try {
    const loc = await sci.getLocation();
    const [w, a] = await Promise.all([sci.fetchWeather(loc), sci.fetchAir(loc).catch(() => null)]);
    const env = $('#env'); const sun = $('#sun');
    if (!env) return;
    const c = w.current;
    const tmin = w.daily.temperature_2m_min[0];
    const aqi = a?.current?.european_aqi;
    const al = sci.aqiLabel(aqi);
    const advice = c.temperature_2m > 24 ? 'Il fait chaud : aère la chambre en fin de soirée, ventilateur ou drap léger. Au-dessus de 24 °C, le sommeil profond diminue.'
      : c.temperature_2m < 12 ? 'Il fait frais dehors : c\'est le moment d\'aérer 10 min avant de dormir pour atteindre 16-19 °C dans la chambre.'
        : 'Températures favorables : aérer la chambre 10 min avant le coucher est idéal.';
    const hum = c.relative_humidity_2m;
    env.innerHTML = `
      <div class="row between"><h2>🌡️ Conditions de ce soir</h2><span class="muted tiny">${esc(loc.name)}</span></div>
      <div class="grid3">
        <div class="stat center"><div class="v">${Math.round(c.temperature_2m)}°</div><div class="l">${sci.WEATHER_CODES[c.weather_code] || 'Dehors'}</div></div>
        <div class="stat center"><div class="v">${Math.round(tmin)}°</div><div class="l">Min. cette nuit</div></div>
        <div class="stat center"><div class="v">${hum} %</div><div class="l">Humidité</div></div>
      </div>
      <p class="small" style="margin-top:10px">${advice}</p>
      ${hum > 65 || hum < 35 ? `<p class="small muted">Humidité ${hum > 65 ? 'élevée' : 'basse'} : l'idéal pour dormir se situe entre 40 et 60 %.</p>` : ''}
      ${aqi != null ? `<div class="row between small" style="margin-top:8px"><span>Qualité de l'air (indice européen ${aqi}) · PM2.5 ${a.current.pm2_5} µg/m³</span><span class="pill ${al.cls}">${al.txt}</span></div>
        ${aqi > 60 ? '<p class="muted small">Air dégradé : évite d\'aérer longtemps ce soir, préfère tôt le matin.</p>' : ''}` : ''}
    `;
    const rise = new Date(w.daily.sunrise[1] || w.daily.sunrise[0]);
    const set = new Date(w.daily.sunset[0]);
    const dl = w.daily.daylight_duration[0] / 60;
    sun.innerHTML = `
      <h2>☀️ Lumière & horloge biologique</h2>
      <div class="grid3">
        <div class="stat center"><div class="v" style="font-size:18px">${fmtTime(set)}</div><div class="l">Coucher du soleil</div></div>
        <div class="stat center"><div class="v" style="font-size:18px">${fmtTime(rise)}</div><div class="l">Lever demain</div></div>
        <div class="stat center"><div class="v" style="font-size:18px">${fmtDur(dl)}</div><div class="l">Durée du jour</div></div>
      </div>
      <p class="small" style="margin-top:10px">Après ${fmtTime(set)}, baisse les lumières et passe en éclairage chaud : la mélatonine commence à monter ~2 h avant l'endormissement.</p>
      <p class="small">Demain, expose-toi à la lumière du jour (dehors, 10-30 min) peu après ${fmtTime(Math.max(rise.getTime(), Date.now()))} pour bien caler ton horloge.${dl < 600 ? ' Les jours sont courts : la lumière matinale est d\'autant plus importante.' : ''}</p>
    `;
  } catch {
    const env = $('#env');
    if (env) env.innerHTML = '<h2>🌡️ Conditions de ce soir</h2><p class="muted small">Données météo indisponibles (hors ligne ?). Réessaie plus tard.</p>';
    const sun = $('#sun');
    if (sun) sun.innerHTML = '<h2>☀️ Lumière & horloge biologique</h2><p class="small">Expose-toi à la lumière du jour le matin et tamise l\'éclairage 2 h avant le coucher.</p>';
  }
}

async function loadStudies() {
  const box = $('#studies');
  if (!box) return;
  box.innerHTML = '<p class="muted small">Chargement des publications…</p>';
  try {
    const items = await sci.fetchStudies(studyTopic);
    if (!$('#studies')) return;
    box.innerHTML = items.length ? items.slice(0, 8).map(it => `
      <div class="study">
        <a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
        <div class="src">${esc(it.journal)}${it.date ? ' · ' + new Date(it.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}${it.oa ? ' · <span style="color:var(--good)">accès libre</span>' : ''}</div>
      </div>`).join('') : '<p class="muted small">Aucune publication récente trouvée.</p>';
  } catch {
    box.innerHTML = '<p class="muted small">Impossible de charger les publications (connexion ?).</p>';
  }
}

// =====================================================================
// RÉGLAGES
// =====================================================================
function openSettings() {
  const s = store.settings;
  openSheet(`
    <h2>⚙️ Réglages</h2>
    <label class="field"><span>Objectif de sommeil : <b id="goal-v">${fmtDur(s.goalMin)}</b></span>
      <input type="range" id="goal" min="300" max="600" step="15" value="${s.goalMin}"></label>
    <label class="field"><span>Âge (pour les recommandations)</span><input type="number" id="age" min="1" max="110" value="${s.age}" inputmode="numeric"></label>

    <div class="section-title">Capteurs pendant la nuit</div>
    <div class="list-item"><div style="flex:1"><b>Accéléromètre</b><div class="muted small">Détecte tes mouvements (iPhone posé sur le matelas)</div></div><label class="switch"><input type="checkbox" id="use-motion" ${s.useMotion ? 'checked' : ''}><span></span></label></div>
    <div class="list-item"><div style="flex:1"><b>Micro</b><div class="muted small">Mesure uniquement le niveau sonore, rien n'est enregistré</div></div><label class="switch"><input type="checkbox" id="use-mic" ${s.useMic ? 'checked' : ''}><span></span></label></div>

    <div class="section-title">Localisation (météo, soleil)</div>
    <p class="small muted">Actuellement : <b>${esc(s.city ? s.city.name : 'position GPS (ou Paris par défaut)')}</b></p>
    <div class="row"><input type="text" id="city-q" placeholder="Rechercher une ville"><button class="btn" id="city-go" style="padding:12px 14px">🔍</button></div>
    <div id="city-res"></div>
    ${s.city ? '<button class="btn ghost block" id="city-gps" style="margin-top:8px">📍 Utiliser ma position GPS</button>' : ''}

    <div class="section-title">Mes données</div>
    <p class="muted small">Tes nuits restent sur ton iPhone (stockage local). Exporte-les régulièrement pour les sauvegarder.</p>
    <div class="grid2">
      <button class="btn ghost" id="exp">⬇️ Exporter</button>
      <label class="btn ghost" style="text-align:center">⬆️ Importer<input type="file" id="imp" accept="application/json,.json" hidden></label>
    </div>
    <div class="spacer"></div>
    <button class="btn ghost block" id="demo">🧪 Générer 14 nuits de démonstration</button>
    <div class="spacer"></div>
    <button class="btn danger block" id="reset">Tout effacer</button>

    <div class="section-title">À propos</div>
    <p class="muted small">Somnia v1.2 · Application web installable (PWA). Éveil/sommeil : actigraphie Cole-Kripke + règles de Webster (validées face à la polysomnographie). Phases : modèle de Markov caché combinant mouvements, respiration (micro + vibrations du matelas), pression de sommeil (Borbély) et rythme circadien. Les phases restent une estimation (aucune app sans capteur cérébral ne les mesure directement). Pas un avis médical.</p>
    <button class="btn primary block" id="s-close">Terminé</button>
  `, root => {
    const goal = $('#goal', root);
    goal.addEventListener('input', () => { $('#goal-v', root).textContent = fmtDur(+goal.value); });
    goal.addEventListener('change', () => store.setSettings({ goalMin: +goal.value }));
    $('#age', root).addEventListener('change', e => store.setSettings({ age: Math.max(1, Math.min(110, +e.target.value || 30)) }));
    $('#use-motion', root).addEventListener('change', e => store.setSettings({ useMotion: e.target.checked }));
    $('#use-mic', root).addEventListener('change', e => store.setSettings({ useMic: e.target.checked }));

    const search = async () => {
      const q = $('#city-q', root).value.trim();
      if (!q) return;
      const res = $('#city-res', root);
      res.innerHTML = '<p class="muted small">Recherche…</p>';
      try {
        const list = await sci.searchCity(q);
        res.innerHTML = list.length ? list.map((c, i) => `<div class="list-item" data-i="${i}" style="cursor:pointer">📍 ${esc(c.name)}</div>`).join('') : '<p class="muted small">Aucun résultat</p>';
        $$('[data-i]', res).forEach(el => el.addEventListener('click', () => {
          store.setSettings({ city: list[+el.dataset.i] });
          sci.clearLocationCache();
          toast('Ville enregistrée'); closeSheet(); go(tab);
        }));
      } catch { res.innerHTML = '<p class="muted small">Recherche impossible (hors ligne ?)</p>'; }
    };
    $('#city-go', root).addEventListener('click', search);
    $('#city-q', root).addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
    $('#city-gps', root)?.addEventListener('click', () => { store.setSettings({ city: null }); sci.clearLocationCache(); closeSheet(); go(tab); });

    $('#exp', root).addEventListener('click', () => {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `somnia-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('#imp', root).addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const n = store.importJSON(await f.text()); toast(`${n} nuits importées`); closeSheet(); go(tab); }
      catch { toast('Fichier invalide'); }
    });
    $('#demo', root).addEventListener('click', () => { addDemo(); toast('14 nuits ajoutées'); closeSheet(); go(tab); });
    $('#reset', root).addEventListener('click', () => {
      if (confirm('Effacer toutes les nuits et réglages ? Cette action est irréversible.')) { store.resetAll(); closeSheet(); go('nuit'); toast('Données effacées'); }
    });
    $('#s-close', root).addEventListener('click', () => { closeSheet(); go(tab); });
  });
}

function addDemo() {
  const tags = TAGS;
  for (let i = 14; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    d.setHours(22 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);
    const start = d.getTime();
    const dur = (6 + Math.random() * 2.5) * 3600e3;
    const n = buildNight({ id: uid(), start, end: start + dur, source: 'manuel', seed: 'demo' + i + Math.random() }, store.settings.goalMin);
    n.mood = 2 + Math.floor(Math.random() * 4);
    n.tags = tags.filter(() => Math.random() < 0.2);
    n.demo = true;
    store.addNight(n);
  }
}

// =====================================================================
// Démarrage
// =====================================================================
// Service worker + mise à jour automatique : quand une nouvelle version est publiée,
// on propose de recharger (jamais pendant une nuit en cours).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller && !tracker.active) {
          const t = $('#toast');
          t.innerHTML = '✨ Nouvelle version disponible <button class="btn" style="padding:6px 10px;margin-left:8px;font-size:13px;background:#6a5cff;color:#fff" id="upd">Mettre à jour</button>';
          t.hidden = false;
          $('#upd').addEventListener('click', () => location.reload());
        }
      });
    });
    setInterval(() => reg.update().catch(() => {}), 3600e3);
  }).catch(() => {});
}
maybeShowInstall();

// Demande à iOS de ne jamais effacer les données de l'app
navigator.storage?.persist?.().catch(() => {});

go('nuit');

// Reprise d'une nuit en cours si l'app a été rechargée
if (tracker.resume()) {
  showNightMode();
  toast('Suivi de la nuit repris', 3000);
}
