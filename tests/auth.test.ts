import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizedTick } from '../api/_lib/auth';

const b64 = (x: string | Buffer) => Buffer.from(x).toString('base64url');
/** Firma como QStash: JWT HS256 con el hash del cuerpo. */
function qstashSignature(key: string, body: string, url = 'https://x.vercel.app/api/tick') {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ iss: 'Upstash', sub: url, exp: now + 300, nbf: now - 5, iat: now, jti: 'j1', body: createHash('sha256').update(body).digest('base64url') }));
  const sig = createHmac('sha256', key).update(`${head}.${payload}`).digest('base64url');
  return `${head}.${payload}.${sig}`;
}
const env = { CRON_SECRET: 'secreto', QSTASH_CURRENT_SIGNING_KEY: 'sig_actual', QSTASH_NEXT_SIGNING_KEY: 'sig_siguiente' };
const req = (headers: Record<string, string>) => new Request('https://x.vercel.app/api/tick', { method: 'POST', headers });

describe('quién puede llamar a /api/tick', () => {
  it('QStash con firma válida (clave actual o siguiente)', async () => {
    expect(await authorizedTick(req({ 'upstash-signature': qstashSignature('sig_actual', '') }), '', env)).toBe(true);
    expect(await authorizedTick(req({ 'upstash-signature': qstashSignature('sig_siguiente', '') }), '', env)).toBe(true);
  });
  it('rechaza firmas con otra clave o con el cuerpo cambiado', async () => {
    expect(await authorizedTick(req({ 'upstash-signature': qstashSignature('otra', '') }), '', env)).toBe(false);
    expect(await authorizedTick(req({ 'upstash-signature': qstashSignature('sig_actual', '') }), '{"x":1}', env)).toBe(false);
  });
  it('Bearer con el CRON_SECRET', async () => {
    expect(await authorizedTick(req({ authorization: 'Bearer secreto' }), '', env)).toBe(true);
    expect(await authorizedTick(req({ authorization: 'Bearer otro' }), '', env)).toBe(false);
  });
  it('sin nada, no', async () => {
    expect(await authorizedTick(req({}), '', env)).toBe(false);
    expect(await authorizedTick(req({ 'upstash-signature': 'x' }), '', {})).toBe(false);
  });
});
