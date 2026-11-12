// Crea en QStash una planificación que llama a /api/tick cada 2 minutos.
// Uso: QSTASH_TOKEN=... CRON_SECRET=... node scripts/qstash-schedule.mjs https://tu-app.vercel.app
// (QSTASH_URL opcional si tu cuenta de QStash usa una región concreta.)
const site = process.argv[2];
const { QSTASH_TOKEN, CRON_SECRET, QSTASH_URL = 'https://qstash.upstash.io' } = process.env;
if (!site || !QSTASH_TOKEN || !CRON_SECRET) {
  console.error('Uso: QSTASH_TOKEN=... CRON_SECRET=... node scripts/qstash-schedule.mjs https://tu-app.vercel.app');
  process.exit(1);
}
const dest = new URL('/api/tick', site).toString();
const res = await fetch(`${QSTASH_URL}/v2/schedules/${dest}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${QSTASH_TOKEN}`,
    'Upstash-Cron': '*/2 * * * *',
    'Upstash-Method': 'POST',
    'Upstash-Retries': '0',
    'Upstash-Forward-Authorization': `Bearer ${CRON_SECRET}`,
  },
});
console.log(res.status, await res.text());
