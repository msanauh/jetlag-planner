import type { PlanEvent } from '../core/plan';

const IC: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8.5 3v3M12 3v3"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  fork: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11M17 21V3c-2.6 1.6-3.6 5-3.6 8H17"/>',
  cube: '<path d="M4 9l8-4 8 4v8l-8 4-8-4V9z"/><path d="M4 9l8 4 8-4M12 13v8"/>',
  plane: '<path d="M21 15l-8-4.5V5a1.5 1.5 0 0 0-3 0v5.5L2 15v2l8-2v4l-2 1.5V22l4-1 4 1v-1.5L14 19v-4l7 2z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9.6 8.6l4.8 6.8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  takeoff: '<path d="M2 21h20"/><path d="M6.4 16.4 4 16l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.2.1a2 2 0 0 0 1.8 0L8 11 5 5l.9-.45a2 2 0 0 1 2.1.2l4 3a2 2 0 0 0 2.1.2l4.2-2.06a2.4 2.4 0 0 1 1.7-.17L21 6a1.4 1.4 0 0 1 .9 2l-.4.76a2.4 2.4 0 0 1-1.1 1.08L7.6 16.2a2 2 0 0 1-1.2.2z"/>',
  land: '<path d="M2 21h20"/><path d="M3.8 9.8 2 8l2-4.5 1.1.55A1.6 1.6 0 0 1 6 5.5a1.6 1.6 0 0 0 .9 1.45L8 7.5l3-6 1.05.53a2 2 0 0 1 1.1 1.52l.7 5.4a2 2 0 0 0 1.1 1.52l4.4 2.2a2.4 2.4 0 0 1 1 .96l.6 1.03c.5.88-.06 1.98-1.06 2.1l-1.2.15a2.4 2.4 0 0 1-1.37-.24L4.3 10.15a2 2 0 0 1-.5-.36z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  slash: '<path d="M4 4l16 16"/>',
};
export const icon = (n: string, crossed?: boolean | number, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}${crossed ? IC.slash : ''}</svg>`;

/** tipo → [carril, clase, icono, tachado] */
export const PILL: Record<string, [number, string, string, number]> = {
  'light-seek': [0, 'p-light', 'sun', 0], 'light-avoid': [0, 'p-avoid o-light', 'sun', 1],
  'caffeine-ok': [1, 'p-coffee', 'cup', 0], 'caffeine-avoid': [1, 'p-avoid o-coffee', 'cup', 1], 'caffeine-no': [1, 'p-avoid o-coffee', 'cup', 1],
  sleep: [2, 'p-sleep', 'moon', 0],
};
export function dotFor(e: PlanEvent, extra = ''): string {
  const pl = PILL[e.type];
  if (pl) return `<span class="dot ${pl[1]}${extra}">${icon(pl[2], pl[3])}</span>`;
  if (e.type === 'meal') return `<span class="dot p-meal${extra}">${icon('fork')}</span>`;
  if (e.type === 'melatonin') return `<span class="dot p-mel${extra}">${icon('pill')}</span>`;
  if (e.type === 'sugar-no') return `<span class="dot p-avoid o-sugar${extra}">${icon('cube', 1)}</span>`;
  return `<span class="dot p-flight${extra}">${icon(e.type === 'flight-arr' ? 'land' : 'takeoff')}</span>`;
}
