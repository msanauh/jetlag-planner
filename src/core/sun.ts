import { DAY, H, mod } from './time';

export interface SunTimes { rise: number; set: number }

/** Amanecer y atardecer (instantes UTC) para una fecha local. Algoritmo astronómico
    simplificado (Almanac for Computers). Devuelve null en día o noche polar. */
export function sunTimes(lat: number, lon: number, y: number, m: number, d: number): SunTimes | null {
  const rad = Math.PI / 180;
  const N = Math.floor(275 * m / 9) - Math.floor((m + 9) / 12) * (1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3)) + d - 30;
  const lh = lon / 15;
  function calc(rising: boolean): number | null {
    const t = N + ((rising ? 6 : 18) - lh) / 24;
    const M = 0.9856 * t - 3.289;
    const L = mod(M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634, 360);
    let RA = mod(Math.atan(0.91764 * Math.tan(L * rad)) / rad, 360);
    RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    const Hh = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    return mod(Hh + RA - 0.06571 * t - 6.622 - lh, 24);
  }
  const r = calc(true), s = calc(false);
  if (r == null || s == null) return null;
  const base = Date.UTC(y, m - 1, d), noon = base + 12 * H - lh * H;
  let rise = base + r * H, set = base + s * H;
  while (rise > noon) rise -= DAY;
  while (rise < noon - DAY / 2) rise += DAY;
  while (set < noon) set += DAY;
  while (set > noon + DAY / 2) set -= DAY;
  return { rise, set };
}
