/* POST { subscription }: envía un aviso de prueba al momento. */
import { parseSub } from './_lib/logic.js';
import { json, webPushSender } from './_lib/push.js';

export async function POST(req: Request): Promise<Response> {
  try {
    const sub = parseSub(((await req.json()) as { subscription?: unknown }).subscription);
    await webPushSender()(sub, { id: 'test', title: 'En 30 minutos, vete a dormir', body: 'Así te llegarán los avisos de tu plan.' });
    return json({ ok: true });
  } catch (e) { return json({ error: (e as Error).message }, 400); }
}
