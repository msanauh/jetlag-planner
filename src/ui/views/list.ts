import { ARRIVAL_DAYS, arrivalRoutine, type PlanEvent } from '../../core/plan';
import { H } from '../../core/time';
import { cap, DL, esc, T } from '../format';
import { dotFor, icon } from '../icons';
import { markable, MEALN, SHORT, statusClass, statusOf, sunAt, tzFor, type Built, type DoneRec } from '../model';
import { app, curTrip, S } from '../state';
import { buildColumns, inCol, steadyText } from './calendar';
import { doneLabel, doneText, doneUi, handleDone, handleDoneSubmit, plannedAt } from './done';
import { onTab, tabs } from './tabs';

export const listUi = { mode: 'all' as 'all' | 'arrival' };

const HIDDEN = new Set(['sugar-no', 'caffeine-avoid', 'caffeine-no']);

const TIMED_OFF = ['caffeine-avoid', 'caffeine-no', 'sugar-no'];

/** Filas de un día: sueño, luz, último café, comidas, vuelos. Lo de hoy y lo pasado se puede
    marcar como hecho y corregir la hora ("he comido a las 15:00"). */
function dayRows(evs: PlanEvent[], col: { s: number; e: number; tz: string }, done: Record<string, DoneRec> | undefined, now: number): string {
  const t = (x: number) => T(col.tz).format(x);
  return evs.filter(e => !HIDDEN.has(e.type)).map(e => {
    let label: string, time: string;
    if (e.type === 'sleep') { label = e.start < col.s ? 'Duerme hasta' : 'Dormir'; time = e.start < col.s ? t(e.end) : t(e.start) + ' – ' + t(e.end) + (e.end >= col.e ? ' (+1)' : ''); }
    else if (e.type === 'light-seek') { label = e.maintain ? 'Luz de la mañana' : 'Busca luz fuerte'; time = t(e.start) + ' – ' + t(e.end); }
    else if (e.type === 'light-avoid') { label = 'Evita la luz fuerte'; time = t(e.start) + ' – ' + t(e.end); }
    else if (e.type === 'caffeine-ok') { label = 'Cafeína, último café'; time = t(e.end); }
    else if (e.type === 'meal') { label = MEALN[e.meal ?? '']; time = t(e.start); }
    else { label = SHORT[e.type]; time = t(e.start); }
    const st = statusOf(e, now, done);
    const rec = done?.[e.id];
    const id = esc(e.id);
    // Se puede marcar lo de hoy y lo pasado (no lo de días futuros). El sueño, en su fila "Dormir".
    const canMark = markable(e) && !e.beforeStart && e.start < now + 18 * H && !(e.type === 'sleep' && e.start < col.s);
    const canEdit = !!rec && !rec.skipped && !TIMED_OFF.includes(e.type);
    const doneTxt = rec ? `<small class="donechip${rec.skipped ? ' skipped' : ''}">${rec.skipped ? '✕' : '✓'} ${esc(doneText(e, rec, col.tz))}${canEdit && canMark ? ` <button class="linkbtn" data-done="edit" data-ev="${id}">Cambiar</button>` : ''}</small>` : '';
    const tick = canMark ? `<button class="tick sm" data-done="toggle" data-ev="${id}" aria-pressed="${!!rec && !rec.skipped}" aria-label="${rec && !rec.skipped ? 'Hecho' : 'Marcar como hecho'}: ${esc(label)}">${icon('check')}</button>` : '';
    const form = canMark && doneUi.editing === e.id
      ? `<li class="editrow"><form class="doneform" data-doneform="${id}"><div class="row"><label class="f">${esc(doneLabel(e))}<input class="in" type="time" name="t" value="${esc(T(col.tz).format(rec?.at ?? plannedAt(e)))}" required></label><button class="btn small" type="submit">Guardar</button><button class="btn link small" type="button" data-done="cancel" data-ev="${id}">Cancelar</button></div></form></li>` : '';
    return `<li class="${statusClass(st).trim()}">${dotFor(e)}<span class="lb"><span class="lbt">${esc(label)}</span>${doneTxt}</span><span class="tm2">${esc(time)}</span>${tick}</li>${form}`;
  }).join('');
}

/** Tarjetas de los primeros días tras cada llegada (ida, vuelta y destinos intermedios). */
export function routineHTML(b: Built, done: Record<string, DoneRec> | undefined, now: number): string {
  const { p } = b;
  return p.transitions.map((t, i) => {
    const days = arrivalRoutine(p, i, ARRIVAL_DAYS);
    if (!days.length) return '';
    const city = b.legTo[t.legTo];
    const isReturn = i > 0 && city.tz === b.origin.tz && city.n === b.origin.n;
    const kind = i === 0 ? 'Ida' : isReturn ? 'Vuelta' : 'Llegada';
    const cards = days.map(d => {
      const mdt = Math.max(d.from, d.to - 12 * H);
      const sun = sunAt(city, mdt);
      const sunTxt = sun ? 'Amanecer ' + T(d.tz).format(sun.rise) + ' · Atardecer ' + T(d.tz).format(sun.set) : '';
      const head = d.n === 0 ? `Llegada · ${cap(DL(d.tz).format(d.from))}` : `Día ${d.n} · ${cap(DL(d.tz).format(mdt))}`;
      const evs = d.events.filter(e => inCol(e, { s: d.from, e: d.to }));
      return `<article class="daycard"><header><h3>${esc(head)}</h3>${d.n === 0 ? `<span>desde las ${esc(T(d.tz).format(d.from))}</span>` : ''}${sunTxt ? `<small>${esc(sunTxt)}</small>` : ''}</header><ul>${dayRows(evs, { s: d.from, e: d.to, tz: d.tz }, done, now) || '<li><span class="lb">Descansa: sin consignas este rato.</span></li>'}</ul></article>`;
    }).join('');
    return `<section class="routine" aria-label="${esc(kind)}"><h2>${esc(kind)}: tus primeros ${ARRIVAL_DAYS} días en ${esc(city.n)}</h2><p>Horas de ${esc(city.n)}. ${t.adaptedAt ? 'Estarás adaptada el ' + esc(DL(t.toTz).format(t.adaptedAt)) + '.' : 'El ajuste sigue después de estos días.'}</p><div class="days" style="margin-top:0">${cards}</div></section>`;
  }).join('');
}

export function viewList(): void {
  const c = curTrip(); if (!c) { location.hash = 'viajes'; return; }
  const { trip, b, tzmode } = c, { p } = b;
  const done = S.done[trip.id], now = Date.now();
  let body: string;
  if (listUi.mode === 'arrival') body = routineHTML(b, done, now);
  else {
    // La vuelta (y otros cambios de zona) como información, no como aviso.
    const later = p.transitions.slice(1).filter(t => t.startDay).map(t => {
      const dest = b.legTo[t.legTo], from = b.placeCity[t.legFrom];
      const back = dest.tz === b.origin.tz && dest.n === b.origin.n;
      return `<div class="info">${icon('takeoff')}<span>${back ? 'La vuelta' : 'El viaje a ' + esc(dest.n)} se empieza a preparar el <b>${esc(DL(from.tz).format(t.startDay!))}</b>; vuelas el ${esc(DL(from.tz).format(t.dep))}.</span></div>`;
    }).join('');
    body = (later ? `<div class="stack">${later}</div>` : '') + '<div class="days">' + buildColumns(b, tzmode).map(col => {
      if (col.steady) {
        const t = steadyText(col, trip.raw);
        return `<article class="daycard steady"><header><h2>··· ${esc(t.range)}</h2><span>${esc(col.loc.n)} · ${esc(t.days)}</span></header><p><b>Mantén tus horarios de siempre</b> (hora de ${esc(col.loc.n)}). ${esc(t.sleep)}, ${esc(t.meals.charAt(0).toLowerCase() + t.meals.slice(1))} y luz natural por la mañana.</p></article>`;
      }
      const mdt = col.mid + 12 * H;
      const evs = p.events.filter(e => inCol(e, col));
      const sun = col.sun ? 'Amanecer ' + T(col.tz).format(col.sun.rise) + ' · Atardecer ' + T(col.tz).format(col.sun.set) : '';
      return `<article class="daycard"><header><h2>${esc(cap(DL(col.tz).format(mdt)))}</h2><span>${esc(col.loc.n)}</span>${sun ? `<small>${esc(sun)}</small>` : ''}</header><ul>${dayRows(evs, col, done, now)}</ul></article>`;
    }).join('') + '</div>';
  }
  const seg = `<div class="seg" role="group" aria-label="Qué ver" style="margin-top:20px">${[['all', 'Todo el plan'], ['arrival', `Primeros ${ARRIVAL_DAYS} días`]].map(([k, l]) => `<button data-mode="${k}" aria-pressed="${listUi.mode === k}">${l}</button>`).join('')}</div>`;
  const keep = app().dataset.rendered === 'lista' ? app().querySelector('.scroll')?.scrollTop ?? 0 : 0;
  app().innerHTML = `<div class="scroll"><div class="wrap"><h1>Plan por días</h1><p class="lead">${esc(b.title)}</p>${seg}${body}</div></div>${tabs('lista')}`;
  app().querySelector('.scroll')!.scrollTop = keep;
  app().dataset.rendered = 'lista';
  const find = (id: string) => { const e = p.events.find(x => x.id === id); return e ? { e, tz: tzFor(b, tzmode, e.start) } : null; };
  app().onsubmit = ev => { handleDoneSubmit(ev, trip.id, find, viewList); };
  app().onclick = e => {
    if (onTab(e)) return;
    if (handleDone(e.target as Element, trip.id, find, viewList)) return;
    const m = (e.target as Element).closest<HTMLElement>('[data-mode]');
    if (m) { listUi.mode = m.dataset.mode as typeof listUi.mode; viewList(); }
  };
}
