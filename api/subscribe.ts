/* POST: guarda la suscripción y los avisos de un viaje (sustituye los anteriores).
   DELETE: borra la suscripción y todos sus avisos. */
import { subscribe, unsubscribe } from './_lib/logic.js';
import { json } from './_lib/push.js';
import { redisStore } from './_lib/store.js';

export async function POST(req: Request): Promise<Response> {
  try { return json(await subscribe(redisStore(), await req.json())); }
  catch (e) { return json({ error: (e as Error).message }, 400); }
}

export async function DELETE(req: Request): Promise<Response> {
  try { await unsubscribe(redisStore(), await req.json()); return json({ ok: true }); }
  catch (e) { return json({ error: (e as Error).message }, 400); }
}
