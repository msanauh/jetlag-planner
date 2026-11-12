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

export function curTrip(): { trip: Trip; b: Built; tzmode: string } | null {
  const trip = S.trips.find(t => t.id === S.current);
  if (!trip) return null;
  // El plan se recalcula con lo que has marcado (hecho a qué hora / no hecho).
  try { return { trip, b: build(trip.raw, { log: S.done[trip.id] }), tzmode: trip.raw.tzmode || 'auto' }; } catch { return null; }
}

export function go(name: string): void {
  if (location.hash === '#' + name) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = name;
}
export const app = () => document.getElementById('app')!;
