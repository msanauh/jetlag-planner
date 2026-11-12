import './styles.css';
import { loadCities } from './cities';
import { alertsFor } from './core/alerts';
import { isDayAt } from './ui/model';
import { app, curTrip, hooks, loadState, S } from './ui/state';
import { registerSW, syncAlerts } from './ui/push';
import { viewCalendar } from './ui/views/calendar';
import { viewList } from './ui/views/list';
import { viewToday } from './ui/views/today';
import { viewTrips } from './ui/views/trips';
import { viewWizard } from './ui/views/wizard';

let lastView = '';
function route(): void {
  const h = location.hash.replace('#', '');
  const el = app();
  // Cada pantalla pone sus propios manejadores.
  el.onclick = el.oninput = el.onchange = el.onkeydown = el.onsubmit = null;
  const prev = el.dataset.rendered;
  delete el.dataset.rendered;
  const has = !!curTrip();
  const view = h === 'nuevo' ? 'nuevo' : has && ['hoy', 'calendario', 'lista'].includes(h) ? h : 'viajes';
  // Al refrescar la misma pantalla se conserva el scroll.
  if (prev === view) el.dataset.rendered = prev;
  if (view !== 'nuevo') el.dataset.view = view;
  if (view !== lastView) document.getElementById('citylist')!.innerHTML = '';
  lastView = view;
  ({ nuevo: viewWizard, hoy: viewToday, calendario: viewCalendar, lista: viewList, viajes: viewTrips } as Record<string, () => void>)[view]();
}

async function boot(): Promise<void> {
  await loadState();
  // Marcar algo recalcula el plan: se reenvían los avisos al servidor (si están activados).
  hooks.afterDone = () => {
    const c = curTrip(); if (!c) return;
    syncAlerts(c.trip.id, alertsFor(c.b.p, { ...S.alerts, now: Date.now(), isDay: t => isDayAt(c.b, t) })).catch(() => {});
  };
  window.addEventListener('hashchange', route);
  let rt: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { if (location.hash === '#calendario') viewCalendar(); }, 150); });
  // Refresca "Hoy" y la línea de ahora cada minuto.
  setInterval(() => { if (['#hoy', '#calendario'].includes(location.hash) && !document.querySelector('[data-doneform], details[open]')) route(); }, 60_000);
  route();
  registerSW();
  // La base grande de ciudades llega en segundo plano.
  loadCities();
}
boot();
