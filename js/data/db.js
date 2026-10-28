// Stockage persistant local (IndexedDB) avec migrations versionnées.
// Les données ne quittent jamais l'appareil, sauf export explicite ou
// programmation d'une notification de réveil (heure seule, voir docs/PRIVACY.md).

const DB_NAME = 'somnia';

/**
 * Migrations : l'index i fait passer la base de la version i à i + 1.
 * Ne jamais modifier une migration publiée : en ajouter une nouvelle.
 */
const MIGRATIONS = [
  // v0 → v1 : schéma initial
  db => {
    const ep = db.createObjectStore('episodes', { keyPath: 'id' });
    ep.createIndex('bedtime', 'bedtime');
    db.createObjectStore('alarms', { keyPath: 'id' });
    db.createObjectStore('alarmLog', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('kv');
  },
];
export const DB_VERSION = MIGRATIONS.length;

const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function openIDB() {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB indisponible');
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = ev => {
    const db = open.result;
    for (let v = ev.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v](db, open.transaction);
  };
  const db = await req2p(open);
  db.onversionchange = () => db.close(); // une nouvelle version de l'app ouverte ailleurs
  return idbAdapter(db);
}

function idbAdapter(db) {
  const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);
  const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  return {
    kind: 'indexeddb',
    getAll: store => req2p(tx(store).getAll()),
    get: (store, key) => req2p(tx(store).get(key)),
    put: (store, value, key) => req2p(key === undefined ? tx(store, 'readwrite').put(value) : tx(store, 'readwrite').put(value, key)),
    delete: (store, key) => req2p(tx(store, 'readwrite').delete(key)),
    clear: store => req2p(tx(store, 'readwrite').clear()),
    /** Écriture groupée atomique (import). */
    async bulkPut(store, values) {
      const t = db.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      for (const v of values) os.put(v);
      await done(t);
    },
  };
}

/** Adaptateur mémoire : tests et navigateurs sans IndexedDB (navigation privée). Rien n'est conservé. */
export function memoryAdapter() {
  const stores = { episodes: new Map(), alarms: new Map(), alarmLog: new Map(), kv: new Map() };
  let seq = 1;
  const keyOf = (store, v, key) => key ?? v.id ?? (store === 'alarmLog' ? (v.id = seq++) : undefined);
  const copy = v => (v === undefined ? undefined : structuredClone(v));
  return {
    kind: 'memory',
    async getAll(s) { return [...stores[s].values()].map(copy); },
    async get(s, k) { return copy(stores[s].get(k)); },
    async put(s, v, k) { const key = keyOf(s, v, k); stores[s].set(key, copy(v)); return key; },
    async delete(s, k) { stores[s].delete(k); },
    async clear(s) { stores[s].clear(); },
    async bulkPut(s, vs) { for (const v of vs) stores[s].set(keyOf(s, v), copy(v)); },
  };
}

/** Demande au navigateur de ne pas effacer les données en cas de manque d'espace. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* non pris en charge */ }
  return false;
}
