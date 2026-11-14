import { describe, expect, it } from 'vitest';
import { PushError, subIdOf, subscribe, tick, unsubscribe, type PushSub } from '../api/_lib/logic';
import { memoryStore } from '../api/_lib/store';

const sub: PushSub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const NOW = Date.UTC(2026, 10, 14, 8, 0);
const M = 60_000;
const alerts = [
  { id: 'a1', at: NOW - 30 * M, title: 'Viejo', body: '' },
  { id: 'a2', at: NOW - 5 * M, title: 'Un poco tarde', body: '' },
  { id: 'a3', at: NOW + 30 * 1000, title: 'Ya casi', body: '' },
  { id: 'a4', at: NOW + 60 * M, title: 'Luego', body: '' },
];

describe('servidor de avisos', () => {
  it('guarda solo lo válido y sustituye los avisos de un viaje', async () => {
    const st = memoryStore();
    expect((await subscribe(st, { subscription: sub, trip: 't1', alerts }, NOW)).stored).toBe(3); // el de hace 30 min no
    await subscribe(st, { subscription: sub, trip: 't1', alerts: alerts.slice(3) }, NOW);
    expect(st.all().map(d => d.i)).toEqual(['a4']);
    await subscribe(st, { subscription: sub, trip: 't2', alerts: alerts.slice(2, 3) }, NOW);
    expect(st.all()).toHaveLength(2);
  });
  it('rechaza datos raros', async () => {
    const st = memoryStore();
    await expect(subscribe(st, { subscription: { ...sub, endpoint: 'http://x' }, trip: 't', alerts: [] })).rejects.toThrow();
    await expect(subscribe(st, { subscription: sub, trip: '../x', alerts: [] })).rejects.toThrow();
    await expect(subscribe(st, { subscription: sub, trip: 't', alerts: [{ id: 1 }] })).rejects.toThrow();
  });
  it('envía lo que toca (y lo de los próximos 5 min, con la planificación cada 10), y no repite', async () => {
    const st = memoryStore();
    await subscribe(st, { subscription: sub, trip: 't1', alerts }, NOW);
    const sent: string[] = [];
    const r = await tick(st, async (_s, p) => { sent.push(p.id); }, NOW);
    expect(sent).toEqual(['a2', 'a3']);
    expect(r.sent).toBe(2);
    await tick(st, async (_s, p) => { sent.push(p.id); }, NOW + M);
    expect(sent).toEqual(['a2', 'a3']);
  });
  it('descarta avisos que llegarían demasiado tarde', async () => {
    const st = memoryStore();
    await subscribe(st, { subscription: sub, trip: 't1', alerts: alerts.slice(3) }, NOW);
    const r = await tick(st, async () => {}, NOW + 3 * 60 * M);
    expect(r).toMatchObject({ sent: 0, stale: 1 });
  });
  it('olvida suscripciones caducadas (410) y reintenta otros errores', async () => {
    const st = memoryStore();
    await subscribe(st, { subscription: sub, trip: 't1', alerts: alerts.slice(2) }, NOW);
    const fail = await tick(st, async () => { throw new Error('red'); }, NOW);
    expect(fail.failed).toBe(1);
    expect(st.all()).toHaveLength(2);
    const gone = await tick(st, async () => { throw new PushError(410); }, NOW);
    expect(gone.gone).toBe(1);
    expect(st.all()).toHaveLength(0);
    expect(await st.getSub(subIdOf(sub.endpoint))).toBeNull();
  });
  it('darse de baja borra todo', async () => {
    const st = memoryStore();
    await subscribe(st, { subscription: sub, trip: 't1', alerts }, NOW);
    await unsubscribe(st, { endpoint: sub.endpoint });
    expect(st.all()).toHaveLength(0);
  });
});

describe('ritmo de la planificación', () => {
  it('cada 10 min: manda lo que toca en los próximos 5 min, no lo de dentro de 6', async () => {
    const st = memoryStore();
    await subscribe(st, { subscription: sub, trip: 't', alerts: [
      { id: 'b1', at: NOW + 4 * M, title: 'pronto', body: '' },
      { id: 'b2', at: NOW + 6 * M, title: 'luego', body: '' },
    ] }, NOW);
    const sent: string[] = [];
    await tick(st, async (_s, p) => { sent.push(p.id); }, NOW);
    expect(sent).toEqual(['b1']);
    await tick(st, async (_s, p) => { sent.push(p.id); }, NOW + 10 * M);
    expect(sent).toEqual(['b1', 'b2']);
  });
  it('cada minuto (si algún día se cambia): solo 30 s de margen', async () => {
    const st = memoryStore();
    await subscribe(st, { subscription: sub, trip: 't', alerts: [{ id: 'c1', at: NOW + 2 * M, title: 'x', body: '' }] }, NOW);
    const sent: string[] = [];
    await tick(st, async (_s, p) => { sent.push(p.id); }, NOW, 1);
    expect(sent).toEqual([]);
  });
});

describe('estado', () => {
  it('cuenta los avisos pendientes de una suscripción y el próximo', async () => {
    const st = memoryStore();
    await subscribe(st, { subscription: sub, trip: 't1', alerts }, NOW);
    expect(await st.pending(subIdOf(sub.endpoint))).toEqual({ count: 3, next: NOW - 5 * M });
    expect(await st.total()).toBe(3);
    await st.setMeta('lastTick', { at: 1 });
    expect(await st.getMeta('lastTick')).toEqual({ at: 1 });
  });
});
