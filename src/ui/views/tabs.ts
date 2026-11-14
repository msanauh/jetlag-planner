import { icon } from '../icons';
import { app, go } from '../state';

export function tabs(active: string): string {
  const t = [['viajes', 'plane', 'Viajes'], ['hoy', 'sun', 'Hoy'], ['calendario', 'cal', 'Calendario'], ['lista', 'list', 'Lista']];
  return '<nav class="tabs" aria-label="Secciones">' + t.map(x => `<button data-tab="${x[0]}"${x[0] === active ? ' aria-current="page"' : ''}>${icon(x[1])}<span>${x[2]}</span></button>`).join('') + '</nav>';
}
export function onTab(e: Event): boolean {
  const b = (e.target as Element).closest<HTMLElement>('[data-tab]');
  if (!b) return false;
  go(b.dataset.tab!);
  return true;
}

/** Calendario o Lista sin ningún viaje. */
export function viewNoTrip(tab: string): void {
  app().innerHTML = `<div class="scroll"><div class="wrap now idle"><span class="dot big p-flight">${icon('plane')}</span>
    <h1 class="hero">Aún no tienes ningún viaje</h1>
    <p class="lead c">Añade uno y aquí verás tu plan día a día.</p>
    <button class="btn" data-act="new" style="margin-top:28px">Añadir viaje</button></div></div>${tabs(tab)}`;
  app().onclick = e => {
    if (onTab(e)) return;
    if ((e.target as Element).closest('[data-act="new"]')) go('nuevo');
  };
}
