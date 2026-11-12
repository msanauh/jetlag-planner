import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { describe, expect, it } from 'vitest';

describe('web-push', () => {
  it('construye una petición cifrada y firmada (VAPID) para una suscripción de Apple', () => {
    const vapid = webpush.generateVAPIDKeys();
    const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
    const sub = { endpoint: 'https://web.push.apple.com/QFake', keys: { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') } };
    const req = webpush.generateRequestDetails(sub, JSON.stringify({ id: 'x', title: 'En 30 minutos, vete a dormir', body: '' }), {
      TTL: 1800, urgency: 'high', vapidDetails: { subject: 'mailto:prueba@example.com', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    });
    expect(req.method).toBe('POST');
    expect(req.endpoint).toBe(sub.endpoint);
    expect(req.headers.TTL).toBe(1800);
    expect(String(req.headers.Authorization)).toMatch(/^vapid t=.+, k=/);
    expect(req.headers['Content-Encoding']).toBe('aes128gcm');
  });
});
