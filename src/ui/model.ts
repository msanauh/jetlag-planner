/* Modelo de la interfaz: viajes guardados, construcción del plan y textos. */
import { findCity, type City } from '../cities';
import { arrivalRoutine, placeAt, planTrip, type Plan, type PlanEvent, type TripInput } from '../core/plan';
import { sunTimes, type SunTimes } from '../core/sun';
import { H, hourInTz, localToUtc, ymdInTz } from '../core/time';
import { fmtH, T } from './format';

export type CitySnap = Pick<City, 'n' | 'c' | 'tz' | 'lat' | 'lon' | 'label'>;
export interface LegRaw { to: string; toCity?: CitySnap; date: string; time: string; dur: string; adapt?: boolean }
export interface TripRaw {
  v: 2;
  home: string; homeCity?: CitySnap;
  origin?: string; originCity?: CitySnap;
  bed: string; wake: string; mb: string; ml: string; md: string;
  legs: LegRaw[];
  mode: 'subtle' | 'abrupt';
  dir: 'auto' | 'adv' | 'del';
  cutoff: string;
  tzmode: string;
  melatonin?: boolean;
  /** Momento de creación: el plan empieza aquí. */
  startAt: number;
}
export interface Trip { id: string; raw: TripRaw }
/** Registro de un evento: hecho a la hora real `at`, o marcado como no hecho (`skipped`). */
export interface DoneRec { at: number; skipped?: boolean }
export type DoneMap = Record<string, Record<string, DoneRec>>;

export const snap = (c: City | CitySnap): CitySnap => ({ n: c.n, c: c.c, tz: c.tz, lat: c.lat, lon: c.lon, label: c.label });

/** Convierte un viaje del prototipo (un solo tramo) al formato con tramos. */
export function migrateTrip(t: { id: string; raw: any }): Trip {
  const r = t.raw ?? {};
  if (r.v === 2) return t as Trip;
  const dep = String(r.dep ?? '');
  const created = Number(t.id);
  return {
    id: t.id,
    raw: {
      v: 2, home: r.home, origin: r.origin || '', bed: r.bed, wake: r.wake, mb: r.mb, ml: r.ml, md: r.md,
      legs: [{ to: r.dest, date: dep.slice(0, 10), time: dep.slice(11, 16), dur: String(r.dur ?? '') }],
      mode: r.mode === 'abrupt' ? 'abrupt' : 'subtle', dir: r.dir || 'auto', cutoff: String(r.cutoff || '8'), tzmode: r.tzmode || 'auto',
      startAt: Number.isFinite(created) && created > 1e12 ? created : 0,
    },
  };
}

export interface Built {
  p: Plan;
  inp: TripInput;
  home: CitySnap;
  origin: CitySnap;
  /** Ciudad de cada lugar de `p.places` (0 = salida). */
  placeCity: CitySnap[];
  /** Destino de cada tramo. */
  legTo: CitySnap[];
  title: string;
}

function city(label: string | undefined, saved: CitySnap | undefined, err: string): CitySnap {
  if (saved) return saved;
  const c = findCity(label);
  if (!c) throw new Error(err);
  return snap(c);
}

export function build(raw: TripRaw, overrides: Partial<TripInput> = {}): Built {
  const home = city(raw.home, raw.homeCity, 'No encuentro tu ciudad. Elige una de la lista, por ejemplo Barcelona.');
  const origin = raw.origin ? city(raw.origin, raw.originCity, 'No encuentro la ciudad de salida. Elige una de la lista o déjala vacía.') : home;
  if (!raw.legs.length) throw new Error('Falta el destino.');
  const legTo = raw.legs.map((l, i) => city(l.to, l.toCity, i === 0 ? 'No encuentro la ciudad de destino. Elige una de la lista, por ejemplo Tokio.' : `No encuentro la ciudad del vuelo ${i + 1}.`));
  const legs = raw.legs.map((l, i) => {
    if (!l.date) throw new Error(i === 0 ? 'Elige la fecha de salida.' : `Elige la fecha del vuelo ${i + 1}.`);
    if (!l.time) throw new Error(i === 0 ? 'Indica la hora de salida.' : `Indica la hora de salida del vuelo ${i + 1}.`);
    return { fromTz: i === 0 ? origin.tz : legTo[i - 1].tz, toTz: legTo[i].tz, dep: `${l.date}T${l.time}`, dur: l.dur, adapt: l.adapt };
  });
  const inp: TripInput = {
    legs, bed: raw.bed, wake: raw.wake, mode: raw.mode, dir: raw.dir, cutoff: raw.cutoff, startAt: raw.startAt || undefined, melatonin: !!raw.melatonin,
    meals: [{ key: 'breakfast', time: raw.mb }, { key: 'lunch', time: raw.ml }, { key: 'dinner', time: raw.md }],
    ...overrides,
  };
  const p = planTrip(inp);
  const names = [origin, ...legTo].map(c => c.n);
  const title = names.length > 3 ? `${names[0]} → ${names[1]} → … → ${names.at(-1)}` : names.join(' → ');
  return { p, inp, home, origin, placeCity: [origin, ...legTo], legTo, title };
}

/* ---------- lugares, zonas horarias y sol ---------- */
export function placeIndex(b: Built, t: number): number { return b.p.places.indexOf(placeAt(b.p.places, t)); }
export function cityAt(b: Built, t: number): CitySnap { return b.placeCity[placeIndex(b, t)]; }

/** Zona en la que mostrar un instante según el selector: donde estés, casa, o una ciudad concreta. */
export function tzFor(b: Built, tzmode: string, t: number): string {
  if (tzmode === 'origin') return b.origin.tz;
  if (tzmode === 'dest') return b.legTo[b.p.transitions[0].legTo].tz;
  if (tzmode.startsWith('tz:')) return tzmode.slice(3);
  return cityAt(b, t).tz;
}
export function sunAt(c: CitySnap, t: number): SunTimes | null {
  const [y, m, d] = ymdInTz(c.tz, t);
  return sunTimes(c.lat, c.lon, y, m, d);
}
export function isDayAt(b: Built, t: number): boolean {
  const c = cityAt(b, t), s = sunAt(c, t);
  if (s) return t >= s.rise && t <= s.set;
  const h = hourInTz(c.tz, t);
  return h >= 7 && h < 18;
}
export function inFlight(p: Plan, t: number): boolean { return p.legs.some(l => t >= l.dep && t < l.arr); }

/* ---------- estados ---------- */
export const markable = (e: PlanEvent) => e.type !== 'flight-dep' && e.type !== 'flight-arr';
export interface Status { past: boolean; done: DoneRec | null; skipped: boolean; missed: boolean; before: boolean }
export function statusOf(e: PlanEvent, now: number, done: Record<string, DoneRec> | undefined): Status {
  const past = e.end <= now;
  const rec = done?.[e.id] ?? null;
  const skipped = !!rec?.skipped;
  return { past, done: rec && !skipped ? rec : null, skipped, before: !!e.beforeStart, missed: past && !rec && !e.beforeStart && markable(e) };
}
export function statusClass(s: Status): string {
  // Pasado o anterior al plan: atenuado. Hecho: tachado con check. Sin marcar o no hecho: solo atenuado.
  return (s.past || s.before ? ' is-past' : '') + (s.done ? ' is-done' : '') + (s.skipped ? ' is-skipped' : '');
}
/** 'HH:MM' en `tz` → el instante más cercano a `near` con esa hora local (sirve si cruzas la medianoche). */
export function timeNear(tz: string, hm: string, near: number): number {
  const [hh, mm] = hm.split(':').map(Number);
  const [y, m, d] = ymdInTz(tz, near);
  let best = NaN;
  for (const k of [-1, 0, 1]) {
    const t = localToUtc(tz, y, m, d + k, hh, mm);
    if (!(Math.abs(t - near) >= Math.abs(best - near))) best = t;
  }
  return best;
}

/* ---------- textos de cada consejo ---------- */
export const CAT: Record<string, string> = {
  'caffeine-avoid': 'caffeine', sleep: 'sleep', 'light-seek': 'light', 'light-avoid': 'light', 'caffeine-ok': 'caffeine', 'caffeine-no': 'caffeine',
  'sugar-no': 'sugar', meal: 'meal', melatonin: 'melatonin', 'flight-dep': 'flight', 'flight-arr': 'flight',
};
export const SHORT: Record<string, string> = {
  'caffeine-avoid': 'Sin cafeína', sleep: 'Dormir', 'light-seek': 'Luz fuerte', 'light-avoid': 'Evitar luz', 'caffeine-ok': 'Cafeína', 'caffeine-no': 'Sin cafeína',
  'sugar-no': 'Sin azúcar', melatonin: 'Melatonina', 'flight-dep': 'Salida', 'flight-arr': 'Llegada',
};
export const MEALN: Record<string, string> = { breakfast: 'Desayuno', lunch: 'Comida', dinner: 'Cena' };
export const titleOf = (e: PlanEvent) => e.type === 'meal' ? MEALN[e.meal ?? ''] : SHORT[e.type];

export interface Desc { cls: string; chip: string; title: string; detail: string }
export function describe(ev: PlanEvent, tz: string, b: Built, sun: SunTimes | null): Desc {
  const { p } = b;
  const mid = (ev.start + ev.end) / 2;
  const sunny = sun ? mid >= sun.rise && mid <= sun.set : isDayAt(b, mid);
  const fl = inFlight(p, ev.start);
  const arrived = p.legs.some(l => ev.start >= l.arr);
  switch (ev.type) {
    case 'sleep': {
      const overlap = p.legs.some(l => ev.start < l.arr && ev.end > l.dep);
      let d = overlap ? 'Coincide con el vuelo: antifaz, tapones y duerme en el avión.' : 'Habitación oscura y fresca. Deja las pantallas un rato antes.';
      if (!overlap && arrived && !ev.adapted && (sun ? ev.start >= sun.rise && ev.start <= sun.set : isDayAt(b, ev.start))) d = 'Aquí será de día: persianas bajadas y antifaz.';
      return { cls: 't-sleep', chip: 'Sueño', title: 'Dormir', detail: d };
    }
    case 'light-seek':
      if (ev.maintain) return { cls: 't-light', chip: 'Luz', title: 'Luz de la mañana', detail: 'Luz natural al levantarte para fijar el reloj.' };
      if (fl) return { cls: 't-light', chip: 'Luz', title: 'Busca luz fuerte', detail: 'En el avión: ventanilla abierta si hay sol fuera, o luz de lectura y pantalla con brillo alto.' };
      return { cls: 't-light', chip: 'Luz', title: 'Busca luz fuerte', detail: sunny ? 'Hay sol: sal a la calle sin gafas de sol, o siéntate junto a una ventana.' : 'Fuera es de noche: luz interior intensa (lámpara blanca fría, pantalla a tope y cerca).' };
    case 'light-avoid':
      if (fl) return { cls: 't-stop', chip: 'Luz', title: 'Evita la luz fuerte', detail: 'En el avión: antifaz o ventanilla cerrada y luz tenue. Sin pantallas, o con el brillo al mínimo.' };
      return { cls: 't-stop', chip: 'Luz', title: 'Evita la luz fuerte', detail: sunny ? 'Hay sol: gafas de sol si sales y, dentro, luz tenue e indirecta. Evita pantallas.' : 'Luz tenue e indirecta. Evita pantallas; si las usas, modo noche y brillo al mínimo.' };
    case 'caffeine-ok':
      return { cls: 't-coffee', chip: 'Cafeína', title: 'Cafeína permitida', detail: 'Último café a las ' + T(tz).format(ev.end) + '. Mejor en dosis pequeñas.' };
    case 'caffeine-avoid':
      return { cls: 't-stop', chip: 'Cafeína', title: 'Sin cafeína', detail: 'Desde aquí, nada de cafeína hasta que te levantes.' };
    case 'caffeine-no':
      return { cls: 't-stop', chip: 'Cafeína', title: 'Sin cafeína', detail: 'Tu hora de dormir está demasiado cerca para tomarla.' };
    case 'sugar-no':
      return { cls: 't-stop', chip: 'Azúcar', title: 'Sin azúcar', detail: 'Nada de dulces ni snacks; si cenas, ligero.' };
    case 'melatonin':
      return { cls: 't-mel', chip: 'Melatonina', title: 'Melatonina', detail: 'Opcional. Si la usas, dosis baja (0,5 mg) a esta hora. Es un modelo simplificado, no consejo médico: consúltalo con tu médico.' };
    case 'meal': {
      const f = fl ? 'En el avión: pide el servicio a esta hora o llévate algo. ' : '';
      if (ev.meal === 'breakfast') return { cls: 't-meal', chip: 'Comida', title: 'Desayuno', detail: f + 'Contundente, con carbohidratos y algo de azúcar: ayuda a tu reloj a ponerse en hora.' };
      if (ev.meal === 'lunch') return { cls: 't-meal', chip: 'Comida', title: 'Comida', detail: f + 'Comida principal con carbohidratos y proteína. El azúcar aún entra.' };
      return { cls: 't-meal', chip: 'Comida', title: 'Cena', detail: f + ((ev.gapBed ?? 9) < 3 ? 'Te quedan solo ' + fmtH(ev.gapBed!) + ' h para dormir: hazla muy ligera o adelántala (lo ideal son 3 h).' : 'Ligera y sin azúcar.') };
    }
    case 'flight-dep': {
      const i = ev.leg ?? 0;
      return { cls: 't-flight', chip: 'Vuelo', title: 'Salida', detail: 'Hora de ' + b.placeCity[i].n + '. Ajusta el reloj al destino en cuanto subas.' };
    }
    case 'flight-arr':
      return { cls: 't-flight', chip: 'Vuelo', title: 'Llegada', detail: 'Hora de ' + b.legTo[ev.leg ?? 0].n + '.' };
  }
  return { cls: 't-stop', chip: '', title: ev.type, detail: '' };
}

/* ---------- resúmenes ---------- */
export const signedTxt = (s: number) => (s > 0 ? '+' : '') + fmtH(s) + ' h';
/** Días enteros (calendario local) entre dos instantes. */
export function daysBetween(tz: string, a: number, b: number): number {
  const [y1, m1, d1] = ymdInTz(tz, a), [y2, m2, d2] = ymdInTz(tz, b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
export { arrivalRoutine, H };
