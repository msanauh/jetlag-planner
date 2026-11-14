/* Hoy: qué hago ahora. Usa el viaje cuyo plan está en marcha; si no hay ninguno, un
   estado vacío ("Sigue con tu rutina habitual"). Solo lo de hoy. "Hoy" es tu día según el plan: desde que te levantas hasta
   que te despiertas mañana (incluye la noche aunque pase de medianoche).
   Para ver más días están Calendario y Lista. */
import type { PlanEvent } from '../../core/plan';
import { H } from '../../core/time';
import { cap, DL, DS, esc, fmtH, T } from '../format';
import { dotFor, icon } from '../icons';
import { build, cityAt, daysBetween, describe, markable, titleOf, tzFor, type Built } from '../model';
import { activeTrip, app, nextTrip, S } from '../state';
import { doneLabel, doneText, doneUi, handleDone, handleDoneSubmit, movesClock, plannedAt } from './done';
import { onTab, tabs } from './tabs';

const TIMED_OFF = ['caffeine-avoid', 'caffeine-no', 'sugar-no'];

/** Fila de evento. `mode`: 'now' (marcar), 'ask' (¿lo hiciste? sí / no), 'next' (solo ver). */
function row(tripId: string, e: PlanEvent, b: Built, tz: string, mode: 'now' | 'ask' | 'next'): string {
  const d = describe(e, tz, b, null);
  const title = e.type === 'meal' ? titleOf(e) : d.title;
  const rec = S.done[tripId]?.[e.id];
  const id = esc(e.id);
  const when = e.start === e.end ? T(tz).format(e.start)
    : e.type === 'caffeine-ok' ? 'Hasta las ' + T(tz).format(e.end)
    : T(tz).format(e.start) + '–' + T(tz).format(e.end);
  // En "¿Lo hiciste?" ya pasó: basta con el título.
  let extra = mode === 'ask' ? '' : `<p>${esc(d.detail)}</p>`;
  if (doneUi.editing === e.id) {
    extra += `<form class="doneform" data-doneform="${id}"><div class="row"><label class="f">${esc(doneLabel(e))}<input class="in" type="time" name="t" value="${esc(T(tz).format(rec?.at ?? plannedAt(e)))}" required></label><button class="btn small" type="submit">Guardar</button><button class="btn link small" type="button" data-done="cancel" data-ev="${id}">Cancelar</button></div></form>`;
  } else if (rec) {
    const canEdit = !rec.skipped && !TIMED_OFF.includes(e.type);
    extra += `<p><span class="donechip${rec.skipped ? ' skipped' : ''}">${icon(rec.skipped ? 'x' : 'check')}${esc(doneText(e, rec, tz))}${rec.skipped && movesClock(e) ? ' · he ajustado los días siguientes' : ''}</span>${canEdit ? ` <button class="btn link small" data-done="edit" data-ev="${id}">Cambiar hora</button>` : ''}${rec.skipped ? ` <button class="btn link small" data-done="undo" data-ev="${id}">Deshacer</button>` : ''}</p>`;
  }
  let actions = '';
  if (markable(e)) {
    const done = !!rec && !rec.skipped;
    actions = `<button class="tick" data-done="toggle" data-ev="${id}" aria-pressed="${done}" aria-label="${done ? 'Hecho' : 'Marcar como hecho'}: ${esc(title)}">${icon('check')}</button>`;
    if (mode === 'ask' && !rec) actions += `<button class="tick no" data-done="skip" data-ev="${id}" aria-label="No lo hice: ${esc(title)}">${icon('x')}</button>`;
  }
  const cls = rec && !rec.skipped ? 'is-done' : '';
  return `<li class="${cls}">${dotFor(e)}<div><b class="t">${esc(when)} · ${esc(title)}</b>${extra}</div>${actions ? `<div class="acts">${actions}</div>` : ''}</li>`;
}

/** Sin plan en marcha: rutina habitual y cuándo empieza el siguiente. */
function viewIdle(): void {
  const now = Date.now();
  const nx = nextTrip(now);
  let next = 'No tienes viajes pronto.';
  if (nx) {
    const tz = nx.b.origin.tz;
    const n = daysBetween(tz, now, nx.start);
    if (n <= 7) next = `Tu siguiente plan de viaje empieza ${n <= 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`}.`;
  }
  app().innerHTML = `<div class="scroll"><div class="wrap now idle"><span class="dot big p-sleep">${icon('moon')}</span>
    <h1 class="hero">Sigue con tu rutina habitual</h1>
    <p class="lead c">Asegúrate de mantener una rutina de sueño limpia y consistente. ${esc(next)}</p>
    ${S.trips.length ? '' : '<button class="btn" data-act="new" style="margin-top:28px">Añadir viaje</button>'}
  </div></div>${tabs('hoy')}`;
  app().dataset.rendered = 'hoy';
  app().onclick = e => {
    if (onTab(e)) return;
    if ((e.target as Element).closest('[data-act="new"]')) location.hash = 'nuevo';
  };
}

export function viewToday(): void {
  const c = activeTrip(); if (!c) return viewIdle();
  const { trip, b, tzmode } = c, { p } = b;
  const now = Date.now();
  const sleeps = p.events.filter(e => e.type === 'sleep');
  // Estancia ya adaptada: no hay consejos día a día.
  const steady = p.steady.find(r => now >= r.from && now < r.to);
  // Día actual del plan: el que termina con tu próximo despertar.
  const curSleep = steady ? undefined : sleeps.find(s => s.end > now);
  if (!steady && !curSleep) return viewIdle();
  const curJ = curSleep?.j ?? -2;
  const dayEnd = curSleep?.end ?? now;
  const dayStart = sleeps.find(s => s.j === curJ - 1)?.end ?? c.start;
  const isToday = (e: PlanEvent) => e.j === curJ || (e.j === -1 && e.start >= Math.min(dayStart, now) && e.start < dayEnd);
  const today = steady ? [] : p.events.filter(e => isToday(e) && e.type !== 'caffeine-avoid' && !e.beforeStart);
  const tz = tzFor(b, tzmode, now), loc = cityAt(b, now);

  /* Titular: lo activo ahora. */
  const act = p.events.filter(e => e.start !== e.end && e.start <= now && now < e.end && !e.type.startsWith('flight'));
  const has = (t: string) => act.find(e => e.type === t);
  const parts: string[] = [], dots: [string, string, number][] = [];
  let sub = '';
  if (has('sleep')) { parts.push('Duerme'); dots.push(['p-sleep', 'moon', 0]); sub = 'Hasta las ' + T(tz).format(has('sleep')!.end) + '.'; }
  else {
    const ls = has('light-seek');
    if (ls) { parts.push('Busca luz fuerte'); dots.push(['p-light', 'sun', 0]); sub = 'Durante unas ' + fmtH(Math.round((ls.end - ls.start) / H)) + ' h, hasta las ' + T(tz).format(ls.end) + '.'; }
    if (has('light-avoid')) { parts.push('evita la luz fuerte y las pantallas'); dots.push(['p-avoid o-light', 'sun', 1]); }
    if (has('caffeine-ok')) { parts.push('puedes tomar cafeína'); dots.push(['p-coffee', 'cup', 0]); if (!sub) sub = 'Último café a las ' + T(tz).format(has('caffeine-ok')!.end) + '.'; }
    if (has('caffeine-avoid') || has('caffeine-no')) { parts.push('evita la cafeína'); dots.push(['p-avoid o-coffee', 'cup', 1]); }
  }
  if (steady) { dots.length = 0; dots.push(['p-sleep', 'moon', 0]); sub = `Duerme de ${trip.raw.bed} a ${trip.raw.wake} y sal a la luz por la mañana (hora de ${loc.n}).`; }
  const head = steady ? 'Mantén tus horarios de siempre' : parts.length ? cap(parts.join(' y ')) : p.noShift ? 'Sin cambio de hora' : 'Sigue tu plan';
  const kick = 'Hoy · ' + T(tz).format(now) + ' en ' + loc.n;

  /* Información de hoy (gris, no accionable). */
  const infos: string[] = [];
  const baseline = (() => { try { return build(trip.raw).p; } catch { return null; } })();
  p.transitions.forEach((t, i) => {
    const was = baseline?.transitions[i]?.adaptedAt, nowAt = t.adaptedAt;
    if (was && nowAt && Math.abs(nowAt - was) > H) {
      const dest = b.legTo[t.legTo];
      infos.push(`<div class="info">${icon('info')}<span>Con lo que has marcado he recolocado los próximos días: estarás adaptada a ${esc(dest.n)} el <b>${esc(DL(t.toTz).format(nowAt))}</b> (antes, el ${esc(DS(t.toTz).format(was))}).</span></div>`);
    }
  });
  if (steady) {
    const nextT = p.transitions[steady.tr + 1];
    if (nextT?.startDay) {
      const dest = b.legTo[nextT.legTo], back = dest.tz === b.origin.tz && dest.n === b.origin.n;
      infos.push(`<div class="info">${icon('takeoff')}<span>Ya estás adaptada. El <b>${esc(DL(nextT.fromTz).format(nextT.startDay))}</b> empiezas a preparar ${back ? 'la vuelta' : 'el viaje a ' + esc(dest.n)}; hasta entonces no hay nada que cambiar.</span></div>`);
    }
  }
  p.transitions.slice(1).forEach(t => {
    if (t.startDay && t.startDay >= dayStart - 12 * H && t.startDay < dayEnd) {
      const dest = b.legTo[t.legTo], back = dest.tz === b.origin.tz && dest.n === b.origin.n;
      infos.push(`<div class="info">${icon('takeoff')}<span>Hoy empiezas a preparar ${back ? 'la vuelta' : 'el viaje a ' + esc(dest.n)}: vuelas el ${esc(DS(b.placeCity[t.legFrom].tz).format(t.dep))}.</span></div>`);
    }
  });

  const tzE = (e: PlanEvent) => tzFor(b, tzmode, e.start);
  const marked = (e: PlanEvent) => !!S.done[trip.id]?.[e.id];
  const nowItems = today.filter(e => markable(e) && e.start !== e.end && e.start <= now && now < e.end);
  const asked = today.filter(e => markable(e) && e.end <= now && !marked(e));
  const doneToday = today.filter(e => markable(e) && e.end <= now && marked(e));
  const next = today.filter(e => e.start > now);
  const list = (items: PlanEvent[], mode: 'now' | 'ask' | 'next') => `<ul class="nowlist">${items.map(e => row(trip.id, e, b, tzE(e), mode)).join('')}</ul>`;

  const keep = app().dataset.rendered === 'hoy' ? app().querySelector('.scroll')?.scrollTop ?? 0 : 0;
  app().innerHTML = `<div class="scroll"><div class="wrap now"><p class="kicker">${esc(cap(kick))}</p><h1 class="hero">${esc(head)}</h1><div class="minis">${dots.map(d => `<span class="dot big ${d[0]}">${icon(d[1], d[2])}</span>`).join('')}</div>${sub ? `<p class="lead c">${esc(sub)}</p>` : ''}
    ${infos.length ? `<div class="stack">${infos.join('')}</div>` : ''}
    ${nowItems.length ? `<h2 class="sec2">Ahora</h2>${list(nowItems, 'now')}` : ''}
    ${asked.length ? `<h2 class="sec2">¿Lo hiciste?</h2>${list(asked, 'ask')}` : ''}
    ${next.length ? `<h2 class="sec2">Lo que queda hoy</h2>${list(next, 'next')}` : ''}
    ${doneToday.length ? `<h2 class="sec2">Hecho hoy</h2>${list(doneToday, 'now')}` : ''}
  </div></div>${tabs('hoy')}`;
  app().querySelector('.scroll')!.scrollTop = keep;
  app().dataset.rendered = 'hoy';

  const find = (id: string) => { const e = p.events.find(x => x.id === id); return e ? { e, tz: tzFor(b, tzmode, e.start) } : null; };
  app().onclick = e => {
    if (onTab(e)) return;
    handleDone(e.target as Element, trip.id, find, viewToday);
  };
  app().onsubmit = ev => { handleDoneSubmit(ev, trip.id, find, viewToday); };
}
