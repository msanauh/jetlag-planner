import { icon } from '../icons';
import { go } from '../state';

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
