// Dépôt de données de l'application : cache mémoire + persistance + événements.
// L'interface ne parle qu'à ce module ; le moteur de calcul (js/core) ne connaît
// ni le stockage ni l'interface.

import { normalizeEpisode, validateEpisode, uid, SCHEMA_VERSION } from '../core/model.js';
import { deviceTimeZone } from '../core/time.js';

export const DEFAULT_SETTINGS = {
  goalMin: 480,            // objectif de temps de sommeil (min), modifiable
  ageGroup: '26-64',       // tranche d'âge (pour les recommandations) — l'âge exact n'est pas demandé
  theme: 'night',          // 'night' | 'dawn' | 'system'
  bedtimeReminder: { enabled: false, minutesBefore: 30 },
  push: { enabled: false },
  freeDays: [0, 6],        // jours libres par défaut (dimanche, samedi)
  reducedMotion: 'system', // 'system' | 'on' | 'off'
  onboarded: false,
};

export const DEFAULT_ALARM = () => ({
  id: uid(), label: 'Réveil', time: '07:00', days: [1, 2, 3, 4, 5], enabled: true,
  sound: 'aube', volume: 0.8, fadeInSec: 60, snoozeMin: 9, vibrate: true, push: true,
  tz: deviceTimeZone(),
});

export function createRepo(adapter) {
  const listeners = new Set();
  const cache = { episodes: [], alarms: [], settings: { ...DEFAULT_SETTINGS }, session: null, alarmLog: [] };
  const emit = (what) => { for (const fn of listeners) { try { fn(what); } catch (e) { console.error(e); } } };

  const repo = {
    adapter,
    get persistent() { return adapter.kind !== 'memory'; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async init() {
      const [eps, alarms, settings, session, log] = await Promise.all([
        adapter.getAll('episodes'), adapter.getAll('alarms'), adapter.get('kv', 'settings'),
        adapter.get('kv', 'session'), adapter.getAll('alarmLog'),
      ]);
      cache.episodes = eps;
      cache.alarms = alarms;
      cache.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
      cache.session = session || null;
      cache.alarmLog = log.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 500);
      return repo;
    },

    // --- Épisodes ---------------------------------------------------------
    get episodes() { return cache.episodes; },
    episode(id) { return cache.episodes.find(e => e.id === id) || null; },
    get hasDemo() { return cache.episodes.some(e => e.source?.kind === 'demo'); },
    get hasRealData() { return cache.episodes.some(e => e.source?.kind !== 'demo'); },

    /** Enregistre un épisode ; refuse un épisode invalide (renvoie les erreurs). */
    async saveEpisode(raw) {
      const e = normalizeEpisode(raw);
      const v = validateEpisode(e);
      if (!v.valid) return { ok: false, errors: v.errors, warnings: v.warnings };
      const prev = cache.episodes.find(x => x.id === e.id);
      e.createdAt = prev?.createdAt || e.createdAt;
      e.updatedAt = new Date().toISOString();
      await adapter.put('episodes', e);
      cache.episodes = prev ? cache.episodes.map(x => (x.id === e.id ? e : x)) : [...cache.episodes, e];
      emit('episodes');
      return { ok: true, episode: e, warnings: v.warnings };
    },
    async deleteEpisode(id) {
      await adapter.delete('episodes', id);
      cache.episodes = cache.episodes.filter(e => e.id !== id);
      emit('episodes');
    },
    async removeDemo() {
      const demo = cache.episodes.filter(e => e.source?.kind === 'demo');
      for (const e of demo) await adapter.delete('episodes', e.id);
      cache.episodes = cache.episodes.filter(e => e.source?.kind !== 'demo');
      emit('episodes');
      return demo.length;
    },
    async bulkAddEpisodes(list) {
      await adapter.bulkPut('episodes', list);
      const ids = new Set(list.map(e => e.id));
      cache.episodes = [...cache.episodes.filter(e => !ids.has(e.id)), ...list];
      emit('episodes');
    },

    // --- Réglages -----------------------------------------------------------
    get settings() { return cache.settings; },
    async setSettings(patch) {
      cache.settings = { ...cache.settings, ...patch };
      await adapter.put('kv', cache.settings, 'settings');
      emit('settings');
    },

    // --- Alarmes ------------------------------------------------------------
    get alarms() { return [...cache.alarms].sort((a, b) => (a.time < b.time ? -1 : 1)); },
    async saveAlarm(a) {
      await adapter.put('alarms', a);
      cache.alarms = [...cache.alarms.filter(x => x.id !== a.id), a];
      emit('alarms');
    },
    async deleteAlarm(id) {
      await adapter.delete('alarms', id);
      cache.alarms = cache.alarms.filter(a => a.id !== id);
      emit('alarms');
    },
    get alarmLog() { return cache.alarmLog; },
    async logAlarm(entry) {
      const rec = { at: new Date().toISOString(), ...entry };
      await adapter.put('alarmLog', rec);
      cache.alarmLog = [rec, ...cache.alarmLog].slice(0, 500);
      emit('alarmLog');
    },

    // --- Session de sommeil en cours (survit à la fermeture de l'app) -------
    get session() { return cache.session; },
    async setSession(s) {
      cache.session = s;
      if (s) await adapter.put('kv', s, 'session'); else await adapter.delete('kv', 'session');
      emit('session');
    },

    // --- Export / suppression ----------------------------------------------
    exportData() {
      return {
        app: 'somnia', format: 'somnia-export', schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
        episodes: cache.episodes, alarms: cache.alarms, settings: cache.settings, alarmLog: cache.alarmLog,
      };
    },
    async wipeAll() {
      for (const s of ['episodes', 'alarms', 'alarmLog', 'kv']) await adapter.clear(s);
      cache.episodes = []; cache.alarms = []; cache.alarmLog = []; cache.session = null;
      cache.settings = { ...DEFAULT_SETTINGS };
      emit('all');
    },
  };
  return repo;
}
