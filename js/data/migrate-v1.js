// Reprise des nuits enregistrées par Somnia v1 (localStorage « somnia.v1 »).
// La v1 estimait des phases de sommeil sans source de données adaptée : ces
// estimations ne sont PAS reprises. Seuls les horaires et les déclarations
// de l'utilisateur sont conservés, avec la provenance « legacy-v1 ».

import { newEpisode } from '../core/model.js';

const V1_KEY = 'somnia.v1';
const MIGRATED_FLAG = 'somnia.v1.migrated';

/** Convertit une nuit v1 en épisode v2 (fonction pure, testée). */
export function convertV1Night(n, tz) {
  if (!n || !Number.isFinite(n.start) || !Number.isFinite(n.end) || n.end <= n.start) return null;
  const e = newEpisode({
    id: 'v1-' + String(n.id || n.start),
    tz,
    type: 'night',
    bedtime: new Date(n.start).toISOString(),
    // En v1, « fin » = arrêt du suivi au réveil : utilisée comme réveil final et lever.
    // Latence et éveils nocturnes restent inconnus (les estimations v1 ne sont pas reprises).
    outOfBed: new Date(n.end).toISOString(),
    finalWake: new Date(n.end).toISOString(),
    quality: Number.isInteger(n.mood) && n.mood >= 1 && n.mood <= 5 ? n.mood : null,
    tags: Array.isArray(n.tags) ? n.tags.filter(t => typeof t === 'string').slice(0, 20) : [],
    notes: typeof n.note === 'string' ? n.note : '',
    source: { kind: 'legacy-v1', note: 'Importé de Somnia v1 : horaires conservés, phases estimées non reprises.' },
  });
  return e;
}

/** Lit le stockage v1 du navigateur une seule fois et renvoie les épisodes à importer. */
export function readV1FromLocalStorage(tz) {
  try {
    if (typeof localStorage === 'undefined' || localStorage.getItem(MIGRATED_FLAG)) return { episodes: [], goalMin: null };
    const raw = JSON.parse(localStorage.getItem(V1_KEY) || 'null');
    if (!raw || !Array.isArray(raw.nights)) return { episodes: [], goalMin: null };
    const episodes = raw.nights.map(n => convertV1Night(n, tz)).filter(Boolean);
    const goalMin = Number.isFinite(raw.settings?.goalMin) ? raw.settings.goalMin : null;
    return { episodes, goalMin };
  } catch {
    return { episodes: [], goalMin: null };
  }
}

export function markV1Migrated() {
  try { localStorage.setItem(MIGRATED_FLAG, new Date().toISOString()); } catch { /* stockage indisponible */ }
}
