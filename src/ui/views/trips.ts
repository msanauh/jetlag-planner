import { build, signedTxt } from '../model';
import { esc } from '../format';
import { icon } from '../icons';
import { syncAlerts } from '../push';
import { app, go, persist, S } from '../state';
import { calReset } from './calendar';
import { resetWizard } from './wizard';

let confirmDel: string | null = null;

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

export function viewTrips(): void {
  const list = S.trips.length
    ? '<ul class="trips">' + S.trips.map(t => {
      const m = tripMeta(t.raw);
      return `<li class="trip"><h2>${esc(m.title)}</h2><p class="meta">${esc(m.sub)}</p><div class="acts"><button class="btn small" data-act="open" data-id="${esc(t.id)}">Ver plan</button><button class="btn link small" data-act="del" data-id="${esc(t.id)}">${confirmDel === t.id ? 'Toca otra vez para borrar' : 'Borrar'}</button></div></li>`;
    }).join('') + '</ul>'
    : '<div class="empty"><p>Todavía no tienes ningún viaje. Añade el primero y te preparo un calendario con cuándo dormir, comer y buscar luz.</p><button class="btn" data-act="new">Añadir viaje</button></div>';
  app().innerHTML = `<div class="scroll"><div class="wrap"><div class="top"><div><h1>Jet Lag Planner</h1><p class="lead">Tu plan para llegar descansada.</p></div>${S.trips.length ? '<button class="btn small" data-act="new">Añadir viaje</button>' : ''}</div>${list}
    <aside class="info callout" aria-label="Cómo funciona">${icon('info')}<span><b>Cómo funciona:</b> muevo tu reloj interno un poco cada día. Lo que más cuenta es la luz.</span></aside></div></div>`;
  app().onclick = e => {
    const b = (e.target as Element).closest('button'); if (!b) return;
    const a = b.dataset.act, id = b.dataset.id!;
    if (a === 'new') { resetWizard(); go('nuevo'); }
    else if (a === 'open') { S.current = id; persist.current(); calReset(); go('hoy'); }
    else if (a === 'del') {
      if (confirmDel === id) { syncAlerts(id, []).catch(() => {}); S.trips = S.trips.filter(x => x.id !== id); delete S.done[id]; persist.trips(); persist.done(); confirmDel = null; }
      else confirmDel = id;
      viewTrips();
    }
  };
  app().oninput = null; app().onchange = null; app().onkeydown = null;
}
