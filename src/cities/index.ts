/* Ciudades: 110 con nombre en español (siempre disponibles) + ~32 000 de GeoNames
   cargadas en segundo plano desde data/cities.json. */
import { CITY_RAW } from './curated';

export interface City { n: string; c: string; tz: string; lat: number; lon: number; label: string; region?: string; ascii?: string; curated?: boolean }

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const CURATED: City[] = CITY_RAW.split('\n').map(l => {
  const a = l.split('|');
  return { n: a[0], c: a[1], tz: a[2], lat: +a[3], lon: +a[4], label: `${a[0]} (${a[1]})`, curated: true };
});

let all: City[] = CURATED;
interface Indexed { city: City; keys: string[] }
let index: Indexed[] = build(all);
function build(list: City[]): Indexed[] {
  return list.map(city => ({ city, keys: [norm(city.label), norm(city.n), ...(city.ascii ? [norm(city.ascii)] : [])] }));
}

export function cities(): City[] { return all; }

interface Packed { countries: Record<string, string>; tzs: string[]; regions: string[]; rows: [string, string | 0, string, number, number, number, number][] }

/** Añade las ciudades de GeoNames, quitando las que ya están en la lista curada. */
export function addGeoNames(data: Packed): void {
  const near = (c: City, lat: number, lon: number, tz: string) => c.tz === tz && Math.abs(c.lat - lat) < 0.3 && Math.abs(c.lon - lon) < 0.3;
  const extra: City[] = [];
  for (const [n, ascii, cc, r, t, lat, lon] of data.rows) {
    const tz = data.tzs[t];
    if (CURATED.some(c => near(c, lat, lon, tz) && (norm(c.n) === norm(n) || (ascii && norm(c.n) === norm(ascii))))) continue;
    const country = data.countries[cc] ?? cc;
    extra.push({ n, c: country, tz, lat, lon, label: `${n} (${country})`, region: data.regions[r] || undefined, ascii: ascii || undefined });
  }
  // Mismo nombre y país: se distingue por región ("Springfield, Illinois (Estados Unidos)").
  const seen = new Map<string, number>();
  for (const c of [...CURATED, ...extra]) seen.set(norm(c.label), (seen.get(norm(c.label)) ?? 0) + 1);
  for (const c of extra) if ((seen.get(norm(c.label)) ?? 0) > 1 && c.region) c.label = `${c.n}, ${c.region} (${c.c})`;
  all = [...CURATED, ...extra];
  index = build(all);
}

let loading: Promise<void> | null = null;
export function loadCities(url = 'data/cities.json'): Promise<void> {
  return (loading ??= fetch(url).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then(addGeoNames).catch(() => { loading = null; }));
}

/** Búsqueda por texto: primero coincidencias exactas, luego por prefijo y luego por
    palabra; dentro de cada grupo, las curadas y después por población. */
export function searchCities(q: string, limit = 8): City[] {
  const nq = norm(q);
  if (!nq) return [];
  const score = (x: Indexed): number => {
    let best = Infinity;
    for (const k of x.keys) {
      if (k === nq) best = Math.min(best, 0);
      else if (k.startsWith(nq)) best = Math.min(best, 1);
      else if (k.includes(' ' + nq) || k.includes('(' + nq)) best = Math.min(best, 2);
    }
    return best;
  };
  const hits: { c: City; s: number; i: number }[] = [];
  index.forEach((x, i) => { const s = score(x); if (s < Infinity) hits.push({ c: x.city, s, i }); });
  hits.sort((a, b) => a.s - b.s || a.i - b.i);
  return hits.slice(0, limit).map(h => h.c);
}

export function findCity(q: string | undefined | null): City | null {
  if (!q) return null;
  const nq = norm(q);
  const exact = index.find(x => x.keys[0] === nq) ?? index.find(x => x.keys.slice(1).includes(nq));
  if (exact) return exact.city;
  return index.find(x => x.keys.some(k => k.startsWith(nq)))?.city ?? null;
}
