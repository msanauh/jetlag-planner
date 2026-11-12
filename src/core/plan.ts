/* ===== Motor: modelo simplificado de reloj circadiano =====

 Reloj biológico: se estima el mínimo de temperatura corporal (CBTmin) ~2,5 h antes
 de despertar. El estado del reloj es una "fase" φ en horas: el cuerpo vive como si
 estuviera en una zona horaria con desfase UTC φ. Adelantar (ir al este) sube φ.

 El plan es una cadena de CBTmin: T(j+1) = T(j) + 24 h − paso(j). Cada día el paso
 acerca φ al objetivo activo (la zona del destino del tramo en curso) a un ritmo
 fijo. Como la fase se arrastra de un día a otro, un viaje con varios tramos hereda
 lo ya adaptado y se puede reorientar a mitad de camino.

 Reglas de tramos:
  - escala < 12 h: no cambia el reloj (el objetivo es el siguiente destino);
  - estancia ≤ 48 h: por defecto tampoco (mantienes el reloj que llevas, p. ej. la
    hora de casa), salvo que el tramo pida `adapt: true`;
  - estancias más largas y el último tramo son destinos en toda regla.
*/
import { DAY, H, localStringToUtc, localToUtc, mod, parseHM, tzOffsetMs, ymdInTz } from './time';

export type Mode = 'subtle' | 'abrupt';
export type Dir = 'adv' | 'del';
export type EventType =
  | 'sleep' | 'light-seek' | 'light-avoid' | 'caffeine-ok' | 'caffeine-avoid' | 'caffeine-no'
  | 'sugar-no' | 'meal' | 'melatonin' | 'flight-dep' | 'flight-arr';
export type MealKey = 'breakfast' | 'lunch' | 'dinner';
export type StayKind = 'layover' | 'short' | 'long' | 'final';

export interface LegInput {
  fromTz: string;
  toTz: string;
  /** 'YYYY-MM-DDTHH:MM' en hora local de `fromTz`, o instante UTC en ms. */
  dep: string | number;
  /** Duración del vuelo en horas. */
  dur: number | string;
  /** Forzar adaptarse a este destino aunque la estancia sea corta. */
  adapt?: boolean;
}

export interface TripInput {
  legs: LegInput[];
  bed: string;
  wake: string;
  meals?: { key: MealKey; time: string }[];
  mode?: Mode;
  /** Dirección forzada para el primer cambio de zona. */
  dir?: 'auto' | Dir;
  /** Horas entre el último café y la hora de dormir. */
  cutoff?: number | string;
  /** Instante en que empieza el plan. Lo anterior se marca `beforeStart`. */
  startAt?: number;
  melatonin?: boolean;
  /** Lo que has hecho de verdad, por id de evento: hecho a una hora (`at`) o no hecho (`skipped`).
      La luz y la hora de acostarte cambian cuánto se mueve el reloj ese día, y con ello los días
      siguientes. Lo que no está en el registro se da por cumplido. */
  log?: Record<string, LogEntry>;
}

export interface LogEntry { at?: number; skipped?: boolean }

/** Peso de cada consejo en el movimiento del reloj de un día (la luz es lo que más pesa). */
export const COMPLIANCE_WEIGHTS = { 'light-seek': 0.4, 'light-avoid': 0.2, sleep: 0.4 } as const;

/** Fracción (0–1) del paso previsto que se consigue un día según el registro.
    Sueño: acostarse tarde al adelantar (o pronto al retrasar) resta horas al paso. */
export function compliance(log: Record<string, LogEntry> | undefined, j: number, dir: Dir, step: number, plannedBed: number): number {
  if (!log || !(step > 0)) return 1;
  let f = 0;
  for (const type of ['light-seek', 'light-avoid'] as const) f += COMPLIANCE_WEIGHTS[type] * (log[`${j}:${type}`]?.skipped ? 0 : 1);
  const sl = log[`${j}:sleep`];
  let sleepPart = 1;
  if (sl?.skipped) sleepPart = 0;
  else if (sl?.at != null) {
    const late = (sl.at - plannedBed) / H;            // > 0: te acostaste más tarde de lo previsto
    const lost = dir === 'adv' ? late : -late;          // horas que van en contra del cambio
    sleepPart = Math.max(0, Math.min(1, 1 - lost / step));
  }
  f += COMPLIANCE_WEIGHTS.sleep * sleepPart;
  return Math.max(0, Math.min(1, f));
}

/** Entrada antigua de un solo tramo (la del prototipo). */
export interface SingleInput extends Omit<TripInput, 'legs'> {
  originTz: string;
  destTz: string;
  dep: string;
  dur: number | string;
}

export interface PlanEvent {
  /** Identificador estable dentro del viaje: día + tipo (+ comida / tramo). */
  id: string;
  j: number;
  type: EventType;
  start: number;
  end: number;
  adapted?: boolean;
  maintain?: boolean;
  meal?: MealKey;
  gapBed?: number;
  /** Horas desplazadas en total al terminar este sueño (respecto a la fase inicial). */
  shiftNow?: number;
  dir?: Dir;
  /** Índice del cambio de zona (transición) al que pertenece el día. */
  tr?: number;
  /** Índice del tramo (solo eventos de vuelo). */
  leg?: number;
  /** Termina antes de que empezara el plan: se muestra atenuado, nunca tachado. */
  beforeStart?: boolean;
}

export interface ResolvedLeg {
  fromTz: string;
  toTz: string;
  dep: number;
  arr: number;
  dur: number;
  /** Estancia tras este tramo (no existe en el último). */
  stay: { kind: StayKind; hours: number } | null;
  /** El destino de este tramo es un objetivo para el reloj. */
  anchor: boolean;
}

export interface Place { tz: string; from: number; to: number; leg: number; kind: StayKind | 'origin' }

export interface Transition {
  index: number;
  fromTz: string;
  toTz: string;
  /** Primer y último tramo del grupo (el último llega al destino objetivo). */
  legFrom: number;
  legTo: number;
  dep: number;
  arr: number;
  switchAt: number;
  dir: Dir;
  /** Horas que hay que mover el reloj al empezar este cambio. */
  total: number;
  rate: number;
  /** Horas a adelantar / retrasar al empezar. */
  E: number;
  W: number;
  /** Diferencia con signo (−12…+12) para mostrar. */
  signed: number;
  /** CBTmin del primer día del cambio (la tarde de ese día empieza a moverse). */
  startDay?: number;
  /** CBTmin del primer día ya adaptado. */
  adaptedAt?: number;
  /** Horas movidas antes de despegar el primer vuelo del grupo. */
  achievedBeforeDep: number;
}

export interface Preflight {
  hoursLeft: number;
  achieved: number;
  total: number;
  remaining: number;
  /** Modo suave con menos de 72 h. */
  short: boolean;
  /** Modo suave con menos de 24 h: proponer brusco. */
  suggestAbrupt: boolean;
}

export interface SteadyRange {
  /** Transición a cuyo destino ya estás adaptada. */
  tr: number;
  tz: string;
  /** Desde el despertar del primer día hasta el despertar siguiente al último. */
  from: number;
  to: number;
  nDays: number;
}

export interface Plan {
  legs: ResolvedLeg[];
  places: Place[];
  transitions: Transition[];
  events: PlanEvent[];
  startAt: number;
  nDays: number;
  noShift: boolean;
  preflight: Preflight | null;
  /** Tramos de estancia ya adaptada, tras los primeros días y antes del siguiente cambio:
      no generan consejos día a día ("mantén tus horarios de siempre"). */
  steady: SteadyRange[];
  /* Atajos del primer cambio (compatibilidad con el prototipo). */
  dep: number;
  arr: number;
  delta: number;
  E: number;
  W: number;
  dir: Dir;
  total: number;
  rate: number;
}

export const RATES = { soft: { a: 0.75, d: 1 }, normal: { a: 1, d: 1.5 }, strong: { a: 1.5, d: 2 } };
export const MODES: Record<Mode, { pre: number; rates: { a: number; d: number } }> = {
  subtle: { pre: 3, rates: RATES.soft },
  abrupt: { pre: 1, rates: RATES.strong },
};
const LAYOVER_H = 12, SHORT_STAY_H = 48, MAX_DAYS = 120, EPS = 1e-6;
export const ARRIVAL_DAYS = 3;

function classifyStay(hours: number): StayKind {
  return hours < LAYOVER_H ? 'layover' : hours <= SHORT_STAY_H ? 'short' : 'long';
}

export function resolveLegs(legs: LegInput[]): ResolvedLeg[] {
  if (!legs.length) throw new Error('El viaje necesita al menos un vuelo.');
  const out: ResolvedLeg[] = legs.map((l, i) => {
    const dur = Number(l.dur);
    if (!(dur > 0)) throw new Error(i === 0 ? 'Indica la duración del vuelo en horas.' : `Indica la duración del vuelo ${i + 1}.`);
    const dep = typeof l.dep === 'number' ? l.dep : localStringToUtc(l.fromTz, l.dep);
    return { fromTz: l.fromTz, toTz: l.toTz, dep, arr: dep + dur * H, dur, stay: null, anchor: true };
  });
  for (let i = 0; i < out.length - 1; i++) {
    const hours = (out[i + 1].dep - out[i].arr) / H;
    if (hours < 0) throw new Error(`El vuelo ${i + 2} sale antes de que llegue el vuelo ${i + 1}.`);
    const kind = classifyStay(hours);
    out[i].stay = { kind, hours };
    out[i].anchor = kind === 'long' || (kind === 'short' && !!legs[i].adapt);
  }
  out[out.length - 1].anchor = true;
  return out;
}

export function placesOf(legs: ResolvedLeg[]): Place[] {
  const places: Place[] = [{ tz: legs[0].fromTz, from: -Infinity, to: legs[0].arr, leg: -1, kind: 'origin' }];
  legs.forEach((l, i) => places.push({
    tz: l.toTz, from: l.arr, to: i + 1 < legs.length ? legs[i + 1].arr : Infinity, leg: i, kind: l.stay ? l.stay.kind : 'final',
  }));
  return places;
}

export function planTrip(inp: TripInput): Plan {
  const MODE = MODES[inp.mode ?? 'subtle'] ?? MODES.subtle;
  const r = MODE.rates, pre = MODE.pre;
  const legs = resolveLegs(inp.legs);
  const places = placesOf(legs);
  const startAt = inp.startAt ?? -Infinity;
  const bedMin = parseHM(inp.bed), wakeMin = parseHM(inp.wake);
  const cbtMin = wakeMin - 150;
  const G = mod(cbtMin - bedMin, 1440) / 60; // horas de acostarse a CBTmin
  const meals = (inp.meals ?? []).map(m => ({ key: m.key, off: mod(parseHM(m.time) - wakeMin, 1440) / 60 }));
  const cutoff = +(inp.cutoff ?? 8) || 8;

  /* Grupos de tramos que terminan en un destino objetivo → transiciones. */
  const transitions: Transition[] = [];
  let s = 0;
  legs.forEach((l, k) => {
    if (!l.anchor) return;
    const first = legs[s];
    const [y, m, d] = ymdInTz(first.fromTz, first.dep);
    let switchAt = localToUtc(first.fromTz, y, m, d - pre, 12, 0);
    const prev = transitions[transitions.length - 1];
    if (prev) switchAt = Math.max(switchAt, prev.arr);
    transitions.push({
      index: transitions.length, fromTz: first.fromTz, toTz: l.toTz, legFrom: s, legTo: k,
      dep: first.dep, arr: l.arr, switchAt, dir: 'adv', total: 0, rate: r.a, E: 0, W: 0, signed: 0, achievedBeforeDep: 0,
    });
    s = k + 1;
  });

  const fromTz0 = legs[0].fromTz;
  const lastArr = legs[legs.length - 1].arr;
  const events: PlanEvent[] = [];
  const push = (e: Omit<PlanEvent, 'id'>, id: string) => events.push({ id, ...e, ...(e.end <= startAt ? { beforeStart: true } : {}) });

  /* Primer día de la cadena: el día nominal (salida − pre) o el día en que empieza el plan. */
  const [dy, dm, dd] = ymdInTz(fromTz0, legs[0].dep);
  let T0 = localToUtc(fromTz0, dy, dm, dd - pre, 0, cbtMin);
  if (Number.isFinite(startAt)) {
    const [sy, sm, sd] = ymdInTz(fromTz0, startAt);
    const Ts = localToUtc(fromTz0, sy, sm, sd, 0, cbtMin);
    if (Ts > T0) T0 = Ts;
  }

  /* 1) Cadena de CBTmin. */
  interface Day { T: number; Tn: number; TnPlan: number; step: number; planned: number; dir: Dir | null; snap: boolean; tr: number; remBefore: number; remAfter: number; phiAfter: number }
  const days: Day[] = [];
  const phi0 = tzOffsetMs(fromTz0, T0) / H;
  let T = T0, phi = phi0;
  const started = new Set<number>();
  for (let j = 0; j < MAX_DAYS; j++) {
    const guess = T + DAY;
    let g = -1;
    for (const t of transitions) if (t.switchAt <= guess) g = t.index;
    const tr = g >= 0 ? transitions[g] : null;
    const targetTz = tr ? tr.toTz : fromTz0;
    const phiStar = tzOffsetMs(targetTz, guess) / H;
    let a = mod(phiStar - phi, 24), d = mod(phi - phiStar, 24);
    if (a < EPS || d < EPS) { a = 0; d = 0; }

    if (tr && !started.has(g)) {
      started.add(g);
      tr.E = a; tr.W = a === 0 ? 0 : d;
      const forced = g === 0 && (inp.dir === 'adv' || inp.dir === 'del') ? inp.dir : null;
      tr.dir = forced ?? (a / r.a <= d / r.d ? 'adv' : 'del');
      tr.total = tr.dir === 'adv' ? tr.E : tr.W;
      tr.rate = tr.dir === 'adv' ? r.a : r.d;
      tr.signed = tr.E <= 12 ? tr.E : tr.E - 24;
    }
    let dir: Dir | null = null, rem = 0;
    if (a > 0) {
      const main: Dir = tr ? tr.dir : (a <= d ? 'adv' : 'del');
      const mainRem = main === 'adv' ? a : d, otherRem = main === 'adv' ? d : a;
      // Un salto pequeño en sentido contrario (cambio de hora) se corrige por el camino corto.
      if (otherRem < mainRem && otherRem <= 1 + EPS) { dir = main === 'adv' ? 'del' : 'adv'; rem = otherRem; }
      else { dir = main; rem = mainRem; }
    }
    const prev = days[days.length - 1];
    // Ya adaptado y cambia la hora oficial (horario de verano): se sigue al reloj local sin más.
    // Un cambio nuevo de destino nunca es "seguir el reloj": siempre se ajusta al ritmo del modo.
    const newTr = !prev || prev.tr !== g;
    const snap = rem > 0 && rem <= 1 + EPS && !!prev && prev.remAfter === 0 && !newTr;
    const rate = dir === 'adv' ? r.a : r.d;
    const planned = snap ? rem : Math.min(rate, rem);
    const sgn = dir === 'adv' ? 1 : dir === 'del' ? -1 : 0;
    const TnPlan = T + DAY - sgn * planned * H;
    // Lo que de verdad se movió ese día según el registro (la cadena sigue desde ahí).
    const f = snap || !dir ? 1 : compliance(inp.log, j, dir, planned, TnPlan - G * H);
    const step = planned * f;
    const Tn = T + DAY - sgn * step * H;
    phi += sgn * step;
    days.push({ T, Tn, TnPlan, step, planned, dir: planned > 0 ? dir : null, snap, tr: g, remBefore: snap ? 0 : rem, remAfter: snap || rem - step < EPS ? 0 : rem - step, phiAfter: phi });
    T = Tn;
    const day = days[days.length - 1];
    const allSwitched = transitions.every(t => t.switchAt <= day.T);
    // Se generan al menos ARRIVAL_DAYS días completos tras la última llegada (rutina de los primeros días).
    const covered = day.T > lastArr + ARRIVAL_DAYS * DAY;
    if (day.remBefore === 0 && day.remAfter === 0 && covered && allSwitched) break;
    if (transitions.every(t => t.total === 0) && allSwitched && day.T > lastArr) break;
  }

  const noShift = transitions.every(t => t.total === 0);

  /* Resumen por transición (lo necesitan los pasos siguientes). */
  for (const t of transitions) {
    const own = days.filter(dd2 => dd2.tr === t.index);
    const firstShift = own.find(dd2 => dd2.remBefore > 0);
    t.startDay = firstShift?.T;
    const doneDay = own.find(dd2 => firstShift && dd2.T > firstShift.T && dd2.remBefore === 0);
    t.adaptedAt = doneDay?.T;
    t.achievedBeforeDep = own.filter(dd2 => !dd2.snap && dd2.Tn < t.dep).reduce((acc, dd2) => acc + dd2.step, 0);
  }


  /* 2) Días "de mantenimiento": estancia ya adaptada, pasados los primeros días tras
     llegar y antes de empezar a preparar el siguiente vuelo. */
  const steadyDay = new Set<number>();
  const steady: SteadyRange[] = [];
  transitions.forEach((t, i) => {
    const next = transitions[i + 1];
    if (!next || next.startDay == null) return;
    const [ay, am, ad] = ymdInTz(t.toTz, t.arr);
    const routineEnd = localToUtc(t.toTz, ay, am, ad + ARRIVAL_DAYS + 1, 0, 0);
    let run: number[] = [];
    const flush = () => {
      if (run.length) {
        const a = days[run[0]], z = days[run[run.length - 1]];
        steady.push({ tr: t.index, tz: t.toTz, from: a.T + 2.5 * H, to: z.TnPlan + 2.5 * H, nDays: run.length });
        run.forEach(j => steadyDay.add(j));
      }
      run = [];
    };
    days.forEach((d, j) => {
      // La noche de un cambio de hora (snap) también cuenta: sigues tu horario en hora local.
      const ok = d.tr === t.index && d.remBefore === 0 && d.remAfter === 0 && (d.planned === 0 || d.snap)
        && d.T + 2.5 * H >= routineEnd && d.T + 2.5 * H >= t.arr && d.Tn <= next.startDay!;
      if (ok) run.push(j); else flush();
    });
    flush();
  });

  /* 3) Eventos de cada día. */
  if (!noShift) {
    days.forEach((dy2, j) => {
      if (steadyDay.has(j)) return;
      const prevDay = days[j - 1];
      const stepIn = prevDay && !prevDay.snap ? prevDay.planned : 0;
      const stepOut = dy2.snap ? 0 : dy2.planned;
      const adapted = dy2.remBefore === 0 && dy2.remAfter === 0 && dy2.planned === 0;
      const dirDay: Dir | null = stepOut > 0 ? dy2.dir : stepIn > 0 ? prevDay!.dir : null;
      const tr = dy2.tr >= 0 ? dy2.tr : undefined;
      const base = { j, adapted, tr };
      const wake = dy2.T + 2.5 * H;
      // Los consejos del día usan lo previsto; lo conseguido de verdad mueve los días siguientes.
      const bed = dy2.TnPlan - G * H;
      const wakeNext = dy2.TnPlan + 2.5 * H;
      push({ ...base, type: 'sleep', start: bed, end: wakeNext, shiftNow: Math.round((dy2.phiAfter - phi0) * 100) / 100 }, `${j}:sleep`);
      if (adapted || !dirDay) {
        push({ ...base, type: 'light-seek', start: wake, end: wake + 2 * H, maintain: true }, `${j}:light-seek`);
      } else if (dirDay === 'adv') {
        push({ ...base, dir: dirDay, type: 'light-seek', start: wake, end: wake + 3 * H }, `${j}:light-seek`);
        push({ ...base, dir: dirDay, type: 'light-avoid', start: bed - 3 * H, end: bed }, `${j}:light-avoid`);
      } else {
        push({ ...base, dir: dirDay, type: 'light-avoid', start: wake, end: wake + 3 * H }, `${j}:light-avoid`);
        push({ ...base, dir: dirDay, type: 'light-seek', start: bed - 3 * H, end: bed }, `${j}:light-seek`);
      }
      const lastCoffee = bed - cutoff * H;
      if (lastCoffee - wake >= H) {
        push({ ...base, type: 'caffeine-ok', start: wake, end: lastCoffee }, `${j}:caffeine-ok`);
        push({ ...base, type: 'caffeine-avoid', start: lastCoffee, end: wakeNext }, `${j}:caffeine-avoid`);
      } else push({ ...base, type: 'caffeine-no', start: wake, end: bed }, `${j}:caffeine-no`);
      for (const m of meals) {
        const t = wake + m.off * H;
        if (t < bed) push({ ...base, type: 'meal', start: t, end: t, meal: m.key, gapBed: (bed - t) / H }, `${j}:meal:${m.key}`);
      }
      push({ ...base, type: 'sugar-no', start: bed - 4 * H, end: wakeNext }, `${j}:sugar-no`);
      if (inp.melatonin && dirDay === 'adv' && !adapted) {
        push({ ...base, type: 'melatonin', start: bed - 4 * H, end: bed - 4 * H }, `${j}:melatonin`);
      }
    });
  }
  legs.forEach((l, i) => {
    push({ j: -1, leg: i, type: 'flight-dep', start: l.dep, end: l.dep }, `leg${i}:dep`);
    push({ j: -1, leg: i, type: 'flight-arr', start: l.arr, end: l.arr }, `leg${i}:arr`);
  });
  events.sort((x, y) => x.start - y.start || x.end - y.end);

  const t0 = transitions[0];
  let preflight: Preflight | null = null;
  if (Number.isFinite(startAt) && t0.total > 0) {
    const hoursLeft = (legs[0].dep - startAt) / H;
    const subtle = (inp.mode ?? 'subtle') === 'subtle';
    preflight = {
      hoursLeft, achieved: t0.achievedBeforeDep, total: t0.total, remaining: Math.max(0, t0.total - t0.achievedBeforeDep),
      short: subtle && hoursLeft < 72, suggestAbrupt: subtle && hoursLeft < 24,
    };
  }

  return {
    legs, places, transitions, events, startAt, nDays: noShift ? 0 : days.length, noShift, preflight, steady,
    dep: legs[0].dep, arr: t0.arr, delta: t0.signed, E: t0.E, W: t0.W, dir: t0.dir, total: t0.total, rate: t0.rate,
  };
}

/** Compatibilidad: plan de un solo tramo con la firma del prototipo. */
export function plan(inp: SingleInput): Plan {
  const { originTz, destTz, dep, dur, ...rest } = inp;
  return planTrip({ ...rest, legs: [{ fromTz: originTz, toTz: destTz, dep, dur }] });
}

/** Lugar donde estás en el instante `t` (durante un vuelo, el de salida). */
export function placeAt(places: Place[], t: number): Place {
  for (let i = places.length - 1; i >= 0; i--) if (t >= places[i].from) return places[i];
  return places[0];
}

export interface RoutineDay {
  /** 0 = día de llegada (desde la hora de llegada); 1…n = días completos siguientes. */
  n: number;
  tz: string;
  /** Medianoche local del día (o la hora de llegada en el día 0) y medianoche siguiente. */
  from: number;
  to: number;
  events: PlanEvent[];
}

/** Rutina de los primeros días tras llegar al destino de una transición (ida o vuelta),
    agrupada por días locales del destino. Se corta si sales antes hacia otro sitio. */
export function arrivalRoutine(p: Plan, trIndex: number, days = ARRIVAL_DAYS): RoutineDay[] {
  const t = p.transitions[trIndex];
  if (!t) return [];
  const tz = t.toTz;
  const next = p.legs[t.legTo + 1];
  const limit = next ? next.dep : Infinity;
  const [y, m, d] = ymdInTz(tz, t.arr);
  const out: RoutineDay[] = [];
  for (let n = 0; n <= days; n++) {
    const mid = localToUtc(tz, y, m, d + n, 0, 0), nxt = localToUtc(tz, y, m, d + n + 1, 0, 0);
    const from = n === 0 ? t.arr : mid, to = Math.min(nxt, limit);
    if (to <= from) break;
    const events = p.events.filter(e => e.type !== 'flight-dep' && e.type !== 'flight-arr' &&
      (e.start === e.end ? e.start >= from && e.start < to : e.start < to && e.end > from));
    out.push({ n, tz, from, to, events });
  }
  return out;
}
