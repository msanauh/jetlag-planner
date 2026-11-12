import { describe, expect, it } from 'vitest';
import { plan, planTrip, type PlanEvent, type TripInput } from '../src/core/plan';
import { H, hourInTz, localToUtc, tzOffsetMs } from '../src/core/time';

const BCN = 'Europe/Madrid', TYO = 'Asia/Tokyo', NYC = 'America/New_York', SYD = 'Australia/Sydney';
const meals = [{ key: 'breakfast', time: '08:00' }, { key: 'lunch', time: '14:00' }, { key: 'dinner', time: '21:00' }] as TripInput['meals'];
const B = { bed: '23:30', wake: '07:30', meals, cutoff: 8 };
const localHM = (tz: string, u: number) => { const h = hourInTz(tz, u); return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`; };
const sleeps = (evs: PlanEvent[]) => evs.filter(e => e.type === 'sleep');

function sanity(evs: PlanEvent[]) {
  for (const e of evs) {
    expect(Number.isFinite(e.start) && Number.isFinite(e.end)).toBe(true);
    expect(e.end).toBeGreaterThanOrEqual(e.start);
  }
  const ids = evs.map(e => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  // El sueño dura siempre lo mismo (8 h): el reloj se mueve, la noche no se estira.
  for (const s of sleeps(evs)) expect((s.end - s.start) / H).toBeCloseTo(8, 6);
}

describe('Barcelona → Tokio', () => {
  const p = plan({ ...B, originTz: BCN, destTz: TYO, dep: '2026-12-05T10:00', dur: 14, mode: 'subtle' });
  it('adelanta 8 h a 0,75 h/día, empezando 3 días antes', () => {
    expect(p.dir).toBe('adv');
    expect(p.total).toBe(8);
    expect(p.rate).toBe(0.75);
    const first = sleeps(p.events)[0];
    expect(localHM(BCN, first.start)).toBe('22:45');
    expect(new Date(first.start).getUTCDate()).toBe(2);
    sanity(p.events);
  });
  it('acaba adaptada a la hora de Tokio', () => {
    const last = sleeps(p.events).at(-1)!;
    expect(last.adapted).toBe(true);
    expect(localHM(TYO, last.start)).toBe('23:30');
    expect(localHM(TYO, last.end)).toBe('07:30');
  });
  it('al adelantar: luz tras despertar, evitarla antes de dormir', () => {
    const d0 = p.events.filter(e => e.j === 0);
    const wake = d0.find(e => e.type === 'caffeine-ok')!.start;
    expect(d0.find(e => e.type === 'light-seek')!.start).toBe(wake);
    expect(d0.find(e => e.type === 'light-avoid')!.end).toBe(d0.find(e => e.type === 'sleep')!.start);
  });
  it('brusco: 1,5 h/día y empieza 1 día antes', () => {
    const a = plan({ ...B, originTz: BCN, destTz: TYO, dep: '2026-12-05T10:00', dur: 14, mode: 'abrupt' });
    expect(a.rate).toBe(1.5);
    expect(new Date(sleeps(a.events)[0].start).getUTCDate()).toBe(4);
  });
});

describe('Barcelona → Nueva York', () => {
  const p = plan({ ...B, originTz: BCN, destTz: NYC, dep: '2026-12-05T11:00', dur: 8.5, mode: 'subtle' });
  it('retrasa 6 h a 1 h/día', () => {
    expect(p.dir).toBe('del');
    expect(p.total).toBe(6);
    expect(p.rate).toBe(1);
    sanity(p.events);
  });
  it('al retrasar: evitar luz al despertar, buscarla antes de dormir', () => {
    const d0 = p.events.filter(e => e.j === 0);
    expect(d0.find(e => e.type === 'light-seek')!.end).toBe(d0.find(e => e.type === 'sleep')!.start);
  });
  it('acaba durmiendo 23:30–07:30 en Nueva York', () => {
    const last = sleeps(p.events).at(-1)!;
    expect(localHM(NYC, last.start)).toBe('23:30');
  });
});

describe('Barcelona → Sídney', () => {
  const p = plan({ ...B, originTz: BCN, destTz: SYD, dep: '2026-12-05T11:00', dur: 22, mode: 'subtle' });
  it('elige adelantar 10 h (13,3 días a 0,75) frente a retrasar 14 h (14 días a 1)', () => {
    expect(p.E).toBe(10);
    expect(p.dir).toBe('adv');
    expect(p.total).toBe(10);
    sanity(p.events);
    expect(localHM(SYD, sleeps(p.events).at(-1)!.start)).toBe('23:30');
  });
  it('respeta la dirección forzada', () => {
    const f = plan({ ...B, originTz: BCN, destTz: SYD, dep: '2026-12-05T11:00', dur: 22, mode: 'subtle', dir: 'del' });
    expect(f.dir).toBe('del');
    expect(f.total).toBe(14);
  });
});

describe('ida y vuelta', () => {
  const p = planTrip({ ...B, mode: 'subtle', legs: [
    { fromTz: BCN, toTz: TYO, dep: '2026-12-05T10:00', dur: 14 },
    { fromTz: TYO, toTz: BCN, dep: '2026-12-15T11:00', dur: 14 },
  ] });
  it('crea dos cambios de zona', () => {
    expect(p.transitions).toHaveLength(2);
    expect(p.transitions[1].dir).toBe('del');
    sanity(p.events);
  });
  it('la vuelta empieza 3 días antes de volar', () => {
    const t = p.transitions[1];
    const [y, m, d] = [2026, 12, 12];
    expect(t.startDay).toBeGreaterThanOrEqual(localToUtc(TYO, y, m, d, 0, 0));
    expect(t.startDay).toBeLessThan(localToUtc(TYO, y, m, d + 1, 0, 0));
  });
  it('lleva el estado del reloj: la vuelta parte de lo ya adaptado (7,5 h, no 8)', () => {
    expect(p.transitions[0].adaptedAt).toBeUndefined();
    expect(p.transitions[1].total).toBe(7.5);
  });
  it('termina en casa a la hora de siempre', () => {
    const last = sleeps(p.events).at(-1)!;
    expect(last.adapted).toBe(true);
    expect(localHM(BCN, last.start)).toBe('23:30');
  });
});

describe('varios tramos', () => {
  it('una escala corta (< 12 h) no cambia el reloj', () => {
    const p = planTrip({ ...B, legs: [
      { fromTz: BCN, toTz: 'Asia/Dubai', dep: '2026-12-05T10:00', dur: 7 },
      { fromTz: 'Asia/Dubai', toTz: TYO, dep: '2026-12-06T00:30', dur: 9.5 },
    ] });
    expect(p.legs[0].stay?.kind).toBe('layover');
    expect(p.transitions).toHaveLength(1);
    expect(p.transitions[0].toTz).toBe(TYO);
    expect(p.total).toBe(8);
  });
  it('una estancia de 2 días o menos mantiene la hora de casa', () => {
    const p = planTrip({ ...B, legs: [
      { fromTz: BCN, toTz: NYC, dep: '2026-12-05T11:00', dur: 8.5 },
      { fromTz: NYC, toTz: BCN, dep: '2026-12-06T18:00', dur: 7.5 },
    ] });
    expect(p.legs[0].stay?.kind).toBe('short');
    expect(p.transitions).toHaveLength(1);
    expect(p.transitions[0].toTz).toBe(BCN);
    expect(p.noShift).toBe(true);
  });
  it('salvo que pidas adaptarte', () => {
    const p = planTrip({ ...B, legs: [
      { fromTz: BCN, toTz: NYC, dep: '2026-12-05T11:00', dur: 8.5, adapt: true },
      { fromTz: NYC, toTz: BCN, dep: '2026-12-07T09:00', dur: 7.5 },
    ] });
    expect(p.transitions).toHaveLength(2);
  });
  it('reorienta el objetivo a mitad de camino (Tokio 4 días → Nueva York)', () => {
    const p = planTrip({ ...B, legs: [
      { fromTz: BCN, toTz: TYO, dep: '2026-12-05T10:00', dur: 14 },
      { fromTz: TYO, toTz: NYC, dep: '2026-12-10T18:00', dur: 13 },
    ] });
    expect(p.transitions).toHaveLength(2);
    const t1 = p.transitions[1];
    // NY está a 14 h de Tokio, pero el cuerpo aún no ha llegado a Tokio: queda menos.
    expect(t1.total).toBeLessThan(14);
    sanity(p.events);
    expect(localHM(NYC, sleeps(p.events).at(-1)!.start)).toBe('23:30');
  });
  it('rechaza tramos que se solapan', () => {
    expect(() => planTrip({ ...B, legs: [
      { fromTz: BCN, toTz: NYC, dep: '2026-12-05T11:00', dur: 8.5 },
      { fromTz: NYC, toTz: BCN, dep: '2026-12-05T12:00', dur: 7.5 },
    ] })).toThrow(/sale antes/);
  });
});

describe('cambios de hora (Madrid)', () => {
  it('25 de octubre: el sueño sigue durando 8 h y la diferencia se mide con la hora de verano', () => {
    const p = plan({ ...B, originTz: BCN, destTz: NYC, dep: '2026-10-26T11:00', dur: 8.5, mode: 'subtle' });
    sanity(p.events);
    // El cuerpo vivía en CEST (+2) y Nueva York está en EDT (−4): 6 h.
    expect(p.total).toBe(6);
    expect(localHM(NYC, sleeps(p.events).at(-1)!.start)).toBe('23:30');
  });
  it('29 de marzo: plan que cruza el cambio a horario de verano', () => {
    const p = plan({ ...B, originTz: BCN, destTz: TYO, dep: '2026-03-30T10:00', dur: 14, mode: 'subtle' });
    sanity(p.events);
    expect(tzOffsetMs(BCN, localToUtc(BCN, 2026, 3, 28, 12, 0)) / H).toBe(1);
    expect(tzOffsetMs(BCN, localToUtc(BCN, 2026, 3, 30, 12, 0)) / H).toBe(2);
    expect(p.total).toBe(8);
    expect(localHM(TYO, sleeps(p.events).at(-1)!.start)).toBe('23:30');
  });
  it('ya adaptada, el plan sigue la hora local cuando cambia (Nueva York, 1 de noviembre)', () => {
    const p = planTrip({ ...B, mode: 'abrupt', legs: [
      { fromTz: BCN, toTz: NYC, dep: '2026-10-20T11:00', dur: 8.5 },
      { fromTz: NYC, toTz: BCN, dep: '2026-11-12T18:00', dur: 7.5 },
    ] });
    sanity(p.events);
    // Los días adaptados en Nueva York se pliegan ("mantén tus horarios"), pero el reloj sigue
    // al cambio de hora: la vuelta parte de EST (−5) → CET (+1) = 6 h. Sin seguirlo serían 5 h.
    expect(p.steady.length).toBe(1);
    expect(p.steady[0].from).toBeLessThan(Date.UTC(2026, 10, 1));
    expect(p.steady[0].to).toBeGreaterThan(Date.UTC(2026, 10, 2));
    expect(p.transitions[1].total).toBe(6);
    expect(localHM(BCN, sleeps(p.events).at(-1)!.start)).toBe('23:30');
  });
});

describe('startAt y poco margen', () => {
  const dep = '2026-12-05T10:00';
  const mk = (startAt: number, mode: 'subtle' | 'abrupt' = 'subtle') => plan({ ...B, originTz: BCN, destTz: TYO, dep, dur: 14, mode, startAt });

  it('el plan arranca el día en que se crea y marca lo anterior como previo', () => {
    const startAt = localToUtc(BCN, 2026, 12, 3, 14, 30);
    const p = mk(startAt);
    const first = Math.min(...p.events.map(e => e.start));
    expect(first).toBeGreaterThanOrEqual(localToUtc(BCN, 2026, 12, 3, 0, 0));
    const before = p.events.filter(e => e.beforeStart);
    expect(before.map(e => e.type).sort()).toEqual(['light-seek', 'meal', 'meal']);
    for (const e of before) expect(e.end).toBeLessThanOrEqual(startAt);
    for (const e of p.events.filter(x => !x.beforeStart)) expect(e.end).toBeGreaterThan(startAt);
  });
  it('si se crea con tiempo de sobra no cambia nada', () => {
    const p = mk(localToUtc(BCN, 2026, 11, 1, 9, 0));
    expect(p.events.some(e => e.beforeStart)).toBe(false);
    expect(p.preflight?.short).toBe(false);
  });
  it('suave con menos de 72 h: calcula lo que da tiempo a ajustar', () => {
    const p = mk(localToUtc(BCN, 2026, 12, 3, 14, 30));
    expect(p.preflight).toMatchObject({ short: true, suggestAbrupt: false, achieved: 1.5, total: 8, remaining: 6.5 });
    expect(p.preflight!.hoursLeft).toBeCloseTo(43.5);
  });
  it('con menos de 24 h propone brusco', () => {
    const p = mk(localToUtc(BCN, 2026, 12, 4, 18, 0));
    expect(p.preflight?.suggestAbrupt).toBe(true);
    expect(p.preflight?.achieved).toBe(0.75);
  });
  it('los identificadores son estables entre cálculos', () => {
    const s = localToUtc(BCN, 2026, 12, 3, 14, 30);
    expect(mk(s).events.map(e => e.id)).toEqual(mk(s).events.map(e => e.id));
  });
});

describe('melatonina (opcional)', () => {
  it('solo aparece si se activa, y solo en días de adelantar', () => {
    const off = plan({ ...B, originTz: BCN, destTz: TYO, dep: '2026-12-05T10:00', dur: 14 });
    expect(off.events.some(e => e.type === 'melatonin')).toBe(false);
    const on = plan({ ...B, originTz: BCN, destTz: TYO, dep: '2026-12-05T10:00', dur: 14, melatonin: true });
    const mel = on.events.filter(e => e.type === 'melatonin');
    expect(mel.length).toBeGreaterThan(3);
    expect(mel.every(e => !e.adapted)).toBe(true);
    const del = plan({ ...B, originTz: BCN, destTz: NYC, dep: '2026-12-05T11:00', dur: 8.5, melatonin: true });
    expect(del.events.some(e => e.type === 'melatonin')).toBe(false);
  });
});

describe('rutina de los primeros 3 días tras llegar', () => {
  it('ida y vuelta: rutina en Tokio y en casa, a hora local', async () => {
    const { arrivalRoutine } = await import('../src/core/plan');
    const p = planTrip({ ...B, mode: 'abrupt', legs: [
      { fromTz: BCN, toTz: TYO, dep: '2026-12-05T10:00', dur: 14 },
      { fromTz: TYO, toTz: BCN, dep: '2026-12-15T11:00', dur: 14 },
    ] });
    for (const i of [0, 1]) {
      const r = arrivalRoutine(p, i);
      expect(r.map(d => d.n)).toEqual([0, 1, 2, 3]);
      for (const d of r.slice(1)) {
        expect(d.events.some(e => e.type === 'sleep')).toBe(true);
        expect(d.events.some(e => e.type === 'light-seek')).toBe(true);
        expect(d.events.filter(e => e.type === 'meal').length).toBeGreaterThanOrEqual(2);
      }
    }
    // En casa, al final ya se duerme a la hora de siempre.
    const home = arrivalRoutine(p, 1);
    const lastSleep = home[3].events.filter(e => e.type === 'sleep').at(-1)!;
    expect(localHM(BCN, lastSleep.start)).toBe('23:30');
  });
  it('se corta si vuelves a salir antes de 3 días', async () => {
    const { arrivalRoutine } = await import('../src/core/plan');
    const p = planTrip({ ...B, legs: [
      { fromTz: BCN, toTz: NYC, dep: '2026-12-05T11:00', dur: 8.5, adapt: true },
      { fromTz: NYC, toTz: BCN, dep: '2026-12-07T09:00', dur: 7.5 },
    ] });
    const r = arrivalRoutine(p, 0);
    expect(r.at(-1)!.to).toBeLessThanOrEqual(p.legs[1].dep);
  });
});

describe('el plan se adapta a lo que cumples', () => {
  const inp = { ...B, originTz: BCN, destTz: TYO, dep: '2026-12-05T10:00', dur: 14, mode: 'subtle' as const };
  const base = plan(inp);
  const day0 = (t: string) => base.events.find(e => e.id === `0:${t}`)!;

  it('sin registro, o con todo hecho a su hora, el plan no cambia', () => {
    const log = Object.fromEntries(base.events.filter(e => e.j === 0).map(e => [e.id, { at: e.start }]));
    const p = plan({ ...inp, log });
    expect(p.events.map(e => [e.id, e.start])).toEqual(base.events.map(e => [e.id, e.start]));
  });
  it('si no buscas la luz, ese día se mueve menos y la adaptación se retrasa', () => {
    const p = plan({ ...inp, log: { '0:light-seek': { skipped: true }, '0:light-avoid': { skipped: true } } });
    expect(sleeps(p.events)[1].shiftNow).toBeLessThan(sleeps(base.events)[1].shiftNow!);
    expect(p.transitions[0].adaptedAt!).toBeGreaterThan(base.transitions[0].adaptedAt!);
    // Los consejos del propio día siguen siendo los previstos.
    expect(p.events.find(e => e.id === '0:sleep')!.start).toBe(day0('sleep').start);
    // El día siguiente se recoloca: te despiertas más tarde de lo que decía el plan original.
    expect(p.events.find(e => e.id === '1:caffeine-ok')!.start).toBeGreaterThan(base.events.find(e => e.id === '1:caffeine-ok')!.start);
  });
  it('acostarse tarde al adelantar resta; acostarse a su hora no', () => {
    const late = plan({ ...inp, log: { '0:sleep': { at: day0('sleep').start + 0.75 * H } } });
    expect(sleeps(late.events)[0].shiftNow).toBeCloseTo(0.75 * 0.6, 6); // pierde todo el peso del sueño
    const onTime = plan({ ...inp, log: { '0:sleep': { at: day0('sleep').start } } });
    expect(sleeps(onTime.events)[0].shiftNow).toBe(0.75);
  });
  it('comidas, cafeína y azúcar no mueven el reloj', () => {
    const p = plan({ ...inp, log: { '0:meal:dinner': { skipped: true }, '0:caffeine-ok': { skipped: true }, '0:sugar-no': { skipped: true } } });
    expect(p.events.map(e => e.start)).toEqual(base.events.map(e => e.start));
  });
  it('los identificadores no cambian al recalcular', () => {
    const p = plan({ ...inp, log: { '0:light-seek': { skipped: true } } });
    expect(new Set(p.events.map(e => e.id))).toEqual(new Set([...base.events.map(e => e.id), ...p.events.map(e => e.id)]));
    for (const e of base.events) expect(p.events.some(x => x.id === e.id)).toBe(true);
  });
});

describe('estancia ya adaptada: "mantén tus horarios de siempre"', () => {
  const p = planTrip({ ...B, mode: 'abrupt', legs: [
    { fromTz: BCN, toTz: 'Asia/Seoul', dep: '2026-11-14T20:00', dur: 14 },
    { fromTz: 'Asia/Seoul', toTz: BCN, dep: '2026-12-07T11:00', dur: 14 },
  ] });
  const t0 = p.transitions[0], t1 = p.transitions[1];
  it('pliega los días entre la rutina de llegada y la preparación de la vuelta', () => {
    expect(p.steady).toHaveLength(1);
    const r = p.steady[0];
    expect(r.nDays).toBeGreaterThan(10);
    expect(r.from).toBeGreaterThanOrEqual(t0.arr + 3 * 86_400_000);
    expect(r.from).toBeGreaterThanOrEqual(t0.adaptedAt!);
    expect(r.to).toBeLessThanOrEqual(t1.startDay! + 2.5 * H);
  });
  it('dentro no hay consejos día a día, y fuera no se pierde nada', () => {
    const r = p.steady[0];
    expect(p.events.filter(e => e.j >= 0 && e.start >= r.from && e.start < r.to)).toEqual([]);
    expect(arrivalRoutineDays(p)).toBe(4);
    sanity(p.events);
  });
  it('en modo suave, si aún no estás adaptada, los días siguen completos', () => {
    const s = planTrip({ ...B, mode: 'subtle', legs: [
      { fromTz: BCN, toTz: 'Asia/Seoul', dep: '2026-11-14T20:00', dur: 14 },
      { fromTz: 'Asia/Seoul', toTz: BCN, dep: '2026-12-07T11:00', dur: 14 },
    ] });
    expect(s.steady[0].from).toBeGreaterThanOrEqual(s.transitions[0].adaptedAt!);
  });
  it('sin vuelta (o estancias cortas) no hay nada que plegar', () => {
    expect(plan({ ...B, originTz: BCN, destTz: TYO, dep: '2026-12-05T10:00', dur: 14 }).steady).toEqual([]);
  });
});
import { arrivalRoutine as _ar } from '../src/core/plan';
function arrivalRoutineDays(p: ReturnType<typeof planTrip>) { return _ar(p, 0).filter(d => d.events.length).length; }
