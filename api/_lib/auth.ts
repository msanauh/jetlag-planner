/* Quién puede llamar a /api/tick:
   - QStash: cada llamada lleva la cabecera "Upstash-Signature", firmada con las claves
     de tu cuenta (QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY). Es lo recomendado.
   - O cualquiera que envíe "Authorization: Bearer $CRON_SECRET" (p. ej. Vercel Cron). */
import { Receiver } from '@upstash/qstash';

export interface AuthEnv { CRON_SECRET?: string; QSTASH_CURRENT_SIGNING_KEY?: string; QSTASH_NEXT_SIGNING_KEY?: string }

export async function authorizedTick(req: Request, body: string, env: AuthEnv = process.env as AuthEnv): Promise<boolean> {
  const secret = env.CRON_SECRET?.trim();
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  const signature = req.headers.get('upstash-signature');
  const current = env.QSTASH_CURRENT_SIGNING_KEY?.trim(), next = env.QSTASH_NEXT_SIGNING_KEY?.trim();
  if (!signature || !current || !next) return false;
  try {
    // Sin comprobar la URL: la de producción y las de cada despliegue son distintas.
    return await new Receiver({ currentSigningKey: current, nextSigningKey: next }).verify({ signature, body });
  } catch {
    return false;
  }
}
