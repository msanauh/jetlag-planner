import { describe, expect, it } from 'vitest';
import { alertsFor, DEFAULT_ALERTS } from '../src/core/alerts';
import { placeAt, plan } from '../src/core/plan';
import { localToUtc, ymdInTz } from '../src/core/time';

const p = plan({
  originTz: 'Europe/Madrid', destTz: 'Asia/Tokyo', dep: '2026-12-05T10:00', dur: 14, bed: '23:30', wake: '07:30', mode: 'subtle',
  meals: [{ key: 'breakfast', time: '08:00' }, { key: 'lunch', time: '14:00' }, { key: 'dinner', time: '21:00' }],
});
const M30 = 30 * 60000;

describe('avisos push', () => {
  const al = alertsFor(p);
  it('avisan 30 minutos antes, con el texto en ese formato', () => {
    const sleep = p.events.find(e => e.type === 'sleep')!;
    const a = al.find(x => x.id === `${sleep.id}:start`)!;
    expect(a.at).toBe(sleep.start - M30);
    expect(a.title).toBe('En 30 minutos, vete a dormir');
    const coffee = p.events.find(e => e.type === 'caffeine-ok')!;
    const c = al.find(x => x.eventId === coffee.id)!;
    expect(c.at).toBe(coffee.end - M30);
    expect(c.title).toBe('En 30 minutos, ya no bebas más cafeína hoy');
  });
  it('luz: gafas de sol de día, luz indirecta de noche', () => {
    const avoid = p.events.find(e => e.type === 'light-avoid')!;
    const day = alertsFor(p, { ...DEFAULT_ALERTS, isDay: () => true }).find(x => x.eventId === avoid.id)!;
    const night = alertsFor(p, { ...DEFAULT_ALERTS, isDay: () => false }).find(x => x.eventId === avoid.id)!;
    expect(day.title).toBe('En 30 minutos, ponte gafas de sol para evitar la luz directa');
    expect(night.title).toBe('En 30 minutos, pasa a luz tenue e indirecta');
  });
  it('nada durante el sueño salvo el despertar', () => {
    const sleeps = p.events.filter(e => e.type === 'sleep');
    for (const a of al) if (sleeps.some(s => a.at > s.start && a.at < s.end)) expect(a.id.endsWith(':wake')).toBe(true);
    expect(al.some(a => a.title === 'Hora de levantarte')).toBe(true);
  });
  it('respeta categorías y tope diario', () => {
    expect(al.some(a => a.cat === 'meal')).toBe(false);
    const all = alertsFor(p, { ...DEFAULT_ALERTS, cats: { ...DEFAULT_ALERTS.cats, meal: true, sugar: true }, maxPerDay: 3 });
    const perDay = new Map<string, number>();
    for (const a of all) { const k = ymdInTz(placeAt(p.places, a.at).tz, a.at).join('-'); perDay.set(k, (perDay.get(k) ?? 0) + 1); }
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(3);
    expect(all.filter(a => a.cat === 'sleep').length).toBeGreaterThan(all.filter(a => a.cat === 'meal').length);
  });
  it('no avisa de lo ya pasado', () => {
    const now = localToUtc('Europe/Madrid', 2026, 12, 4, 12, 0);
    expect(alertsFor(p, { ...DEFAULT_ALERTS, now }).every(a => a.at >= now)).toBe(true);
  });
});
