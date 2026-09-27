// Stockage local (reste sur l'iPhone, rien n'est envoyé à un serveur).
const KEY = 'somnia.v1';
const LIVE_KEY = 'somnia.live';

const DEFAULT_SETTINGS = {
  goalMin: 480,          // objectif de sommeil (minutes)
  alarm: '07:00',        // heure du réveil
  alarmOn: true,
  smartWindow: 30,       // fenêtre du réveil intelligent (minutes)
  age: 30,
  useMic: true,
  useMotion: true,
  alarmSound: 'aube',
  city: null,            // { name, lat, lon } si la géolocalisation est refusée
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      nights: Array.isArray(raw.nights) ? raw.nights : [],
      settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
    };
  } catch {
    return { nights: [], settings: { ...DEFAULT_SETTINGS } };
  }
}

const state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Sauvegarde impossible', e);
  }
}

export const store = {
  get settings() { return state.settings; },
  get nights() { return [...state.nights].sort((a, b) => b.start - a.start); },

  setSettings(patch) {
    Object.assign(state.settings, patch);
    save();
  },
  addNight(n) {
    state.nights.push(n);
    save();
  },
  updateNight(id, patch) {
    const n = state.nights.find(x => x.id === id);
    if (n) { Object.assign(n, patch); save(); }
  },
  deleteNight(id) {
    state.nights = state.nights.filter(x => x.id !== id);
    save();
  },
  getNight(id) { return state.nights.find(x => x.id === id); },

  exportJSON() { return JSON.stringify(state, null, 2); },
  importJSON(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data.nights)) throw new Error('Fichier invalide');
    const ids = new Set(state.nights.map(n => n.id));
    for (const n of data.nights) if (!ids.has(n.id)) state.nights.push(n);
    if (data.settings) Object.assign(state.settings, data.settings);
    save();
    return data.nights.length;
  },
  resetAll() {
    state.nights = [];
    state.settings = { ...DEFAULT_SETTINGS };
    save();
    localStorage.removeItem(LIVE_KEY);
  },

  // Session en cours (pour survivre à un rechargement de la page)
  saveLive(live) { try { localStorage.setItem(LIVE_KEY, JSON.stringify(live)); } catch {} },
  loadLive() { try { return JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); } catch { return null; } },
  clearLive() { localStorage.removeItem(LIVE_KEY); },
};

// ---------- Utilitaires de format ----------
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const pad = n => String(n).padStart(2, '0');

export function fmtDur(min) {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${pad(m)}` : `${h} h`) : `${m} min`;
}

export function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(ts, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(ts).toLocaleDateString('fr-FR', opts);
}

export function fmtShortDate(ts) {
  return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "Nuit du" : une nuit commencée après minuit appartient à la veille
export function nightKey(ts) {
  const d = new Date(ts - 12 * 3600e3);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
