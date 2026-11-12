/* Avisos push: qué notificar y cuándo. Por defecto avisan 30 minutos antes
   ("En 30 minutos, vete a dormir"). Sin DOM: lo usan la app (para la lista de
   avisos y la suscripción) y el servidor de notificaciones. */
import { placeAt, type Plan, type PlanEvent } from './plan';
import { H, ymdInTz } from './time';

export type AlertCat = 'light' | 'caffeine' | 'sleep' | 'sugar' | 'meal' | 'melatonin' | 'flight';

export interface Alert {
  id: string;
  eventId: string;
  /** Instante en que se envía el aviso (UTC ms). */
  at: number;
  cat: AlertCat;
  title: string;
  body: string;
  /** 0 = más importante. Con el tope diario se descartan primero los de número alto. */
  priority: number;
}

export interface AlertOptions {
  cats: Record<AlertCat, boolean>;
  maxPerDay: number;
  /** Minutos de antelación. */
  leadMin: number;
  /** No se generan avisos anteriores a este instante. */
  now?: number;
  /** ¿Es de día en el lugar donde estás a esa hora? (para elegir el consejo de luz) */
  isDay?: (t: number) => boolean;
}

export const DEFAULT_ALERTS: AlertOptions = {
  cats: { light: true, caffeine: true, sleep: true, flight: true, melatonin: true, sugar: false, meal: false },
  maxPerDay: 6,
  leadMin: 30,
};

export const CAT_OF: Record<PlanEvent['type'], AlertCat | null> = {
  'light-seek': 'light', 'light-avoid': 'light', 'caffeine-ok': 'caffeine', 'caffeine-avoid': null, 'caffeine-no': 'caffeine',
  sleep: 'sleep', 'sugar-no': 'sugar', meal: 'meal', melatonin: 'melatonin', 'flight-dep': 'flight', 'flight-arr': 'flight',
};

const MEAL: Record<string, string> = { breakfast: 'el desayuno', lunch: 'la comida', dinner: 'la cena' };
const hrs = (ms: number) => String(Math.round(ms / H * 2) / 2).replace('.', ',');
const defaultIsDay = () => true;

/** Avisos que genera un evento, sin filtrar. */
export function alertsOfEvent(e: PlanEvent, o: Pick<AlertOptions, 'leadMin' | 'isDay'> = DEFAULT_ALERTS): Alert[] {
  const cat = CAT_OF[e.type];
  if (!cat) return [];
  const lead = o.leadMin * 60000;
  const pre = o.leadMin > 0 ? `En ${o.leadMin} minutos, ` : '';
  const say = (s: string) => pre ? pre + s : s.charAt(0).toUpperCase() + s.slice(1);
  const isDay = o.isDay ?? defaultIsDay;
  const a = (suffix: string, at: number, title: string, body: string, priority: number): Alert =>
    ({ id: `${e.id}:${suffix}`, eventId: e.id, at, cat, title, body, priority });
  const dur = hrs(e.end - e.start);
  switch (e.type) {
    case 'light-seek':
      if (e.maintain) return [a('start', e.start - lead, say('sal a la luz de la mañana'), `Unas ${dur} h de luz natural para fijar el reloj.`, 1)];
      return isDay(e.start)
        ? [a('start', e.start - lead, say('sal a la luz del sol'), `Durante ${dur} h, sin gafas de sol.`, 1)]
        : [a('start', e.start - lead, say('enciende luz fuerte'), `Fuera es de noche: lámpara blanca y pantalla con brillo alto durante ${dur} h.`, 1)];
    case 'light-avoid':
      return isDay(e.start)
        ? [a('start', e.start - lead, say('ponte gafas de sol para evitar la luz directa'), `Durante ${dur} h. Dentro, luz indirecta y sin pantallas.`, 1)]
        : [a('start', e.start - lead, say('pasa a luz tenue e indirecta'), `Durante ${dur} h. Evita pantallas, o ponlas en modo noche.`, 1)];
    case 'caffeine-ok':
      return [a('last', e.end - lead, say('ya no bebas más cafeína hoy'), 'Después, nada de cafeína hasta que te levantes.', 2)];
    case 'caffeine-no':
      return [a('start', e.start, 'Hoy, sin cafeína', 'Tu hora de dormir está demasiado cerca.', 2)];
    case 'sleep':
      return [
        a('start', e.start - lead, say('vete a dormir'), 'Deja ya las pantallas. Habitación oscura y fresca.', 0),
        // Durante el sueño solo se avisa al despertar, a la hora exacta.
        a('wake', e.end, 'Hora de levantarte', 'Arriba: luz y desayuno.', 0),
      ];
    case 'sugar-no':
      return [a('start', e.start - lead, say('se acabó el azúcar por hoy'), 'Si cenas, ligero.', 3)];
    case 'meal':
      return [a('start', e.start - lead, say(MEAL[e.meal ?? ''] ?? 'a comer'), 'Come a esta hora aunque no tengas mucha hambre.', 4)];
    case 'melatonin':
      return [a('start', e.start - lead, say('melatonina (si la usas)'), 'Dosis baja. Modelo simplificado, no es consejo médico.', 2)];
    case 'flight-dep':
      return [a('pre', e.start - 3 * H, 'Tu vuelo sale en 3 h', 'Al subir, pon el reloj en la hora del destino.', 1)];
    case 'flight-arr':
      return [];
  }
  return [];
}

/** Avisos del plan, filtrados por categoría, sin nada durante el sueño (salvo el
    despertar) y con un tope por día local. Ordenados por hora. */
export function alertsFor(p: Plan, opts: AlertOptions = DEFAULT_ALERTS): Alert[] {
  const now = opts.now ?? -Infinity;
  const sleeps = p.events.filter(e => e.type === 'sleep');
  const asleep = (t: number) => sleeps.some(s => t > s.start && t < s.end);
  const all = p.events
    .filter(e => !e.beforeStart)
    .flatMap(e => alertsOfEvent(e, opts))
    .filter(x => opts.cats[x.cat] && x.at >= now)
    .filter(x => x.id.endsWith(':wake') || !asleep(x.at));

  const byDay = new Map<string, Alert[]>();
  for (const x of all) {
    const tz = placeAt(p.places, x.at).tz;
    const key = ymdInTz(tz, x.at).join('-');
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(x);
  }
  const kept: Alert[] = [];
  for (const list of byDay.values()) {
    list.sort((x, y) => x.priority - y.priority || x.at - y.at);
    kept.push(...list.slice(0, Math.max(0, opts.maxPerDay)));
  }
  return kept.sort((x, y) => x.at - y.at);
}
