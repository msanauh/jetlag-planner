/* Almacenamiento en Upstash Redis (integración de Vercel Marketplace) y una versión
   en memoria para los tests.
   Claves: jl:sub:{id} (suscripción), jl:due (ZSET de avisos por instante),
   jl:idx:{id}:{viaje} (avisos de ese viaje), jl:trips:{id} (viajes de esa suscripción). */
import { Redis } from '@upstash/redis';
import type { Due, PushSub, Store } from './logic.js';

const SUB_TTL_S = 150 * 86_400;
const enc = (d: Due) => JSON.stringify(d);

export function redisStore(): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Falta configurar Upstash Redis (UPSTASH_REDIS_REST_URL / _TOKEN).');
  const r = new Redis({ url, token, automaticDeserialization: false });
  const idx = (s: string, t: string) => `jl:idx:${s}:${t}`;
  async function dropTrip(s: string, t: string) {
    const old = await r.smembers(idx(s, t));
    if (old.length) await r.zrem('jl:due', ...old);
    await r.del(idx(s, t));
  }
  return {
    async getSub(id) { const v = await r.get<string>(`jl:sub:${id}`); return v ? (JSON.parse(v) as PushSub) : null; },
    async setSub(id, sub) { await r.set(`jl:sub:${id}`, JSON.stringify(sub), { ex: SUB_TTL_S }); },
    async replaceAlerts(s, t, alerts) {
      await dropTrip(s, t);
      if (!alerts.length) { await r.srem(`jl:trips:${s}`, t); return; }
      const members = alerts.map(enc);
      const [first, ...rest] = alerts.map((a, k) => ({ score: a.at, member: members[k] }));
      await r.zadd('jl:due', first, ...rest);
      await r.sadd(idx(s, t), members[0], ...members.slice(1));
      await r.sadd(`jl:trips:${s}`, t);
      await r.expire(idx(s, t), SUB_TTL_S);
      await r.expire(`jl:trips:${s}`, SUB_TTL_S);
    },
    async due(until, limit) {
      const raw = await r.zrange<string[]>('jl:due', '-inf', until, { byScore: true, offset: 0, count: limit });
      return raw.map(x => JSON.parse(x) as Due);
    },
    async remove(items) {
      if (!items.length) return;
      const members = items.map(enc);
      await r.zrem('jl:due', ...members);
      for (const d of items) await r.srem(idx(d.s, d.t), enc(d));
    },
    async forget(s) {
      for (const t of await r.smembers(`jl:trips:${s}`)) await dropTrip(s, t);
      await r.del(`jl:trips:${s}`, `jl:sub:${s}`);
    },
    async pending(s) {
      let count = 0, next: number | null = null;
      for (const t of await r.smembers(`jl:trips:${s}`)) {
        for (const m of await r.smembers(idx(s, t))) {
          const d = JSON.parse(m) as Due; count++;
          if (next == null || d.at < next) next = d.at;
        }
      }
      return { count, next };
    },
    async total() { return r.zcard('jl:due'); },
    async setMeta(k, v) { await r.set(`jl:meta:${k}`, JSON.stringify(v), { ex: 30 * 86_400 }); },
    async getMeta(k) { const v = await r.get<string>(`jl:meta:${k}`); return v ? JSON.parse(v) : null; },
  };
}

export function memoryStore(): Store & { all(): Due[] } {
  const subs = new Map<string, PushSub>();
  const meta = new Map<string, unknown>();
  let due: Due[] = [];
  return {
    all: () => due,
    async getSub(id) { return subs.get(id) ?? null; },
    async setSub(id, sub) { subs.set(id, sub); },
    async replaceAlerts(s, t, alerts) { due = [...due.filter(d => !(d.s === s && d.t === t)), ...alerts]; },
    async due(until, limit) { return due.filter(d => d.at <= until).sort((a, b) => a.at - b.at).slice(0, limit); },
    async remove(items) { const k = new Set(items.map(enc)); due = due.filter(d => !k.has(enc(d))); },
    async forget(s) { subs.delete(s); due = due.filter(d => d.s !== s); },
    async pending(s) { const mine = due.filter(d => d.s === s); return { count: mine.length, next: mine.length ? Math.min(...mine.map(d => d.at)) : null }; },
    async total() { return due.length; },
    async setMeta(k, v) { meta.set(k, v); },
    async getMeta(k) { return meta.get(k) ?? null; },
  };
}
