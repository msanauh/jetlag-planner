/* Hoy: solo lo de hoy. "Hoy" es tu día según el plan: desde que te levantas hasta
   que te despiertas mañana (incluye la noche aunque pase de medianoche).
   Para ver más días están Calendario y Lista. */
import { alertsFor, type AlertCat } from '../../core/alerts';
import type { PlanEvent } from '../../core/plan';
import { H } from '../../core/time';
import { cap, DL, DS, esc, fmtH, T } from '../format';
import { dotFor, icon } from '../icons';
import { build, cityAt, describe, isDayAt, markable, signedTxt, titleOf, tzFor, type Built } from '../model';
import { disablePush, enablePush, isIOS, isStandalone, isSubscribed, pushConfigured, pushSupported, sendTest, syncAlerts } from '../push';
import { app, curTrip, persist, S } from '../state';
import { doneLabel, doneText, doneUi, handleDone, handleDoneSubmit, movesClock, plannedAt } from './done';
import { onTab, tabs } from './tabs';

let pushMsg = '';
/** null = aún sin comprobar. */
let subscribed: boolean | null = null;
const synced = new Set<string>();
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

function alertsSection(b: Built): string {
  const a = S.alerts;
  const list = alertsFor(b.p, { ...a, now: Date.now(), isDay: t => isDayAt(b, t) }).slice(0, 3);
  const cats: [AlertCat, string][] = [['light', 'Luz'], ['caffeine', 'Cafeína'], ['sleep', 'Sueño'], ['flight', 'Vuelo'], ['sugar', 'Azúcar'], ['meal', 'Comidas'], ['melatonin', 'Melatonina']];
  let status: string;
  if (!pushSupported() && isIOS() && !isStandalone()) status = 'Para recibir avisos en el iPhone (iOS 16.4 o superior), instala la app: botón Compartir → <b>Añadir a pantalla de inicio</b>, y ábrela desde el icono.';
  else if (!pushSupported()) status = 'Este navegador no admite avisos push.';
  else if (!pushConfigured()) status = 'Falta configurar el servidor de avisos (claves VAPID en Vercel). Mientras, aquí puedes ver qué avisos recibirías.';
  else if (subscribed) status = 'Avisos activados en este dispositivo.';
  else status = 'Te avisaré 30 minutos antes de cada cambio importante. Nada mientras duermes, salvo para despertarte.';
  const ready = pushSupported() && pushConfigured();
  const buttons = !ready ? '' : subscribed
    ? '<div class="addrow"><button class="btn ghost small" data-act="pushtest">Enviar aviso de prueba</button><button class="btn link small" data-act="pushoff">Desactivar avisos</button></div>'
    : '<button class="btn" data-act="push">Activar avisos</button>';
  return `<details class="alertset"${pushMsg ? ' open' : ''}><summary>${icon('bell')} Avisos en el móvil</summary><div class="fields">
    <p class="lead" style="margin:0">${status}</p>${pushMsg ? `<p class="info" role="status">${icon('info')}<span>${esc(pushMsg)}</span></p>` : ''}
    <div class="chips" role="group" aria-label="Qué avisos">${cats.map(([k, l]) => `<button class="fchip" data-acat="${k}" aria-pressed="${a.cats[k]}">${l}</button>`).join('')}</div>
    <label class="f">Máximo de avisos al día<select class="in" id="amax">${[3, 4, 6, 8, 10].map(n => `<option${a.maxPerDay === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    ${list.length ? `<div><b>Próximos avisos</b><ul>${list.map(x => { const tz = cityAt(b, x.at).tz; return `<li>${esc(cap(DS(tz).format(x.at)))}, ${esc(T(tz).format(x.at))} · ${esc(x.title)}</li>`; }).join('')}</ul></div>` : ''}
    ${buttons}
  </div></details>`;
}

export function viewToday(): void {
  const c = curTrip(); if (!c) { location.hash = 'viajes'; return; }
  const { trip, b, tzmode } = c, { p } = b;
  const now = Date.now();
  const sleeps = p.events.filter(e => e.type === 'sleep');
  const daily = p.events.filter(e => e.j >= 0);
  const first = daily.length ? Math.min(...daily.map(e => e.start)) : p.legs[0].dep;
  const preview = now < first;
  // Día actual del plan: el que termina con tu próximo despertar.
  // Estancia ya adaptada: no hay consejos día a día.
  const steady = preview ? undefined : p.steady.find(r => now >= r.from && now < r.to);
  const curSleep = preview || steady ? (preview ? sleeps[0] : undefined) : sleeps.find(s => s.end > now);
  const curJ = curSleep?.j ?? -2;
  const dayEnd = curSleep?.end ?? now;
  const dayStart = preview ? first : sleeps.find(s => s.j === curJ - 1)?.end ?? first;
  const isToday = (e: PlanEvent) => e.j === curJ || (e.j === -1 && e.start >= Math.min(dayStart, now) && e.start < dayEnd);
  const today = steady ? [] : p.events.filter(e => isToday(e) && e.type !== 'caffeine-avoid' && !e.beforeStart);
  const ref = preview ? first : now;
  const tz = tzFor(b, tzmode, ref), loc = cityAt(b, ref);

  /* Titular: lo activo ahora. */
  const act = p.events.filter(e => e.start !== e.end && e.start <= ref && ref < e.end && !e.type.startsWith('flight'));
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
  const finished = !curSleep && !preview && !steady;
  if (steady) { dots.length = 0; dots.push(['p-sleep', 'moon', 0]); sub = `Duerme de ${trip.raw.bed} a ${trip.raw.wake} y sal a la luz por la mañana (hora de ${loc.n}).`; }
  const head = steady ? 'Mantén tus horarios de siempre' : finished ? 'Plan completado' : parts.length ? cap(parts.join(' y ')) : p.noShift ? 'Sin cambio de hora' : 'Sigue tu rutina';
  const kick = preview ? 'Tu plan empieza el ' + DL(tz).format(first) : 'Hoy · ' + T(tz).format(now) + ' en ' + loc.n;

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
  const nowItems = preview ? [] : today.filter(e => markable(e) && e.start !== e.end && e.start <= now && now < e.end);
  const asked = preview ? [] : today.filter(e => markable(e) && e.end <= now && !marked(e));
  const doneToday = preview ? [] : today.filter(e => markable(e) && e.end <= now && marked(e));
  const next = preview ? today : today.filter(e => e.start > now);
  const list = (items: PlanEvent[], mode: 'now' | 'ask' | 'next') => `<ul class="nowlist">${items.map(e => row(trip.id, e, b, tzE(e), mode)).join('')}</ul>`;

  const keep = app().dataset.rendered === 'hoy' ? app().querySelector('.scroll')?.scrollTop ?? 0 : 0;
  app().innerHTML = `<div class="scroll"><div class="wrap now"><p class="kicker">${esc(cap(kick))}</p><h1 class="hero">${esc(head)}</h1><div class="minis">${dots.map(d => `<span class="dot big ${d[0]}">${icon(d[1], d[2])}</span>`).join('')}</div>${sub ? `<p class="lead c">${esc(sub)}</p>` : ''}
    <p class="chipline">${esc(b.title)} · ${p.dir === 'adv' ? 'Adelantar ' : 'Retrasar '}${fmtH(p.total)} h (${signedTxt(p.transitions[0].signed)})</p>
    ${infos.length ? `<div class="stack">${infos.join('')}</div>` : ''}
    ${nowItems.length ? `<h2 class="sec2">Ahora</h2>${list(nowItems, 'now')}` : ''}
    ${asked.length ? `<h2 class="sec2">¿Lo hiciste?</h2>${list(asked, 'ask')}` : ''}
    ${next.length ? `<h2 class="sec2">${preview ? 'Así será tu primer día' : 'Lo que queda hoy'}</h2>${list(next, 'next')}` : ''}
    ${doneToday.length ? `<h2 class="sec2">Hecho hoy</h2>${list(doneToday, 'now')}` : ''}
    ${finished ? '<p class="lead c">Ya estás adaptada. Mantén la luz de la mañana.</p>' : ''}
    ${alertsSection(b)}
  </div></div>${tabs('hoy')}`;

  app().querySelector('.scroll')!.scrollTop = keep;
  app().dataset.rendered = 'hoy';
  if (subscribed === null && pushSupported()) isSubscribed().then(v => { subscribed = v; if (v && location.hash === '#hoy') viewToday(); });
  if (subscribed && !synced.has(trip.id)) {
    synced.add(trip.id);
    syncAlerts(trip.id, alertsFor(p, { ...S.alerts, now: Date.now(), isDay: t => isDayAt(b, t) })).catch(() => synced.delete(trip.id));
  }

  const find = (id: string) => { const e = p.events.find(x => x.id === id); return e ? { e, tz: tzFor(b, tzmode, e.start) } : null; };
  const resync = () => syncAlerts(trip.id, alertsFor(p, { ...S.alerts, now: Date.now(), isDay: t => isDayAt(b, t) })).catch(() => {});
  app().onclick = async e => {
    if (onTab(e)) return;
    const t = e.target as Element;
    if (handleDone(t, trip.id, find, viewToday)) return;
    const cat = t.closest<HTMLElement>('[data-acat]');
    if (cat) { const k = cat.dataset.acat as AlertCat; S.alerts.cats[k] = !S.alerts.cats[k]; persist.alerts(); resync(); pushMsg = ''; viewToday(); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'push' || act === 'pushtest' || act === 'pushoff') {
      try {
        if (act === 'push') { pushMsg = await enablePush(trip.id, alertsFor(p, { ...S.alerts, now: Date.now(), isDay: x => isDayAt(b, x) })); synced.add(trip.id); }
        else if (act === 'pushtest') pushMsg = await sendTest();
        else { pushMsg = await disablePush(); synced.clear(); }
      } catch { pushMsg = 'Algo falló con los avisos. Inténtalo de nuevo.'; }
      subscribed = await isSubscribed();
      viewToday();
    }
  };
  app().onsubmit = ev => { handleDoneSubmit(ev, trip.id, find, viewToday); };
  app().onchange = e => {
    const el = e.target as HTMLSelectElement;
    if (el.id === 'amax') { S.alerts.maxPerDay = +el.value; persist.alerts(); resync(); viewToday(); }
  };
}
