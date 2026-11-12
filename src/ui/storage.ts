/* Guardado en IndexedDB (almacén clave → valor). La app carga todo al arrancar y
   escribe en segundo plano. Migra una vez los datos del prototipo en localStorage. */

const DB = 'jetlag-planner', STORE = 'kv', VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const idbGet = <T>(key: string): Promise<T | undefined> => tx<T>('readonly', s => s.get(key) as IDBRequest<T>);
export const idbSet = (key: string, value: unknown): Promise<IDBValidKey> => tx('readwrite', s => s.put(value, key));

/** Lee todas las claves; si IndexedDB no está disponible devuelve los valores por defecto. */
export async function loadAll<T extends Record<string, unknown>>(defaults: T): Promise<T> {
  try {
    await migrateFromLocalStorage();
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof T & string)[]) {
      const v = await idbGet<T[typeof k]>(k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  } catch {
    return { ...defaults };
  }
}

/** Escribe en segundo plano; los fallos (modo privado, cuota) no rompen la app. */
export function save(key: string, value: unknown): void {
  idbSet(key, JSON.parse(JSON.stringify(value))).catch(() => {});
}

const LEGACY: Record<string, string> = { trips: 'jl2_trips', profile: 'jl2_profile', current: 'jl3_current' };
async function migrateFromLocalStorage(): Promise<void> {
  if (await idbGet('migrated')) return;
  for (const [key, old] of Object.entries(LEGACY)) {
    try {
      const raw = localStorage.getItem(old);
      if (raw != null && (await idbGet(key)) === undefined) await idbSet(key, JSON.parse(raw));
    } catch { /* sin localStorage o JSON roto: se ignora */ }
  }
  await idbSet('migrated', true);
}
