/* Quién puede llamar a /api/tick:
   - QStash: cada llamada lleva la cabecera "Upstash-Signature", firmada con las claves de
     firma de tu cuenta. Se prueban las de QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY
     y, si no sirven (o no están), las que da QStash con QSTASH_TOKEN (GET /v2/keys).
   - O cualquiera que envíe "Authorization: Bearer $CRON_SECRET" (p. ej. Vercel Cron). */
import { Receiver } from '@upstash/qstash';

export interface AuthEnv {
  CRON_SECRET?: string; QSTASH_CURRENT_SIGNING_KEY?: string; QSTASH_NEXT_SIGNING_KEY?: string;
  QSTASH_TOKEN?: string; QSTASH_URL?: string;
}
type Keys = { current: string; next: string };
let cached: { token: string; keys: Keys; at: number } | null = null;

export async function keysFromToken(env: AuthEnv, fetcher: typeof fetch = fetch): Promise<Keys | null> {
  const token = env.QSTASH_TOKEN?.trim();
  if (!token) return null;
  if (cached && cached.token === token && Date.now() - cached.at < 3_600_000) return cached.keys;
  const base = (env.QSTASH_URL?.trim() || 'https://qstash.upstash.io').replace(/\/$/, '');
  const r = await fetcher(`${base}/v2/keys`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const k = (await r.json()) as Partial<Keys>;
  if (!k.current || !k.next) return null;
  cached = { token, keys: { current: k.current, next: k.next }, at: Date.now() };
  return cached.keys;
}

export interface AuthResult { ok: boolean; via?: 'cron' | 'env' | 'token'; reasons: string[]; diag: Record<string, unknown> }
const tail = (s?: string) => (s ? '…' + s.slice(-4) : null);

async function verify(keys: Keys, signature: string, body: string): Promise<string | null> {
  try {
    const ok = await new Receiver({ currentSigningKey: keys.current, nextSigningKey: keys.next }).verify({ signature, body });
    return ok ? null : 'firma no válida';
  } catch (e) {
    return (e as Error).message || 'firma no válida';
  }
}

/** Datos públicos de la firma (no secretos): emisor, destino y validez. */
function claims(signature: string): Record<string, unknown> {
  try {
    const p = JSON.parse(Buffer.from(signature.split('.')[1], 'base64url').toString());
    return { iss: p.iss, sub: p.sub, exp: p.exp, nbf: p.nbf, ahora: Math.floor(Date.now() / 1000) };
  } catch { return { error: 'no es un JWT' }; }
}

export async function checkTick(req: Request, body: string, env: AuthEnv = process.env as AuthEnv, fetcher: typeof fetch = fetch): Promise<AuthResult> {
  const reasons: string[] = [];
  const diag: Record<string, unknown> = {};
  const secret = env.CRON_SECRET?.trim();
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return { ok: true, via: 'cron', reasons, diag };
  const signature = req.headers.get('upstash-signature');
  if (!signature) { reasons.push('sin firma de QStash'); return { ok: false, reasons, diag }; }
  diag.firma = claims(signature);

  const envKeys = env.QSTASH_CURRENT_SIGNING_KEY?.trim() && env.QSTASH_NEXT_SIGNING_KEY?.trim()
    ? { current: env.QSTASH_CURRENT_SIGNING_KEY.trim(), next: env.QSTASH_NEXT_SIGNING_KEY.trim() } : null;
  diag.clavesVercel = envKeys ? { current: tail(envKeys.current), next: tail(envKeys.next) } : null;
  if (envKeys) {
    const err = await verify(envKeys, signature, body);
    if (!err) return { ok: true, via: 'env', reasons, diag };
    reasons.push(`claves de Vercel: ${err}`);
  }
  try {
    const tk = await keysFromToken(env, fetcher);
    diag.clavesToken = tk ? { current: tail(tk.current), next: tail(tk.next) } : null;
    if (tk) {
      const err = await verify(tk, signature, body);
      if (!err) return { ok: true, via: 'token', reasons, diag };
      reasons.push(`claves del token: ${err}`);
    } else reasons.push('QSTASH_TOKEN no dio claves');
  } catch (e) {
    reasons.push(`QSTASH_TOKEN: ${(e as Error).message}`);
  }
  return { ok: false, reasons, diag };
}

export async function authorizedTick(req: Request, body: string, env?: AuthEnv, fetcher?: typeof fetch): Promise<boolean> {
  return (await checkTick(req, body, env, fetcher)).ok;
}
