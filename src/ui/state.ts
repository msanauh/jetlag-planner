import { DEFAULT_ALERTS, type AlertOptions } from '../core/alerts';
import { build, migrateTrip, type Built, type DoneMap, type DoneRec, type Trip } from './model';
import { loadAll, save } from './storage';

export interface Profile { home?: string; bed?: string; wake?: string; mb?: string; ml?: string; md?: string }
export type AlertPrefs = Pick<AlertOptions, 'cats' | 'maxPerDay' | 'leadMin'>;

export const S = {
  trips: [] as Trip[],
  profile: {} as Profile,
  current: null as string | null,
  done: {} as DoneMap,
  alerts: { cats: { ...DEFAULT_ALERTS.cats }, maxPerDay: DEFAULT_ALERTS.maxPerDay, leadMin: DEFAULT_ALERTS.leadMin } as AlertPrefs,
};

export async function loadState(): Promise<void> {
  const st = await loadAll({ trips: [] as unknown[], profile: {} as Profile, current: null as string | null, done: {} as DoneMap, alerts: S.alerts });
  S.trips = (st.trips as { id: string; raw: unknown }[]).map(migrateTrip);
  S.profile = st.profile; S.current = st.current; S.done = st.done; S.alerts = { ...S.alerts, ...st.alerts };
}
export const persist = {
  trips: () => save('trips', S.trips),
  profile: () => save('profile', S.profile),
  current: () => save('current', S.current),
  done: () => save('done', S.done),
  alerts: () => save('alerts', S.alerts),
};

/** Se llama tras cambiar el registro (el plan cambia: hay que reenviar los avisos). */
export const hooks = { afterDone: (_tripId: string) => {} };
export function setDone(tripId: string, eventId: string, rec: DoneRec | null): void {
  const m = (S.done[tripId] ??= {});
  if (rec) m[eventId] = rec; else delete m[eventId];
  persist.done();
  hooks.afterDone(tripId);
}

export interface TripCtx { trip: Trip; b: Built; tzmode: string; start: number; end: number }

/** Plan de un viaje, recalculado con lo que has marcado (hecho a qué hora / no hecho). */
export function tripCtx(trip: Trip): TripCtx | null {
  try {
    const b = build(trip.raw, { log: S.done[trip.id] });
    const daily = b.p.events.filter(e => e.j >= 0);
    const all = daily.length ? daily : b.p.events;
    return { trip, b, tzmode: trip.raw.tzmode || 'auto', start: Math.min(...all.map(e => e.start)), end: Math.max(...all.map(e => e.end)) };
  } catch { return null; }
}
const allCtx = () => S.trips.map(tripCtx).filter((c): c is TripCtx => !!c);

/** Viaje cuyo plan está en marcha ahora mismo (si hay varios, el que empezó antes). */
export function activeTrip(now = Date.now()): TripCtx | null {
  return allCtx().filter(c => c.start <= now && now < c.end).sort((a, b) => a.start - b.start)[0] ?? null;
}
/** Próximo viaje cuyo plan aún no ha empezado. */
export function nextTrip(now = Date.now()): TripCtx | null {
  return allCtx().filter(c => c.start > now).sort((a, b) => a.start - b.start)[0] ?? null;
}

/** Viaje que se ve en Calendario y Lista: el elegido en Viajes; si no, el activo, el siguiente o el último creado. */
export function curTrip(): TripCtx | null {
  const chosen = S.trips.find(t => t.id === S.current);
  const c = (chosen && tripCtx(chosen)) || activeTrip() || nextTrip() || (S.trips[0] ? tripCtx(S.trips[0]) : null);
  return c;
}

export function go(name: string): void {
  if (location.hash === '#' + name) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = name;
}
export const app = () => document.getElementById('app')!;
