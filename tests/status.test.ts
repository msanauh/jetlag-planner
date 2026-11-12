import { describe, expect, it } from 'vitest';
import type { PlanEvent } from '../src/core/plan';
import { statusClass, statusOf } from '../src/ui/model';

const ev = (end: number, extra: Partial<PlanEvent> = {}): PlanEvent => ({ id: 'e', j: 0, type: 'meal', start: end, end, ...extra });
const cls = (e: PlanEvent, now: number, done?: boolean) => statusClass(statusOf(e, now, done ? { e: { at: e.start } } : {})).trim();

describe('estados visuales', () => {
  it('anterior al plan: atenuado, nunca tachado', () => expect(cls(ev(10, { beforeStart: true }), 100)).toBe('is-past'));
  it('pasado sin marcar: solo atenuado', () => expect(cls(ev(10), 100)).toBe('is-past'));
  it('pasado y hecho: atenuado y tachado', () => expect(cls(ev(10), 100, true)).toBe('is-past is-done'));
  it('hecho por adelantado: tachado', () => expect(cls(ev(500), 100, true)).toBe('is-done'));
  it('futuro sin marcar: normal', () => expect(cls(ev(500), 100)).toBe(''));
});
