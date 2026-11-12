import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

describe('guardado en IndexedDB', () => {
  it('migra los viajes del prototipo desde localStorage y luego guarda en IndexedDB', async () => {
    const mem: Record<string, string> = { jl2_trips: JSON.stringify([{ id: '1', raw: { dest: 'Tokio' } }]), jl3_current: '"1"' };
    (globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null };
    const { loadAll, save, idbGet } = await import('../src/ui/storage');
    const st = await loadAll({ trips: [] as unknown[], profile: {}, current: null as string | null, done: {} });
    expect(st.trips).toHaveLength(1);
    expect(st.current).toBe('1');
    save('done', { '1': { '0:sleep': { at: 5 } } });
    await new Promise(r => setTimeout(r, 20));
    expect(await idbGet('done')).toEqual({ '1': { '0:sleep': { at: 5 } } });
    // La migración solo ocurre una vez.
    mem.jl2_trips = '[]';
    expect((await loadAll({ trips: [] as unknown[] })).trips).toHaveLength(1);
  });
});
