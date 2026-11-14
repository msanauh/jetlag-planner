/* Estado del servidor de avisos, sin secretos ni datos personales.
   GET: última pasada correcta, último rechazo de QStash y total de avisos pendientes.
   POST { endpoint }: además, avisos pendientes de esa suscripción (los de este móvil). */
import { subIdOf } from './_lib/logic.js';
import { json } from './_lib/push.js';
import { redisStore } from './_lib/store.js';

async function status(endpoint?: unknown) {
  const store = redisStore();
  const [lastTick, lastRejected, total] = await Promise.all([store.getMeta('lastTick'), store.getMeta('lastRejected'), store.total()]);
  const mine = typeof endpoint === 'string' && endpoint.startsWith('https://') ? await store.pending(subIdOf(endpoint)) : undefined;
  return { now: Date.now(), lastTick, lastRejected, total, ...(mine ? { mine } : {}) };
}

export async function GET(): Promise<Response> {
  try { return json(await status()); } catch (e) { return json({ error: (e as Error).message }, 500); }
}
export async function POST(req: Request): Promise<Response> {
  try { return json(await status(((await req.json()) as { endpoint?: unknown }).endpoint)); }
  catch (e) { return json({ error: (e as Error).message }, 400); }
}
