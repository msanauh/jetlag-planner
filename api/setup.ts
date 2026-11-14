/* Crea (o actualiza) la planificación de QStash que llama a /api/tick cada 10 minutos,
   usando el QSTASH_TOKEN del propio servidor: así la planificación está siempre en la misma
   cuenta y región que las claves con las que se comprueba la firma.
   Solo puede crear esa planificación (id fijo, destino fijo): llamarlo varias veces no duplica nada. */
import { json } from './_lib/push.js';

const SCHEDULE_ID = 'jetlag-planner-tick';

export async function POST(): Promise<Response> {
  const token = process.env.QSTASH_TOKEN?.trim();
  const base = (process.env.QSTASH_URL?.trim() || 'https://qstash.upstash.io').replace(/\/$/, '');
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!token) return json({ error: 'Falta QSTASH_TOKEN.' }, 500);
  if (!host) return json({ error: 'Falta VERCEL_PROJECT_PRODUCTION_URL (solo existe en Vercel).' }, 500);
  const destination = `https://${host}/api/tick`;
  const every = Number(process.env.TICK_EVERY_MIN) || 10;
  const r = await fetch(`${base}/v2/schedules/${destination}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'Upstash-Cron': `*/${every} * * * *`,
      'Upstash-Schedule-Id': SCHEDULE_ID,
      'Upstash-Method': 'POST',
      'Upstash-Retries': '0',
    },
  });
  const created = await r.text();
  // Planificaciones de esta cuenta (solo destino, frecuencia e id) para ver si sobra alguna.
  const list = await fetch(`${base}/v2/schedules`, { headers: { authorization: `Bearer ${token}` } })
    .then(x => (x.ok ? x.json() : []))
    .then((xs: { scheduleId?: string; destination?: string; cron?: string }[]) => xs.map(x => ({ id: x.scheduleId, destination: x.destination, cron: x.cron })))
    .catch(() => null);
  return json({ ok: r.ok, status: r.status, qstash: new URL(base).host, destination, respuesta: created.slice(0, 300), planificaciones: list }, r.ok ? 200 : 502);
}
