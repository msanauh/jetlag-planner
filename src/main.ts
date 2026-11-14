import './styles.css';
import { loadCities } from './cities';
import { isSubscribed, registerSW } from './ui/push';
import { app, curTrip, hooks, loadState, S } from './ui/state';
import { syncAll, syncTrip } from './ui/sync';
import { viewNoTrip } from './ui/views/tabs';
import { cal, viewCalendar } from './ui/views/calendar';
import { viewList } from './ui/views/list';
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
  // Sin pestaña en la URL: Hoy si hay viajes; si no, Viajes.
  // "#hoy" (enlaces antiguos y avisos) abre el calendario en el día de hoy.
  if (h === 'hoy') { cal.view = 1; cal.idx = null; location.replace('#calendario'); return; }
  const view = h === 'nuevo' ? 'nuevo' : ['calendario', 'lista', 'viajes'].includes(h) ? h : S.trips.length ? 'calendario' : 'viajes';
  // Al refrescar la misma pantalla se conserva el scroll.
  if (prev === view) el.dataset.rendered = prev;
  if (view !== 'nuevo') el.dataset.view = view;
  if (view !== lastView) document.getElementById('citylist')!.innerHTML = '';
  lastView = view;
  // Calendario y Lista necesitan un viaje; sin ninguno, estado vacío (la barra de pestañas sigue).
  if ((view === 'calendario' || view === 'lista') && !curTrip()) return viewNoTrip(view);
  ({ nuevo: viewWizard, calendario: viewCalendar, lista: viewList, viajes: viewTrips } as Record<string, () => void>)[view]();
}

async function boot(): Promise<void> {
  await loadState();
  // Marcar algo recalcula el plan: se reenvían los avisos al servidor (si están activados).
  hooks.afterDone = tripId => { syncTrip(tripId).catch(() => {}); };
  window.addEventListener('hashchange', route);
  let rt: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => { if (location.hash === '#calendario') viewCalendar(); }, 150); });
  // Refresca la línea de "ahora" del calendario cada minuto.
  setInterval(() => { if (location.hash === '#calendario' && !document.querySelector('[data-doneform], details[open]')) route(); }, 60_000);
  route();
  registerSW();
  // Si los avisos están activos, el servidor recibe los de todos los viajes al abrir la app.
  isSubscribed().then(v => { if (v) syncAll(); }).catch(() => {});
  // La base grande de ciudades llega en segundo plano.
  loadCities();
}
boot();
