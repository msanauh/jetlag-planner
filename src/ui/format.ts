export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtH = (x: number) => (Math.round(x * 100) / 100).toString().replace('.', ',');

const cache: Record<string, Intl.DateTimeFormat> = {};
const fmt = (k: string, tz: string, o: Intl.DateTimeFormatOptions) => (cache[k + tz] ??= new Intl.DateTimeFormat('es-ES', { timeZone: tz, ...o }));
export const T = (tz: string) => fmt('t', tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const DL = (tz: string) => fmt('dl', tz, { weekday: 'long', day: 'numeric', month: 'long' });
export const DS = (tz: string) => fmt('ds', tz, { day: 'numeric', month: 'short' });
export const WD = (tz: string) => fmt('wd', tz, { weekday: 'short' });
export const DN = (tz: string) => fmt('dn', tz, { day: 'numeric' });
/** 'HH:MM' para un <input type="time">. */
export const HM = (tz: string, t: number) => T(tz).format(t);
