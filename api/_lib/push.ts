import webpush from 'web-push';
import { PushError, type Sender } from './logic.js';

let ready = false;
export function webPushSender(): Sender {
  if (!ready) {
    // Tolerante con lo que se cuela al pegar: espacios, saltos de línea, comillas o "Private Key:".
    const clean = (v?: string) => (v ?? '').replace(/^\s*(public|private)\s*key\s*:\s*/i, '').trim().replace(/^["']|["']$/g, '').trim();
    const VAPID_PUBLIC_KEY = clean(process.env.VAPID_PUBLIC_KEY), VAPID_PRIVATE_KEY = clean(process.env.VAPID_PRIVATE_KEY);
    const VAPID_SUBJECT = clean(process.env.VAPID_SUBJECT).replace(/^mailto:\s+/i, 'mailto:');
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error('Faltan las claves VAPID (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).');
    if (Buffer.from(VAPID_PRIVATE_KEY, 'base64url').length !== 32) throw new Error('VAPID_PRIVATE_KEY no es válida: debe ser la "Private Key" (43 caracteres) que da `npx web-push generate-vapid-keys`.');
    if (Buffer.from(VAPID_PUBLIC_KEY, 'base64url').length !== 65) throw new Error('VAPID_PUBLIC_KEY no es válida: debe ser la "Public Key" (87 caracteres).');
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    ready = true;
  }
  return async (sub, payload) => {
    try {
      // TTL corto: un "en 30 minutos" que llega una hora tarde no sirve.
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 1800, urgency: 'high' });
    } catch (e) {
      const err = e as { statusCode?: number; body?: string };
      if (err.statusCode) { const pe = new PushError(err.statusCode); pe.message = `El servicio push respondió ${err.statusCode}${err.body ? ': ' + String(err.body).slice(0, 200) : ''}`; throw pe; }
      throw e;
    }
  };
}

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
