/* Envía los avisos que tocan. Lo llama una planificación de QStash cada 2 minutos
   (o Vercel Cron en el plan Pro) con "Authorization: Bearer $CRON_SECRET". */
import { tick } from './_lib/logic.js';
import { json, webPushSender } from './_lib/push.js';
import { redisStore } from './_lib/store.js';

async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'No autorizado.' }, 401);
  return json(await tick(redisStore(), webPushSender()));
}
export const GET = handle;
export const POST = handle;
