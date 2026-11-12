/* Utilidades de tiempo. Todo el motor trabaja con instantes UTC (ms) y convierte
   a hora local con Intl, así los cambios de hora de verano se respetan. */

export const H = 3_600_000;
export const DAY = 86_400_000;

const dtfCache: Record<string, Intl.DateTimeFormat> = {};
function dtf(tz: string): Intl.DateTimeFormat {
  return (dtfCache[tz] ??= new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }));
}

/** Desfase de la zona `tz` respecto a UTC en el instante `utc`, en ms. */
export function tzOffsetMs(tz: string, utc: number): number {
  const p: Record<string, string> = {};
  for (const x of dtf(tz).formatToParts(new Date(utc))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(utc / 1000) * 1000;
}

/** Hora local (y, m 1-12, d, h, min) en `tz` → instante UTC. `d` puede desbordar. */
export function localToUtc(tz: string, y: number, m: number, d: number, h: number, min: number): number {
  const g = Date.UTC(y, m - 1, d, h, min);
  const u = g - tzOffsetMs(tz, g);
  return g - tzOffsetMs(tz, u);
}

/** Fecha local [y, m, d] del instante `utc` en `tz`. */
export function ymdInTz(tz: string, utc: number): [number, number, number] {
  const l = new Date(utc + tzOffsetMs(tz, utc));
  return [l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate()];
}

export function parseDT(s: string): [number, number, number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) throw new Error('Fecha de salida no válida.');
  return m.slice(1, 6).map(Number) as [number, number, number, number, number];
}

/** 'HH:MM' → minutos desde medianoche. */
export function parseHM(s: string | undefined): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m) throw new Error('Hora no válida.');
  return +m[1] * 60 + +m[2];
}

/** 'YYYY-MM-DDTHH:MM' en hora local de `tz` → instante UTC. */
export function localStringToUtc(tz: string, s: string): number {
  const [y, m, d, h, min] = parseDT(s);
  return localToUtc(tz, y, m, d, h, min);
}

export function hourInTz(tz: string, utc: number): number {
  const l = utc + tzOffsetMs(tz, utc);
  return (((l % DAY) + DAY) % DAY) / H;
}

export function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export const mod = (x: number, n: number) => ((x % n) + n) % n;
