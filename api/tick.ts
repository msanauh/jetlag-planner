/* Envía los avisos que tocan. Lo llama una planificación de QStash cada 2 minutos
   (firmada con las Signing Keys) o Vercel Cron con "Authorization: Bearer $CRON_SECRET". */
import { authorizedTick } from './_lib/auth.js';
import { tick } from './_lib/logic.js';
import { json, webPushSender } from './_lib/push.js';
import { redisStore } from './_lib/store.js';

async function handle(req: Request): Promise<Response> {
  const body = req.method === 'POST' ? await req.text() : '';
  if (!(await authorizedTick(req, body))) return json({ error: 'No autorizado.' }, 401);
  return json(await tick(redisStore(), webPushSender()));
}
export const GET = handle;
export const POST = handle;
