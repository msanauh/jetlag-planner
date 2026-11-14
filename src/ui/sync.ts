/* Avisos de cada viaje y su envío al servidor. */
import { alertsFor, type Alert } from '../core/alerts';
import { isDayAt } from './model';
import { syncAlerts } from './push';
import { S, tripCtx, type TripCtx } from './state';

export function tripAlerts(c: TripCtx, now = Date.now()): Alert[] {
  return alertsFor(c.b.p, { ...S.alerts, now, isDay: t => isDayAt(c.b, t) });
}
/** Avisos de todos los viajes que aún tienen algo por delante. */
export function allTripAlerts(now = Date.now()): { tripId: string; alerts: Alert[]; ctx: TripCtx }[] {
  return S.trips.map(tripCtx).filter((c): c is TripCtx => !!c && c.end > now)
    .map(ctx => ({ tripId: ctx.trip.id, alerts: tripAlerts(ctx, now), ctx }));
}
export async function syncTrip(tripId: string): Promise<void> {
  const trip = S.trips.find(t => t.id === tripId);
  const c = trip && tripCtx(trip);
  await syncAlerts(tripId, c ? tripAlerts(c) : []);
}
export async function syncAll(): Promise<void> {
  for (const it of allTripAlerts()) await syncAlerts(it.tripId, it.alerts).catch(() => {});
}
