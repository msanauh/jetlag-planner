import { describe, expect, it } from 'vitest';
import { plan } from '../src/core/plan';
// @ts-expect-error módulo JS de referencia sin tipos
import { plan as protoPlan } from './fixtures/prototype-core.js';

const meals = [{ key: 'breakfast', time: '08:00' }, { key: 'lunch', time: '14:00' }, { key: 'dinner', time: '21:00' }] as const;
const base = { bed: '23:30', wake: '07:30', meals: [...meals], cutoff: 8, dir: 'auto' as const };
const cases: [string, string, string, number][] = [
  ['Tokio', 'Asia/Tokyo', '2026-12-05T10:00', 14],
  ['Nueva York', 'America/New_York', '2026-12-05T11:00', 8.5],
  ['Sídney', 'Australia/Sydney', '2026-12-05T11:00', 22],
  ['Lisboa', 'Europe/Lisbon', '2026-12-05T11:00', 2],
];

describe('mismo resultado que el prototipo en viajes simples', () => {
  for (const [name, tz, dep, dur] of cases) for (const mode of ['subtle', 'abrupt'] as const) {
    it(`Barcelona → ${name} (${mode})`, () => {
      const inp = { ...base, originTz: 'Europe/Madrid', destTz: tz, dep, dur, mode };
      const a = plan(inp), b = protoPlan(inp);
      expect(a.dir).toBe(b.dir);
      expect(a.total).toBeCloseTo(b.total, 9);
      expect(a.rate).toBe(b.rate);
      const strip = (e: any) => ({ j: e.j, type: e.type, start: e.start, end: e.end, meal: e.meal, adapted: !!e.adapted, maintain: !!e.maintain });
      const n = Math.min(a.nDays, b.nDays);
      const ea = a.events.filter(e => e.j >= 0 && e.j < n && e.type !== 'melatonin').map(strip);
      const eb = b.events.filter((e: any) => e.j >= 0 && e.j < n).map(strip);
      const ord = (x: any, y: any) => x.start - y.start || x.type.localeCompare(y.type);
      expect(ea.sort(ord)).toEqual(eb.sort(ord));
    });
  }
});
