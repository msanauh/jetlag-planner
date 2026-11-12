/* Motor original del prototipo (src/core.js), sin cambios en `plan`.
   Solo se usa como referencia en tests/regression.test.ts. */
const H = 3600000, DAY = 86400000;
const _dtf = {};
function dtf(tz) {
  return _dtf[tz] || (_dtf[tz] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }));
}
function tzOffsetMs(tz, utc) {
  const p = {};
  dtf(tz).formatToParts(new Date(utc)).forEach(x => { p[x.type] = x.value; });
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(utc / 1000) * 1000;
}
function localToUtc(tz, y, m, d, h, min) {
  const g = Date.UTC(y, m - 1, d, h, min);
  const u = g - tzOffsetMs(tz, g);
  return g - tzOffsetMs(tz, u);
}
function parseDT(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) throw new Error('Fecha de salida no válida.');
  return m.slice(1, 6).map(Number);
}
function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m) throw new Error('Hora no válida.');
  return (+m[1]) * 60 + (+m[2]);
}
const RATES = { soft: { a: 0.75, d: 1 }, normal: { a: 1, d: 1.5 }, strong: { a: 1.5, d: 2 } };
export function plan(inp) {
  const MODE = { subtle: { pre: 3, rates: RATES.soft }, abrupt: { pre: 1, rates: RATES.strong } }[inp.mode] || { pre: 3, rates: RATES.soft };
  const r = MODE.rates;
  const [dy, dm, dd, dh, dmin] = parseDT(inp.dep);
  const dep = localToUtc(inp.originTz, dy, dm, dd, dh, dmin);
  const dur = Number(inp.dur);
  if (!(dur > 0)) throw new Error('Indica la duración del vuelo en horas.');
  const arr = dep + dur * H;
  const delta = (tzOffsetMs(inp.destTz, arr) - tzOffsetMs(inp.originTz, dep)) / H;
  const E = ((delta % 24) + 24) % 24;
  const W = E === 0 ? 0 : 24 - E;
  let dir = inp.dir;
  if (dir !== 'adv' && dir !== 'del') dir = (E / r.a <= W / r.d) ? 'adv' : 'del';
  const total = dir === 'adv' ? E : W;
  const rate = dir === 'adv' ? r.a : r.d;
  const out = { dep, arr, delta, E, W, dir, total, rate, events: [] };
  if (E === 0) { out.noShift = true; return out; }
  const bedMin = parseHM(inp.bed), wakeMin = parseHM(inp.wake);
  const cbtMin = wakeMin - 150;
  const G = ((((cbtMin - bedMin) % 1440) + 1440) % 1440) / 60;
  const pre = MODE.pre;
  const meals = (inp.meals || []).map(m => ({ key: m.key, off: ((((parseHM(m.time) - wakeMin) % 1440) + 1440) % 1440) / 60 }));
  const cutoff = +inp.cutoff || 8;
  const sgn = dir === 'adv' ? -1 : 1;
  const base = j => localToUtc(inp.originTz, dy, dm, dd - pre + j, 0, cbtMin);
  const shift = j => Math.min(j * rate, total);
  const T = j => base(j) + sgn * shift(j) * H;
  const jmax = Math.ceil(total / rate - 1e-9);
  const nDays = Math.min(21, Math.max(jmax + 1, Math.ceil((arr - base(0)) / DAY) + 1));
  out.jmax = jmax; out.nDays = nDays;
  const ev = (j, type, s, e, extra) => out.events.push(Object.assign({ j, type, start: s, end: e }, extra));
  for (let j = 0; j < nDays; j++) {
    const wake = T(j) + 2.5 * H;
    const bed = T(j + 1) - G * H;
    const wakeNext = T(j + 1) + 2.5 * H;
    const adapted = shift(j) >= total && shift(j + 1) >= total;
    const shiftNow = shift(j + 1);
    ev(j, 'sleep', bed, wakeNext, { adapted, shiftNow });
    if (adapted) {
      ev(j, 'light-seek', wake, wake + 2 * H, { adapted, maintain: true });
    } else if (dir === 'adv') {
      ev(j, 'light-seek', wake, wake + 3 * H, { adapted });
      ev(j, 'light-avoid', bed - 3 * H, bed, { adapted });
    } else {
      ev(j, 'light-avoid', wake, wake + 3 * H, { adapted });
      ev(j, 'light-seek', bed - 3 * H, bed, { adapted });
    }
    const lastCoffee = bed - cutoff * H;
    if (lastCoffee - wake >= 1 * H) { ev(j, 'caffeine-ok', wake, lastCoffee, { adapted }); ev(j, 'caffeine-avoid', lastCoffee, wakeNext, { adapted }); }
    else ev(j, 'caffeine-no', wake, bed, { adapted });
    meals.forEach(m => { const t = wake + m.off * H; if (t < bed) ev(j, 'meal', t, t, { meal: m.key, adapted, gapBed: (bed - t) / H }); });
    ev(j, 'sugar-no', bed - 4 * H, wakeNext, { adapted });
  }
  out.events.push({ j: -1, type: 'flight-dep', start: dep, end: dep });
  out.events.push({ j: -1, type: 'flight-arr', start: arr, end: arr });
  out.events.sort((a, b) => a.start - b.start);
  return out;
}
