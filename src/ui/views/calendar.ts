import type { PlanEvent, SteadyRange } from '../../core/plan';
import type { SunTimes } from '../../core/sun';
import { H, localToUtc, ymdInTz } from '../../core/time';
import { cap, DL, DN, DS, esc, fmtH, T, WD } from '../format';
import { icon, PILL } from '../icons';
import { CAT, cityAt, describe, statusClass, statusOf, sunAt, titleOf, tzFor, type Built, type CitySnap } from '../model';
import { app, curTrip, persist, S } from '../state';
import { tabs, onTab } from './tabs';
import { doneControls, doneUi, handleDone, handleDoneSubmit } from './done';

const HOUR = 44;
export const cal = {
  view: 1, idx: null as number | null, sel: null as number | null, scroll: null as number | null, panel: false, kbd: false,
  filters: { sleep: 1, meal: 1, light: 1, caffeine: 1, sugar: 1, melatonin: 1 } as Record<string, number>,
};
export function calReset(): void { cal.idx = null; cal.sel = null; cal.scroll = null; doneUi.editing = null; }

export interface Col {
  tz: string; mid: number; nxt: number; s: number; e: number; loc: CitySnap; sun: SunTimes | null;
  /** Bloque plegado de días "mantén tus horarios de siempre" (estancia ya adaptada). */
  steady?: SteadyRange; nDays?: number; last?: number;
}

export function buildColumns(b: Built, tzmode: string): Col[] {
  const { p } = b;
  const first = Math.min(...p.events.map(e => e.start)), last = Math.max(...p.events.map(e => e.end));
  const cols: Omit<Col, 'loc' | 'sun'>[] = [];
  const addRange = (tz: string, from: number, to: number, ws: number, we: number) => {
    if (!(to > from)) return;
    const [y, m, d] = ymdInTz(tz, from);
    for (let k = 0; k < 130; k++) {
      const mid = localToUtc(tz, y, m, d + k, 0, 0), nxt = localToUtc(tz, y, m, d + k + 1, 0, 0);
      if (mid >= to) break;
      const s = Math.max(mid, ws), e = Math.min(nxt, we);
      if (e > s) cols.push({ tz, mid, nxt, s, e });
    }
  };
  if (tzmode !== 'auto') addRange(tzFor(b, tzmode, first), first, last, -Infinity, Infinity);
  else for (const pl of p.places) addRange(pl.tz, Math.max(first, pl.from), Math.min(last, pl.to), pl.from, pl.to);
  // Los días de mantenimiento (estancia ya adaptada) se juntan en un único bloque.
  // Un mismo día no se repite al cambiar de zona (p. ej. el día de llegada): se queda una sola
  // columna, en la hora del destino. Lo anterior a la llegada se dibuja en la franja que le toca
  // en esa hora. Al ir al oeste no cabe entero: se pierden unas horas de la última noche en
  // origen (el sueño sigue viéndose, porque la cápsula continúa en la columna siguiente).
  const ymdKey = (c: { tz: string; mid: number }) => ymdInTz(c.tz, c.mid + 12 * H).join('-');
  const dedup: typeof cols = [];
  for (const z of cols) {
    const k = ymdKey(z);
    const i = dedup.findIndex(a => a.tz !== z.tz && ymdKey(a) === k);
    if (i >= 0) {
      z.s = Math.min(z.s, Math.max(dedup[i].s, z.mid));
      dedup.splice(i); // y las columnas de la zona anterior que venían detrás (horas en vuelo)
    }
    dedup.push(z);
  }
  cols.splice(0, cols.length, ...dedup);
  const out: Col[] = [];
  for (const c of cols) {
    const noon = c.mid + 12 * H;
    const r = p.steady.find(x => noon >= x.from && noon < x.to);
    const prev = out[out.length - 1];
    if (r && prev?.steady === r) { prev.e = c.e; prev.nxt = c.nxt; prev.nDays! += 1; prev.last = c.mid; continue; }
    // La ciudad de la columna es donde terminas el día (el día de llegada, el destino).
    const loc = cityAt(b, c.e - 1);
    out.push({ ...c, loc, sun: sunAt(loc, c.s + (c.e - c.s) / 2), ...(r ? { steady: r, nDays: 1, last: c.mid } : {}) });
  }
  return out;
}

/** Texto del bloque plegado: fechas y horario de siempre. */
export function steadyText(c: Col, raw: { bed: string; wake: string; mb: string; ml: string; md: string }) {
  const d = (t: number) => DS(c.tz).format(t + 12 * H);
  return {
    range: c.nDays! > 1 ? `${d(c.mid)} – ${d(c.last!)}` : d(c.mid),
    days: `${c.nDays} ${c.nDays === 1 ? 'día' : 'días'}`,
    sleep: `Duerme de ${raw.bed} a ${raw.wake}`,
    meals: `Comidas a las ${raw.mb}, ${raw.ml} y ${raw.md}`,
  };
}
export const inCol = (e: PlanEvent, c: { s: number; e: number }) => e.start === e.end ? e.start >= c.s && e.start < c.e : e.start < c.e && e.end > c.s;
function geom(e: PlanEvent, c: Col): [number, number] {
  const s = Math.max(0, (Math.max(e.start, c.s) - c.mid) / H);
  const en = Math.min(24, (Math.min(e.end, c.e) - c.mid) / H);
  return [s, Math.max(en, s + 0.45)];
}

export function viewCalendar(): void {
  const cc = curTrip(); if (!cc) { location.hash = 'viajes'; return; }
  const { trip, b, tzmode } = cc, { p } = b;
  const done = S.done[trip.id];
  const now = Date.now();
  const cols = buildColumns(b, tzmode);
  // En pantallas estrechas (móvil) la vista de 5 días no cabe: se queda en 3.
  // Siempre un día: la progresión de varios días está en Lista.
  cal.view = 1;
  const N = cal.view;
  if (cal.idx == null) { const i = cols.findIndex(c => now >= c.s && now < c.e); cal.idx = i >= 0 ? Math.max(0, i - (N > 1 ? 1 : 0)) : 0; }
  cal.idx = Math.max(0, Math.min(cal.idx, Math.max(0, cols.length - N)));
  const vis = cols.slice(cal.idx, cal.idx + N);
  const old = app().querySelector('.cal-scroll');
  const prevScroll = old ? old.scrollTop : cal.scroll;
  const rangeTxt = vis.length === 1 ? cap(WD(vis[0].tz).format(vis[0].mid + 12 * H).replace('.', '')) + ' ' + DS(vis[0].tz).format(vis[0].mid + 12 * H) : DS(vis[0].tz).format(vis[0].mid + 12 * H) + ' – ' + DS(vis[vis.length - 1].tz).format((vis[vis.length - 1].last ?? vis[vis.length - 1].mid) + 12 * H);
  const axisW = innerWidth < 520 ? 38 : 48;
  const colW = ((app().clientWidth || innerWidth) - axisW) / N;
  const pillW = Math.min((colW - 24) / 3 - 4, 52);
  const heads = vis.map(c => {
    if (c.steady) return `<div class="hc steady"><div class="wd">···</div><div class="dn">${c.nDays}</div><div class="ct">días en ${esc(c.loc.n)}</div></div>`;
    const dep = p.legs.some(l => l.dep >= c.s && l.dep < c.e), arr = p.legs.some(l => l.arr >= c.s && l.arr < c.e);
    const tag = dep ? '<span class="tg">Salida</span>' : arr ? '<span class="tg">Llegada</span>' : '';
    const mdt = c.mid + 12 * H;
    // Con un solo día la fecha ya está en la barra: aquí solo la ciudad (y Salida/Llegada).
    if (N === 1) return `<div class="hc one"><div class="ct">${esc(c.loc.n)}</div>${tag}</div>`;
    return `<div class="hc"><div class="wd">${esc(WD(c.tz).format(mdt).replace('.', ''))}</div><div class="dn">${esc(DN(c.tz).format(mdt))}</div><div class="ct">${esc(c.loc.n)}</div>${tag}</div>`;
  }).join('');

  // La salida, siempre en la hora del billete (la de la ciudad de salida).
  const depLabel = (e: PlanEvent, c: Col) => {
    const from = b.placeCity[e.leg ?? 0];
    return 'Salida · ' + T(from.tz).format(e.start) + (from.tz !== c.tz ? ' (' + esc(from.n) + ')' : '');
  };
  const hit: { ev: PlanEvent; col: Col }[] = [];
  const colsHTML = vis.map(c => {
    if (c.steady) {
      const t = steadyText(c, trip.raw);
      return `<div class="col steadycol" style="--hr:${HOUR}px;height:${24 * HOUR}px"><div class="steadycard"><b>Mantén tus horarios de siempre</b><span>${esc(t.range)}</span><span>${esc(t.sleep)}</span><span>${esc(t.meals)}</span><span>Luz natural por la mañana</span></div></div>`;
    }
    let h = `<div class="col" style="--hr:${HOUR}px;height:${24 * HOUR}px">`;
    if (c.sun) {
      const rise = Math.max(0, Math.min(24, (c.sun.rise - c.mid) / H)), set = Math.max(0, Math.min(24, (c.sun.set - c.mid) / H));
      h += `<div class="night" style="top:0;height:${rise * HOUR}px"></div><div class="night" style="top:${set * HOUR}px;height:${(24 - set) * HOUR}px"></div>`;
    }
    const vs = Math.max(0, Math.min(24, (c.s - c.mid) / H)), ve = Math.max(0, Math.min(24, (c.e - c.mid) / H));
    if (vs > 0) h += `<div class="void" style="top:0;height:${vs * HOUR}px"></div>`;
    if (ve < 24) h += `<div class="void" style="top:${ve * HOUR}px;height:${(24 - ve) * HOUR}px"></div>`;
    for (const l of p.legs) if (l.dep < c.e && l.arr > c.s) {
      const fs = Math.max(0, (Math.max(l.dep, c.s) - c.mid) / H), fe = Math.min(24, (Math.min(l.arr, c.e) - c.mid) / H);
      if (fe > fs) h += `<div class="fband" style="top:${fs * HOUR}px;height:${(fe - fs) * HOUR}px">${icon('plane')}En vuelo</div>`;
    }
    if (now >= c.s && now < c.e) h += `<div class="nowline" style="top:${(now - c.mid) / H * HOUR}px" aria-hidden="true"></div>`;
    const lanes = ['', '', ''];
    let strip = '', bands = '';
    for (const e of p.events) {
      if (!inCol(e, c)) continue;
      if (e.type === 'flight-dep' || e.type === 'flight-arr') {
        const y = (e.start - c.mid) / H * HOUR;
        bands += `<div class="tzband" style="top:${y - 13}px">${icon(e.type === 'flight-dep' ? 'takeoff' : 'land')}${e.type === 'flight-dep' ? depLabel(e, c) : 'Llegada · hora de ' + esc(b.legTo[e.leg ?? 0].n)}</div>`;
        continue;
      }
      const cat = CAT[e.type]; if (!cat || !cal.filters[cat]) continue;
      const [s, en] = geom(e, c), top = s * HOUR, hpx = (en - s) * HOUR;
      const k = hit.push({ ev: e, col: c }) - 1, sel = cal.sel === k ? ' sel' : '';
      const st = statusOf(e, now, done), stc = statusClass(st);
      const stateTxt = st.done ? ', hecho' : st.skipped ? ', no hecho' : st.missed ? ', no marcado' : st.past ? ', pasado' : '';
      const rng = e.start === e.end ? T(c.tz).format(e.start) : T(c.tz).format(e.start) + '–' + T(c.tz).format(e.end);
      const aria = esc(titleOf(e) + ', ' + rng + stateTxt);
      if (e.type === 'meal' || e.type === 'melatonin') {
        strip += `<button class="mk${e.type === 'melatonin' ? ' mel' : ''}${stc}${sel}" data-k="${k}" aria-label="${aria}" style="top:${top}px">${icon(st.done ? 'check' : e.type === 'meal' ? 'fork' : 'pill')}</button>`;
      } else if (e.type === 'sugar-no') {
        strip += `<button class="pill p-avoid o-sugar sg${stc}${sel}" data-k="${k}" aria-label="${aria}" style="top:${top}px;height:${hpx}px">${st.done ? icon('check') : icon('cube', 1)}</button>`;
      } else {
        const pl = PILL[e.type]; if (!pl) continue;
        let lab = '';
        if (pillW >= 34 && hpx >= 84) lab = e.type === 'sleep' || e.type === 'caffeine-ok' ? 'Hasta ' + T(c.tz).format(e.end) : fmtH(Math.round((e.end - e.start) / H * 2) / 2) + ' h';
        lanes[pl[0]] += `<button class="pill ${pl[1]}${pillW < 26 ? ' sm-ic' : ''}${stc}${sel}" data-k="${k}" aria-label="${aria}" style="top:${top}px;height:${hpx}px">${st.done ? icon('check') : icon(pl[2], pl[3])}${lab ? '<span>' + esc(lab) + '</span>' : ''}</button>`;
      }
    }
    h += lanes.map((x, i) => `<div class="lane" style="left:calc((100% - 24px)/3*${i});width:calc((100% - 24px)/3)">${x}</div>`).join('') + `<div class="strip">${strip}</div>${bands}`;
    return h + '</div>';
  }).join('');
  const axis = `<div class="axis" style="width:${axisW}px;height:${24 * HOUR}px">` + Array.from({ length: 12 }, (_, i) => `<span style="top:${i * 2 * HOUR}px">${String(i * 2).padStart(2, '0')}:00</span>`).join('') + '</div>';

  const filtDefs: [string, string, string][] = [['sleep', 'Sueño', 'var(--p-sleep)'], ['meal', 'Comidas', 'var(--meal)'], ['light', 'Luz', 'var(--p-light)'], ['caffeine', 'Cafeína', 'var(--p-coffee)'], ['sugar', 'Azúcar', 'var(--o-sugar)']];
  if (trip.raw.melatonin) filtDefs.push(['melatonin', 'Melatonina', 'var(--mel)']);
  const filt = filtDefs.map(f => `<button class="fchip" data-filter="${f[0]}" aria-pressed="${cal.filters[f[0]] ? 'true' : 'false'}"><i style="background:${f[2]}"></i>${f[1]}</button>`).join('');

  let sheet = '';
  if (cal.sel != null && hit[cal.sel]) {
    const { ev, col } = hit[cal.sel], d = describe(ev, col.tz, b, col.sun);
    const title = ev.type === 'meal' ? titleOf(ev) : d.title;
    const when = cap(DL(col.tz).format(ev.start)) + ' · ' + (ev.start === ev.end ? T(col.tz).format(ev.start) : T(col.tz).format(ev.start) + ' – ' + T(col.tz).format(ev.end)) + ' (' + col.loc.n + ')';
    const st = statusOf(ev, now, done);
    const note = st.before ? '<p class="tm">Antes de empezar el plan.</p>' : st.missed ? '<p class="tm">Ya pasó y no lo marcaste.</p>' : '';
    sheet = `<div class="sheet" role="dialog" aria-modal="false" aria-label="${esc(title)}"><div class="row1"><div style="flex:1"><span class="chip ${d.cls}">${esc(d.chip)}</span><h3>${esc(title)}</h3><div class="tm">${esc(when)}</div></div><button class="ib" data-act="closesheet" aria-label="Cerrar">✕</button></div><p>${esc(d.detail)}</p>${note}${doneControls(trip.id, ev, col.tz)}</div>`;
  }
  const tzOpts: [string, string][] = [['auto', 'Hora de donde estés'], ['origin', 'Hora de ' + b.origin.n]];
  const seen = new Set([b.origin.tz]);
  b.legTo.forEach(c => { if (!seen.has(c.tz)) { seen.add(c.tz); tzOpts.push(['tz:' + c.tz, 'Hora de ' + c.n]); } });
  const tzSel = `<select id="tzmode" aria-label="Zona horaria de las horas">${tzOpts.map(o => `<option value="${esc(o[0])}"${tzmode === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;

  app().innerHTML = `<div class="cal"><div class="bar"><div class="r1"><div class="ttl"><b>${esc(b.title)}</b></div></div>
    <div class="r2"><button class="ib" data-act="prev" aria-label="Anterior"${cal.idx === 0 ? ' disabled' : ''}>‹</button><div class="range" aria-live="polite">${esc(rangeTxt)}</div><button class="ib" data-act="next" aria-label="Siguiente"${cal.idx + N >= cols.length ? ' disabled' : ''}>›</button><button class="ib sm" data-act="today">Hoy</button><button class="ib sm" data-act="flight">Vuelo</button><button class="ib sm" data-act="panel" aria-expanded="${cal.panel}">Filtros</button></div></div>
    ${cal.panel ? `<div class="panel">${filt}${tzSel}</div>` : ''}
    <div class="cal-scroll"><div class="cal-head"><div class="gap" style="width:${axisW}px"></div>${heads}</div><div class="cal-body">${axis}${colsHTML}</div></div>${sheet}${tabs('calendario')}</div>`;

  const sc = app().querySelector<HTMLElement>('.cal-scroll')!;
  sc.scrollTop = prevScroll != null ? prevScroll : 6 * HOUR - 16;
  sc.addEventListener('scroll', () => { cal.scroll = sc.scrollTop; }, { passive: true });
  if (cal.kbd) {
    cal.kbd = false;
    const target = cal.sel != null ? app().querySelector<HTMLElement>('.sheet [data-done], .sheet .ib') : null;
    target?.focus();
  }

  const find = (id: string) => { const e = p.events.find(x => x.id === id); return e ? { e, tz: tzFor(b, tzmode, e.start) } : null; };
  const focusPill = (k: number | null) => { if (k != null) app().querySelector<HTMLElement>(`[data-k="${k}"]`)?.focus(); };
  app().onclick = e => {
    if (onTab(e)) return;
    const t = e.target as Element;
    if (handleDone(t, trip.id, find, viewCalendar)) return;
    const pill = t.closest<HTMLElement>('[data-k]');
    if (pill) { const k = +pill.dataset.k!; cal.sel = k === cal.sel ? null : k; doneUi.editing = null; cal.kbd = (e as MouseEvent).detail === 0; return viewCalendar(); }
    const btn = t.closest<HTMLButtonElement>('button'); if (!btn) return;
    if (btn.dataset.filter) { const f = btn.dataset.filter; cal.filters[f] = cal.filters[f] ? 0 : 1; cal.sel = null; return viewCalendar(); }
    const a = btn.dataset.act, idx = cal.idx!;
    if (a === 'prev') { cal.idx = Math.max(0, idx - N); cal.sel = null; viewCalendar(); }
    else if (a === 'next') { cal.idx = Math.min(Math.max(0, cols.length - N), idx + N); cal.sel = null; viewCalendar(); }
    else if (a === 'today') { cal.idx = null; cal.sel = null; viewCalendar(); }
    else if (a === 'flight') {
      // Va al siguiente vuelo tras la vista actual (y vuelve al primero al final).
      const flightCols = p.legs.map(l => cols.findIndex(c => l.dep >= c.s && l.dep < c.e)).filter(i => i >= 0);
      cal.idx = flightCols.find(i => i > idx + (N > 1 ? 1 : 0)) ?? flightCols[0] ?? 0;
      if (N > 1) cal.idx = Math.max(0, cal.idx - 1);
      cal.sel = null; viewCalendar();
    }
    else if (a === 'panel') { cal.panel = !cal.panel; viewCalendar(); }
    else if (a === 'closesheet') { const k = cal.sel; cal.sel = null; doneUi.editing = null; viewCalendar(); focusPill(k); }
  };
  app().onsubmit = ev => { handleDoneSubmit(ev, trip.id, find, viewCalendar); };
  app().onchange = e => {
    const el = e.target as HTMLSelectElement;
    if (el.id === 'tzmode') { trip.raw.tzmode = el.value; persist.trips(); cal.idx = null; cal.sel = null; viewCalendar(); }
  };
  app().oninput = null;
  app().onkeydown = e => {
    if (e.key === 'Escape' && cal.sel != null) { const k = cal.sel; cal.sel = null; doneUi.editing = null; viewCalendar(); focusPill(k); return; }
    const pill = (e.target as Element).closest<HTMLElement>('[data-k]');
    if (!pill) return;
    const k = +pill.dataset.k!;
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const nk = Math.max(0, Math.min(hit.length - 1, k + step));
    const el = app().querySelector<HTMLElement>(`[data-k="${nk}"]`);
    el?.focus(); el?.scrollIntoView({ block: 'nearest' });
  };
}
