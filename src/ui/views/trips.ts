/* Viajes: gestionar los viajes y los ajustes de la app (avisos en el móvil). */
import type { AlertCat } from '../../core/alerts';
import { build, cityAt, signedTxt } from '../model';
import { cap, DS, esc, T } from '../format';
import { icon } from '../icons';
import { disablePush, enablePush, isIOS, isStandalone, isSubscribed, pushConfigured, pushSupported, sendTest, serverStatus, syncAlerts, type ServerStatus } from '../push';
import { activeTrip, app, go, persist, S } from '../state';
import { allTripAlerts, syncAll } from '../sync';
import { calReset } from './calendar';
import { onTab, tabs } from './tabs';
import { resetWizard } from './wizard';

let confirmDel: string | null = null;
let pushMsg = '';
/** null = aún sin comprobar. */
let subscribed: boolean | null = null;
let status: ServerStatus | null = null;

function tripMeta(raw: Parameters<typeof build>[0]) {
  try {
    const b = build(raw), p = b.p;
    const [y, m, d] = raw.legs[0].date.split('-').map(Number);
    const when = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(Date.UTC(y, m - 1, d));
    const parts = ['Sales el ' + when, signedTxt(p.transitions[0].signed), raw.mode === 'abrupt' ? 'Brusco' : 'Suave'];
    if (p.transitions.length > 1) parts.push(p.transitions.at(-1)!.toTz === b.origin.tz ? 'con vuelta' : `${p.legs.length} vuelos`);
    return { title: b.title, sub: parts.join(' · ') };
  } catch { return { title: 'Viaje', sub: 'No se pudo calcular' }; }
}

const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'hace menos de 1 min' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };

function alertsSection(): string {
  const a = S.alerts;
  const upcoming = allTripAlerts().flatMap(x => x.alerts.map(al => ({ al, ctx: x.ctx }))).sort((x, y) => x.al.at - y.al.at).slice(0, 3);
  const cats: [AlertCat, string][] = [['light', 'Luz'], ['caffeine', 'Cafeína'], ['sleep', 'Sueño'], ['flight', 'Vuelo'], ['sugar', 'Azúcar'], ['meal', 'Comidas'], ['melatonin', 'Melatonina']];
  let state: string;
  if (!pushSupported() && isIOS() && !isStandalone()) state = 'Para recibir avisos en el iPhone (iOS 16.4 o superior), instala la app: botón Compartir → <b>Añadir a pantalla de inicio</b>, y ábrela desde el icono.';
  else if (!pushSupported()) state = 'Este navegador no admite avisos push.';
  else if (!pushConfigured()) state = 'Falta configurar el servidor de avisos.';
  else if (subscribed) state = 'Avisos activados en este dispositivo.';
  else state = 'Te aviso 30 minutos antes de cada cambio importante. Nada mientras duermes, salvo para despertarte.';
  // Lo que ve el servidor para este móvil: avisos programados y última comprobación.
  let server = '';
  if (subscribed && status) {
    const mine = status.mine;
    const parts = [mine ? (mine.count ? `${mine.count} avisos programados` : 'ningún aviso programado') : ''];
    if (mine?.next) parts.push(`el próximo, ${DS(Intl.DateTimeFormat().resolvedOptions().timeZone).format(mine.next)} a las ${T(Intl.DateTimeFormat().resolvedOptions().timeZone).format(mine.next)}`);
    const tick = status.lastTick?.at, rej = status.lastRejected?.at;
    if (tick && (!rej || tick >= rej)) parts.push(`servidor comprobado ${ago(tick)}`);
    else if (rej) parts.push(`la última comprobación del servidor (${ago(rej)}) falló`);
    else parts.push('el servidor aún no ha hecho ninguna comprobación');
    server = `<p class="info">${icon('info')}<span>${esc(cap(parts.filter(Boolean).join(' · ')))}.</span></p>`;
  }
  const ready = pushSupported() && pushConfigured();
  const buttons = !ready ? '' : subscribed
    ? '<div class="addrow"><button class="btn ghost small" data-act="pushtest">Enviar aviso de prueba</button><button class="btn link small" data-act="pushoff">Desactivar avisos</button></div>'
    : '<button class="btn" data-act="push">Activar avisos</button>';
  return `<details class="alertset"${pushMsg ? ' open' : ''}><summary>${icon('bell')} Avisos en el móvil</summary><div class="fields">
    <p class="lead" style="margin:0">${state}</p>${pushMsg ? `<p class="info" role="status">${icon('info')}<span>${esc(pushMsg)}</span></p>` : ''}${server}
    <div class="chips" role="group" aria-label="Qué avisos">${cats.map(([k, l]) => `<button class="fchip" data-acat="${k}" aria-pressed="${a.cats[k]}">${l}</button>`).join('')}</div>
    <label class="f">Máximo de avisos al día<select class="in" id="amax">${[3, 4, 6, 8, 10].map(n => `<option${a.maxPerDay === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    ${upcoming.length ? `<div><b>Próximos avisos</b><ul>${upcoming.map(({ al, ctx }) => { const tz = cityAt(ctx.b, al.at).tz; return `<li>${esc(cap(DS(tz).format(al.at)))}, ${esc(T(tz).format(al.at))} · ${esc(al.title)}</li>`; }).join('')}</ul></div>` : ''}
    ${buttons}
  </div></details>`;
}

export function viewTrips(): void {
  const live = activeTrip();
  const list = S.trips.length
    ? '<ul class="trips">' + S.trips.map(t => {
      const m = tripMeta(t.raw);
      const badge = live?.trip.id === t.id ? ' <span class="tg">En marcha</span>' : '';
      return `<li class="trip"><h2>${esc(m.title)}${badge}</h2><p class="meta">${esc(m.sub)}</p><div class="acts"><button class="btn small" data-act="open" data-id="${esc(t.id)}">Ver plan</button><button class="btn link small" data-act="del" data-id="${esc(t.id)}">${confirmDel === t.id ? 'Toca otra vez para borrar' : 'Borrar'}</button></div></li>`;
    }).join('') + '</ul>'
    : '<div class="empty"><p>Todavía no tienes ningún viaje. Añade el primero y te preparo un calendario con cuándo dormir, comer y buscar luz.</p><button class="btn" data-act="new">Añadir viaje</button></div>';
  const keep = app().dataset.rendered === 'viajes' ? app().querySelector('.scroll')?.scrollTop ?? 0 : 0;
  app().innerHTML = `<div class="scroll"><div class="wrap"><div class="top"><div><h1>Viajes</h1><p class="lead">Tu plan para llegar descansada.</p></div>${S.trips.length ? '<button class="btn small" data-act="new">Añadir</button>' : ''}</div>${list}
    ${alertsSection()}
    <aside class="info callout" aria-label="Cómo funciona">${icon('info')}<span><b>Cómo funciona:</b> muevo tu reloj interno un poco cada día. Lo que más cuenta es la luz.</span></aside></div></div>${tabs('viajes')}`;
  app().querySelector('.scroll')!.scrollTop = keep;
  app().dataset.rendered = 'viajes';

  if (subscribed === null && pushSupported()) {
    isSubscribed().then(async v => {
      subscribed = v;
      if (v) status = await serverStatus().catch(() => null);
      if (location.hash === '#viajes' || location.hash === '') viewTrips();
    });
  }
  const resync = () => syncAll().then(() => serverStatus()).then(st => { status = st; }).catch(() => {});
  app().onclick = async e => {
    if (onTab(e)) return;
    const t = e.target as Element;
    const cat = t.closest<HTMLElement>('[data-acat]');
    if (cat) { const k = cat.dataset.acat as AlertCat; S.alerts.cats[k] = !S.alerts.cats[k]; persist.alerts(); pushMsg = ''; viewTrips(); resync(); return; }
    const b = t.closest<HTMLButtonElement>('button'); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id!;
    if (a === 'new') { resetWizard(); go('nuevo'); }
    else if (a === 'open') { S.current = id; persist.current(); calReset(); go('calendario'); }
    else if (a === 'del') {
      if (confirmDel === id) { syncAlerts(id, []).catch(() => {}); S.trips = S.trips.filter(x => x.id !== id); delete S.done[id]; if (S.current === id) S.current = null; persist.trips(); persist.done(); persist.current(); confirmDel = null; }
      else confirmDel = id;
      viewTrips();
    } else if (a === 'push' || a === 'pushtest' || a === 'pushoff') {
      try {
        if (a === 'push') pushMsg = await enablePush(allTripAlerts().map(x => ({ tripId: x.tripId, alerts: x.alerts })));
        else if (a === 'pushtest') pushMsg = await sendTest();
        else pushMsg = await disablePush();
      } catch { pushMsg = 'Algo falló con los avisos. Inténtalo de nuevo.'; }
      subscribed = await isSubscribed();
      status = subscribed ? await serverStatus().catch(() => null) : null;
      viewTrips();
    }
  };
  app().onchange = e => {
    const el = e.target as HTMLSelectElement;
    if (el.id === 'amax') { S.alerts.maxPerDay = +el.value; persist.alerts(); viewTrips(); resync(); }
  };
}
