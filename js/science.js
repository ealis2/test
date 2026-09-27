// Données scientifiques et environnementales en temps réel.
// - Open-Meteo (météo, lever/coucher du soleil, qualité de l'air) : gratuit, sans clé.
// - Europe PMC (publications scientifiques récentes, base PubMed incluse) via api/science.php
//   (proxy PHP avec cache sur Hostinger), avec repli en appel direct.
import { store } from './store.js';

const PARIS = { name: 'Paris', lat: 48.8566, lon: 2.3522 };

export function getLocation() {
  const cached = sessionStorage.getItem('somnia.loc');
  if (cached) return Promise.resolve(JSON.parse(cached));
  const manual = store.settings.city;
  return new Promise(resolve => {
    const done = loc => { sessionStorage.setItem('somnia.loc', JSON.stringify(loc)); resolve(loc); };
    if (manual) return done(manual);
    if (!navigator.geolocation) return resolve(PARIS);
    navigator.geolocation.getCurrentPosition(
      p => done({ name: 'Ma position', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }),
      () => resolve(PARIS),
      { timeout: 8000, maximumAge: 3600e3 },
    );
  });
}
export function clearLocationCache() { sessionStorage.removeItem('somnia.loc'); }

async function getJSON(url, timeout = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function fetchWeather({ lat, lon }) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,is_day'
    + '&daily=sunrise,sunset,daylight_duration,temperature_2m_min,uv_index_max'
    + '&hourly=temperature_2m&forecast_days=2&timezone=auto';
  return getJSON(u);
}

export async function fetchAir({ lat, lon }) {
  const u = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}`
    + '&current=european_aqi,pm2_5,pm10&timezone=auto';
  return getJSON(u);
}

export async function searchCity(q) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`;
  const r = await getJSON(u);
  return (r.results || []).map(c => ({ name: `${c.name}${c.admin1 ? ', ' + c.admin1 : ''} (${c.country_code})`, lat: c.latitude, lon: c.longitude }));
}

// Phase de la lune (calcul astronomique simplifié)
export function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((date - ref) / 86400e3) % synodic + synodic) % synodic;
  const illum = (1 - Math.cos((2 * Math.PI * age) / synodic)) / 2;
  const names = [
    [1.84, '🌑', 'Nouvelle lune'], [5.53, '🌒', 'Premier croissant'], [9.22, '🌓', 'Premier quartier'],
    [12.91, '🌔', 'Gibbeuse croissante'], [16.61, '🌕', 'Pleine lune'], [20.3, '🌖', 'Gibbeuse décroissante'],
    [23.99, '🌗', 'Dernier quartier'], [27.68, '🌘', 'Dernier croissant'], [99, '🌑', 'Nouvelle lune'],
  ];
  const [, ico, name] = names.find(n => age < n[0]);
  return { age, illum, ico, name };
}

export const WEATHER_CODES = {
  0: 'Ciel dégagé', 1: 'Peu nuageux', 2: 'Partiellement nuageux', 3: 'Couvert', 45: 'Brouillard', 48: 'Brouillard givrant',
  51: 'Bruine', 53: 'Bruine', 55: 'Bruine forte', 61: 'Pluie faible', 63: 'Pluie', 65: 'Forte pluie',
  71: 'Neige faible', 73: 'Neige', 75: 'Forte neige', 80: 'Averses', 81: 'Averses', 82: 'Fortes averses',
  95: 'Orage', 96: 'Orage + grêle', 99: 'Orage + grêle',
};

export function aqiLabel(v) {
  if (v == null) return { txt: '—', cls: '' };
  if (v <= 20) return { txt: 'Très bonne', cls: 'good' };
  if (v <= 40) return { txt: 'Bonne', cls: 'good' };
  if (v <= 60) return { txt: 'Moyenne', cls: 'warn' };
  if (v <= 80) return { txt: 'Médiocre', cls: 'bad' };
  return { txt: 'Mauvaise', cls: 'bad' };
}

// ---------- Publications scientifiques récentes ----------
export const TOPICS = [
  { id: 'general', name: 'Sommeil & santé' },
  { id: 'insomnia', name: 'Insomnie' },
  { id: 'circadian', name: 'Rythme circadien' },
  { id: 'apnea', name: 'Apnée du sommeil' },
  { id: 'rem', name: 'Rêves & REM' },
  { id: 'screens', name: 'Écrans & lumière' },
];

// Doit rester identique à api/science.php
const QUERIES = {
  general: 'TITLE:"sleep" AND (TITLE:"health" OR TITLE:"quality" OR TITLE:"duration")',
  insomnia: 'TITLE:"insomnia"',
  circadian: '(TITLE:"circadian" OR TITLE:"chronotype" OR TITLE:"melatonin")',
  apnea: 'TITLE:"sleep apnea"',
  rem: '(TITLE:"REM sleep" OR TITLE:"dreaming" OR TITLE:"dreams")',
  screens: 'TITLE:"sleep" AND (TITLE:"screen" OR TITLE:"blue light" OR TITLE:"smartphone")',
};

function normalize(list) {
  return list.map(r => ({
    title: (r.title || '').replace(/<[^>]+>/g, '').replace(/\.$/, ''),
    journal: r.journalTitle || r.journal || r.bookOrReportDetails?.publisher || '',
    date: r.firstPublicationDate || r.date || '',
    authors: r.authorString || r.authors || '',
    url: r.doi ? `https://doi.org/${r.doi}` : (r.url || `https://europepmc.org/article/${r.source}/${r.id}`),
    oa: r.isOpenAccess === 'Y' || r.oa === true,
  }));
}

export async function fetchStudies(topic = 'general') {
  const key = 'somnia.studies.' + topic;
  try {
    const c = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (c && Date.now() - c.t < 3 * 3600e3) return c.items;
  } catch {}
  let items;
  try {
    // 1) Proxy PHP sur l'hébergement Hostinger (mise en cache côté serveur)
    const r = await getJSON(`api/science.php?topic=${encodeURIComponent(topic)}`, 12000);
    items = normalize(r.items || []);
  } catch {
    // 2) Repli : appel direct à Europe PMC (CORS autorisé)
    const since = new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const q = `${QUERIES[topic] || QUERIES.general} AND SRC:MED AND HAS_ABSTRACT:y AND FIRST_PDATE:[${since} TO ${today}]`;
    const u = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=12&sort=${encodeURIComponent('P_PDATE_D desc')}&resultType=lite`;
    const r = await getJSON(u, 12000);
    items = normalize(r.resultList?.result || []);
  }
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), items })); } catch {}
  return items;
}

// ---------- Connaissances validées (références) ----------
// Durées recommandées : National Sleep Foundation (Hirshkowitz et al., Sleep Health 2015)
export const RECO = [
  { min: 0, max: 0.25, label: 'Nouveau-né (0-3 mois)', range: '14 – 17 h' },
  { min: 0.25, max: 1, label: 'Nourrisson (4-11 mois)', range: '12 – 15 h' },
  { min: 1, max: 3, label: 'Tout-petit (1-2 ans)', range: '11 – 14 h' },
  { min: 3, max: 6, label: 'Préscolaire (3-5 ans)', range: '10 – 13 h' },
  { min: 6, max: 14, label: 'Enfant (6-13 ans)', range: '9 – 11 h' },
  { min: 14, max: 18, label: 'Adolescent (14-17 ans)', range: '8 – 10 h' },
  { min: 18, max: 26, label: 'Jeune adulte (18-25 ans)', range: '7 – 9 h' },
  { min: 26, max: 65, label: 'Adulte (26-64 ans)', range: '7 – 9 h' },
  { min: 65, max: 200, label: 'Senior (65 ans et +)', range: '7 – 8 h' },
];

export const FACTS = [
  { t: 'Un cycle de sommeil dure environ 90 minutes et enchaîne sommeil léger, profond puis paradoxal. Une nuit en compte 4 à 6.', ref: 'Carskadon & Dement, Principles and Practice of Sleep Medicine' },
  { t: 'Le sommeil profond domine en début de nuit, le sommeil paradoxal (rêves) en fin de nuit : se coucher trop tard ampute surtout le paradoxal quand le réveil est fixe.', ref: 'Dijk & Czeisler, J Neurosci 1995' },
  { t: 'La température idéale de la chambre se situe autour de 16 à 19 °C. La baisse de la température corporelle facilite l\'endormissement.', ref: 'Okamoto-Mizuno & Mizuno, J Physiol Anthropol 2012' },
  { t: 'La lumière du matin (idéalement dehors, dans l\'heure qui suit le réveil) recale l\'horloge biologique et avance l\'heure d\'endormissement.', ref: 'Khalsa et al., J Physiol 2003' },
  { t: 'La caféine a une demi-vie de 5 à 6 h : un café à 16 h agit encore au coucher. 400 mg pris 6 h avant le coucher réduisent le sommeil d\'environ 1 h.', ref: 'Drake et al., J Clin Sleep Med 2013' },
  { t: 'L\'alcool fait s\'endormir plus vite mais fragmente la seconde moitié de nuit et réduit le sommeil paradoxal.', ref: 'Ebrahim et al., Alcohol Clin Exp Res 2013' },
  { t: 'La régularité des horaires compte autant que la durée : des horaires irréguliers sont associés à un risque accru de maladies cardio-métaboliques.', ref: 'Windred et al., Sleep 2024' },
  { t: 'L\'activité physique régulière améliore la qualité du sommeil ; l\'éviter seulement dans l\'heure précédant le coucher si elle est intense.', ref: 'Stutz et al., Sports Med 2019' },
  { t: 'La lumière des écrans le soir retarde la sécrétion de mélatonine et l\'endormissement.', ref: 'Chang et al., PNAS 2015' },
  { t: 'La thérapie cognitivo-comportementale de l\'insomnie (TCC-I) est le traitement de première intention recommandé, avant les somnifères.', ref: 'Riemann et al., J Sleep Res 2023 (European Insomnia Guideline)' },
];
