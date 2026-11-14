/* Lógica del servidor de avisos, independiente del almacenamiento y del envío
   (así se prueba sin Redis ni red). Solo se guarda lo mínimo: la suscripción push,
   el instante de cada aviso y su texto. */
import { createHash } from 'node:crypto';

export interface PushSub { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } }
export interface AlertIn { id: string; at: number; title: string; body: string }
/** Un aviso pendiente tal como se guarda. */
export interface Due { s: string; t: string; i: string; at: number; ti: string; b: string }

export interface Store {
  getSub(id: string): Promise<PushSub | null>;
  setSub(id: string, sub: PushSub): Promise<void>;
  /** Sustituye los avisos de (suscripción, viaje). */
  replaceAlerts(subId: string, trip: string, alerts: Due[]): Promise<void>;
  /** Avisos con instante ≤ `until`, como mucho `limit`. */
  due(until: number, limit: number): Promise<Due[]>;
  remove(items: Due[]): Promise<void>;
  /** Borra la suscripción y todos sus avisos. */
  forget(subId: string): Promise<void>;
  /** Avisos pendientes de una suscripción: cuántos y el próximo instante. */
  pending(subId: string): Promise<{ count: number; next: number | null }>;
  /** Total de avisos pendientes (todas las suscripciones). */
  total(): Promise<number>;
  /** Pequeño registro de estado (última pasada, último rechazo). Sin datos personales. */
  setMeta(key: string, value: unknown): Promise<void>;
  getMeta(key: string): Promise<unknown>;
}

export type Sender = (sub: PushSub, payload: { id: string; title: string; body: string }) => Promise<void>;
/** Error de envío con el código HTTP del servicio push (404/410 = suscripción caducada). */
export class PushError extends Error { constructor(public status: number) { super(`push ${status}`); } }

export const subIdOf = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

const MAX_ALERTS = 600, MAX_TEXT = 200, DAY = 86_400_000;
/** Un aviso que llega con más de este retraso ya no tiene sentido ("en 30 minutos…"). */
export const STALE_MS = 15 * 60_000;
/** Cada cuántos minutos pasa la planificación (QStash: cada 10). Se envía lo que toca en la
    mitad de ese intervalo, para que cada aviso llegue como mucho ±intervalo/2 de su hora. */
export const DEFAULT_EVERY_MIN = 10;
export const earlyMs = (everyMin = DEFAULT_EVERY_MIN) => Math.max(1, everyMin) * 60_000 / 2;

export function parseSub(x: unknown): PushSub {
  const s = x as PushSub;
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) throw new Error('Suscripción no válida.');
  if (!s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') throw new Error('Suscripción no válida.');
  return { endpoint: s.endpoint, expirationTime: s.expirationTime ?? null, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

export async function subscribe(store: Store, body: unknown, now = Date.now()): Promise<{ subId: string; stored: number }> {
  const b = body as { subscription?: unknown; trip?: unknown; alerts?: unknown };
  const sub = parseSub(b?.subscription);
  const trip = typeof b?.trip === 'string' && /^[\w-]{1,40}$/.test(b.trip) ? b.trip : null;
  if (!trip) throw new Error('Viaje no válido.');
  if (!Array.isArray(b.alerts) || b.alerts.length > MAX_ALERTS) throw new Error('Lista de avisos no válida.');
  const subId = subIdOf(sub.endpoint);
  const alerts: Due[] = [];
  for (const a of b.alerts as AlertIn[]) {
    if (!a || typeof a.id !== 'string' || typeof a.title !== 'string' || typeof a.body !== 'string' || !Number.isFinite(a.at)) throw new Error('Aviso no válido.');
    if (a.at < now - STALE_MS || a.at > now + 120 * DAY) continue;
    alerts.push({ s: subId, t: trip, i: a.id.slice(0, 80), at: Math.round(a.at), ti: a.title.slice(0, MAX_TEXT), b: a.body.slice(0, MAX_TEXT) });
  }
  await store.setSub(subId, sub);
  await store.replaceAlerts(subId, trip, alerts);
  return { subId, stored: alerts.length };
}

export async function unsubscribe(store: Store, body: unknown): Promise<void> {
  const endpoint = (body as { endpoint?: unknown })?.endpoint;
  if (typeof endpoint !== 'string') throw new Error('Falta la suscripción.');
  await store.forget(subIdOf(endpoint));
}

/** Envía los avisos que tocan. Devuelve un resumen para los registros. */
export async function tick(store: Store, send: Sender, now = Date.now(), everyMin = DEFAULT_EVERY_MIN): Promise<{ sent: number; stale: number; gone: number; failed: number }> {
  const list = await store.due(now + earlyMs(everyMin), 300);
  const r = { sent: 0, stale: 0, gone: 0, failed: 0 };
  const done: Due[] = [];
  const gone = new Set<string>();
  for (const d of list) {
    if (gone.has(d.s)) { done.push(d); continue; }
    if (d.at < now - STALE_MS) { r.stale++; done.push(d); continue; }
    const sub = await store.getSub(d.s);
    if (!sub) { r.gone++; done.push(d); continue; }
    try {
      await send(sub, { id: d.i, title: d.ti, body: d.b });
      r.sent++; done.push(d);
    } catch (e) {
      if (e instanceof PushError && (e.status === 404 || e.status === 410)) { gone.add(d.s); r.gone++; done.push(d); }
      else r.failed++; // se reintenta en la próxima pasada (hasta que caduque)
    }
  }
  await store.remove(done);
  for (const s of gone) await store.forget(s);
  return r;
}
