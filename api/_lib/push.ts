import webpush from 'web-push';
import { PushError, type Sender } from './logic.js';

let ready = false;
export function webPushSender(): Sender {
  if (!ready) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error('Faltan las claves VAPID (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).');
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    ready = true;
  }
  return async (sub, payload) => {
    try {
      // TTL corto: un "en 30 minutos" que llega una hora tarde no sirve.
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 1800, urgency: 'high' });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      throw status ? new PushError(status) : e;
    }
  };
}

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
