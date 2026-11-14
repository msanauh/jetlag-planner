/* Envía los avisos que tocan. Lo llama una planificación de QStash cada 10 minutos
   (firmada con las Signing Keys) o Vercel Cron con "Authorization: Bearer $CRON_SECRET". */
import { checkTick } from './_lib/auth.js';
import { tick } from './_lib/logic.js';
import { json, webPushSender } from './_lib/push.js';
import { redisStore } from './_lib/store.js';

async function handle(req: Request): Promise<Response> {
  const body = req.method === 'POST' ? await req.text() : '';
  const auth = await checkTick(req, body);
  const store = redisStore();
  if (!auth.ok) {
    // Si la llamada venía de QStash (con firma), se apunta el motivo para /api/status.
    if (req.headers.has('upstash-signature')) {
      await store.setMeta('lastRejected', { at: Date.now(), motivo: auth.reasons, firma: auth.diag.firma ?? null }).catch(() => {});
    }
    // Diagnóstico sin secretos: qué está configurado, por qué no vale la firma y los 4 últimos
    // caracteres de cada clave (para ver si son las de la misma cuenta).
    const e = process.env, has = (k: string) => !!e[k]?.trim();
    return json({
      error: 'No autorizado.',
      motivo: auth.reasons,
      ...auth.diag,
      config: {
        QSTASH_CURRENT_SIGNING_KEY: has('QSTASH_CURRENT_SIGNING_KEY'), QSTASH_NEXT_SIGNING_KEY: has('QSTASH_NEXT_SIGNING_KEY'),
        QSTASH_TOKEN: has('QSTASH_TOKEN'), CRON_SECRET: has('CRON_SECRET'),
        redis: has('KV_REST_API_URL') || has('UPSTASH_REDIS_REST_URL'), vapid: has('VAPID_PRIVATE_KEY') && has('VAPID_PUBLIC_KEY'),
      },
    }, 401);
  }
  const every = Number(process.env.TICK_EVERY_MIN) || undefined; // por defecto, 10 minutos
  const result = await tick(store, webPushSender(), Date.now(), every);
  const entry = { at: Date.now(), via: auth.via, ...result };
  await store.setMeta('lastTick', entry).catch(() => {});
  // Historial de las últimas pasadas con algo que hacer (las vacías no aportan).
  if (result.items.length) {
    const hist = ((await store.getMeta('history').catch(() => null)) as unknown[] | null) ?? [];
    await store.setMeta('history', [entry, ...hist].slice(0, 30)).catch(() => {});
  }
  return json(result);
}
export const GET = handle;
export const POST = handle;
