/* Quién puede llamar a /api/tick:
   - QStash: cada llamada lleva la cabecera "Upstash-Signature", firmada con las claves de
     firma de tu cuenta. Se toman de QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY o,
     si no están, se le piden a QStash con QSTASH_TOKEN (GET /v2/keys).
   - O cualquiera que envíe "Authorization: Bearer $CRON_SECRET" (p. ej. Vercel Cron). */
import { Receiver } from '@upstash/qstash';

export interface AuthEnv {
  CRON_SECRET?: string; QSTASH_CURRENT_SIGNING_KEY?: string; QSTASH_NEXT_SIGNING_KEY?: string;
  QSTASH_TOKEN?: string; QSTASH_URL?: string;
}
type Keys = { current: string; next: string };
let cached: { keys: Keys; at: number } | null = null;

export async function signingKeys(env: AuthEnv, fetcher: typeof fetch = fetch): Promise<Keys | null> {
  const current = env.QSTASH_CURRENT_SIGNING_KEY?.trim(), next = env.QSTASH_NEXT_SIGNING_KEY?.trim();
  if (current && next) return { current, next };
  const token = env.QSTASH_TOKEN?.trim();
  if (!token) return null;
  if (cached && Date.now() - cached.at < 3_600_000) return cached.keys;
  const base = (env.QSTASH_URL?.trim() || 'https://qstash.upstash.io').replace(/\/$/, '');
  const r = await fetcher(`${base}/v2/keys`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const k = (await r.json()) as Partial<Keys>;
  if (!k.current || !k.next) return null;
  cached = { keys: { current: k.current, next: k.next }, at: Date.now() };
  return cached.keys;
}

export async function authorizedTick(req: Request, body: string, env: AuthEnv = process.env as AuthEnv, fetcher: typeof fetch = fetch): Promise<boolean> {
  const secret = env.CRON_SECRET?.trim();
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  const signature = req.headers.get('upstash-signature');
  if (!signature) return false;
  try {
    const keys = await signingKeys(env, fetcher);
    if (!keys) return false;
    // Sin comprobar la URL: la de producción y las de cada despliegue son distintas.
    return await new Receiver({ currentSigningKey: keys.current, nextSigningKey: keys.next }).verify({ signature, body });
  } catch {
    return false;
  }
}
