/* Avisos push (lado del navegador). En iPhone requiere iOS 16.4+ y la web instalada
   en la pantalla de inicio. El envío a la hora lo hace el servidor de api/ (Vercel):
   aquí solo se pide permiso, se suscribe y se le manda la lista mínima de avisos
   { instante, título, texto }. */
import type { Alert } from '../core/alerts';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
// En Vercel la API está en el mismo dominio (/api); VITE_PUSH_API solo hace falta si se aloja aparte.
const API = (import.meta.env.VITE_PUSH_API as string | undefined) || (VAPID ? '/api' : undefined);

export const pushConfigured = () => !!(VAPID && API);
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const permission = () => ('Notification' in window ? Notification.permission : 'denied');

export function registerSW(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Debe llamarse desde un toque del usuario (requisito de iOS). */
export async function enablePush(tripId: string, alerts: Alert[]): Promise<string> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'Primero instala la app: Compartir → Añadir a pantalla de inicio, y ábrela desde ahí.' : 'Este navegador no admite avisos push.';
  if (!pushConfigured()) return 'Falta el servidor de avisos. Está pendiente de elegir dónde alojarlo.';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Sin permiso no puedo enviarte avisos. Puedes activarlo en Ajustes → Notificaciones.';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) }));
  try { await syncAlerts(tripId, alerts, sub); }
  catch (e) { return `Permiso concedido, pero el servidor no pudo guardar los avisos: ${(e as Error).message}`; }
  return 'Avisos activados.';
}

/** Reenvía la lista de avisos (al cambiar el plan o las preferencias). Solo lo mínimo. */
export async function syncAlerts(tripId: string, alerts: Alert[], sub?: PushSubscription | null): Promise<void> {
  if (!pushConfigured() || !pushSupported() || permission() !== 'granted') return;
  sub ??= await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!sub) return;
  const r = await post('/subscribe', { subscription: sub.toJSON(), trip: tripId, alerts: alerts.map(a => ({ id: a.id, at: a.at, title: a.title, body: a.body })) });
  if (!r.ok) throw new Error(await r.json().then((j: { error?: string }) => j.error ?? '').catch(() => '') || `Error ${r.status}`);
}

async function currentSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.ready).pushManager.getSubscription();
}
const post = (path: string, body: unknown, method = 'POST') => fetch(API!.replace(/\/$/, '') + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Manda un aviso de prueba al momento. */
export async function sendTest(): Promise<string> {
  const sub = await currentSub();
  if (!sub || !pushConfigured()) return 'Primero activa los avisos.';
  const r = await post('/test', { subscription: sub.toJSON() });
  if (r.ok) return 'Aviso de prueba enviado. Debería llegarte en unos segundos.';
  const msg = await r.json().then((j: { error?: string }) => j.error).catch(() => '');
  return 'No se pudo enviar el aviso de prueba' + (msg ? `: ${msg}` : '.');
}

/** Desactiva los avisos en este dispositivo y borra los datos del servidor. */
export async function disablePush(): Promise<string> {
  const sub = await currentSub();
  if (!sub) return 'Los avisos ya estaban desactivados.';
  if (pushConfigured()) await post('/subscribe', { endpoint: sub.endpoint }, 'DELETE').catch(() => {});
  await sub.unsubscribe();
  return 'Avisos desactivados. He borrado tus datos del servidor.';
}

export async function isSubscribed(): Promise<boolean> { return !!(await currentSub().catch(() => null)); }
