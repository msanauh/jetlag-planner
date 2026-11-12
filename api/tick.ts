/* Envía los avisos que tocan. Lo llama una planificación de QStash cada 2 minutos
   (firmada con las Signing Keys) o Vercel Cron con "Authorization: Bearer $CRON_SECRET". */
import { authorizedTick } from './_lib/auth.js';
import { tick } from './_lib/logic.js';
import { json, webPushSender } from './_lib/push.js';
import { redisStore } from './_lib/store.js';

async function handle(req: Request): Promise<Response> {
  const body = req.method === 'POST' ? await req.text() : '';
  if (!(await authorizedTick(req, body))) {
    // Diagnóstico sin valores: solo qué está configurado (sí / no).
    const e = process.env, has = (k: string) => !!e[k]?.trim();
    return json({
      error: 'No autorizado.',
      firma: req.headers.has('upstash-signature'),
      config: {
        QSTASH_CURRENT_SIGNING_KEY: has('QSTASH_CURRENT_SIGNING_KEY'), QSTASH_NEXT_SIGNING_KEY: has('QSTASH_NEXT_SIGNING_KEY'),
        QSTASH_TOKEN: has('QSTASH_TOKEN'), CRON_SECRET: has('CRON_SECRET'),
        redis: has('KV_REST_API_URL') || has('UPSTASH_REDIS_REST_URL'), vapid: has('VAPID_PRIVATE_KEY') && has('VAPID_PUBLIC_KEY'),
      },
    }, 401);
  }
  return json(await tick(redisStore(), webPushSender()));
}
export const GET = handle;
export const POST = handle;
