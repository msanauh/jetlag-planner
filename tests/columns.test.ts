import { describe, expect, it } from 'vitest';
import { ymdInTz } from '../src/core/time';
import { build, type TripRaw } from '../src/ui/model';
import { buildColumns } from '../src/ui/views/calendar';

const raw = (to: string, date: string, time: string, dur: string): TripRaw => ({
  v: 2, home: 'Barcelona', bed: '23:30', wake: '07:30', mb: '08:00', ml: '14:00', md: '21:00',
  legs: [{ to, date, time, dur }, { to: 'Barcelona', date: '2026-12-07', time: '11:00', dur }],
  mode: 'subtle', dir: 'auto', cutoff: '8', tzmode: 'auto', startAt: 0,
});
const labels = (r: TripRaw) => buildColumns(build(r), 'auto').map(c => ymdInTz(c.tz, c.mid + 12 * 3_600_000).join('-'));

describe('columnas del calendario', () => {
  for (const [name, r] of [
    ['al este (Seúl)', raw('Seúl', '2026-11-14', '20:00', '14')],
    ['al oeste (Nueva York)', raw('Nueva York', '2026-11-15', '11:00', '8.5')],
  ] as const) {
    it(`no repiten día al cambiar de zona, ${name}`, () => {
      const l = labels(r);
      expect(new Set(l).size).toBe(l.length);
    });
  }
  it('el día de llegada a Seúl incluye también la parte anterior al aterrizaje', () => {
    const b = build(raw('Seúl', '2026-11-14', '20:00', '14'));
    const col = buildColumns(b, 'auto').find(c => c.e > b.p.legs[0].arr && c.s <= b.p.legs[0].arr)!;
    expect(col.tz).toBe('Asia/Seoul');
    expect(col.s).toBeLessThan(b.p.legs[0].arr);
  });
});
