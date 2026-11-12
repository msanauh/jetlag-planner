/* Marcar como hecho. Un toque lo marca con la hora del plan; después se puede
   corregir la hora real ("Cena a las 21:15" en lugar de las 20:15). */
import type { PlanEvent } from '../../core/plan';
import { esc, HM } from '../format';
import { icon } from '../icons';
import { markable, MEALN, timeNear, type DoneRec } from '../model';
import { S, setDone } from '../state';

export const doneUi = { editing: null as string | null };

/** Hora de referencia del plan para cada tipo (el último café es el final del tramo). */
export const plannedAt = (e: PlanEvent) => (e.type === 'caffeine-ok' ? e.end : e.start);
/** Solo la luz y el sueño mueven el reloj (y por tanto recolocan el plan). */
export const movesClock = (e: PlanEvent) => !e.maintain && !e.adapted && (e.type === 'light-seek' || e.type === 'light-avoid' || e.type === 'sleep');
/** Los "evitar" no tienen hora que corregir. */
const timed = (e: PlanEvent) => !['caffeine-avoid', 'caffeine-no', 'sugar-no'].includes(e.type);

export function doneLabel(e: PlanEvent): string {
  switch (e.type) {
    case 'meal': return `${MEALN[e.meal ?? '']} a las`;
    case 'sleep': return 'Me acosté a las';
    case 'caffeine-ok': return 'Último café a las';
    case 'melatonin': return 'La tomé a las';
    default: return 'Empecé a las';
  }
}

/** Texto corto del estado: "Cena a las 21:15 (plan 20:15)", "Hecho" o "No lo hiciste". */
export function doneText(e: PlanEvent, rec: DoneRec, tz: string): string {
  if (rec.skipped) return 'No lo hiciste';
  if (!timed(e)) return 'Hecho';
  const real = HM(tz, rec.at), plan = HM(tz, plannedAt(e));
  return `${doneLabel(e)} ${real}` + (real !== plan ? ` (plan ${plan})` : '');
}

/** Controles de hecho para la ficha del calendario o una fila de Hoy. */
export function doneControls(tripId: string, e: PlanEvent, tz: string): string {
  if (!markable(e)) return '';
  const rec = S.done[tripId]?.[e.id];
  const id = esc(e.id);
  if (doneUi.editing === e.id && timed(e)) {
    const val = HM(tz, rec?.at ?? plannedAt(e));
    return `<form class="doneform" data-doneform="${id}"><div class="row"><label class="f">${esc(doneLabel(e))}<input class="in" type="time" name="t" value="${val}" required></label><button class="btn small" type="submit">Guardar</button><button class="btn link small" type="button" data-done="cancel" data-ev="${id}">Cancelar</button></div></form>`;
  }
  if (rec?.skipped) {
    return `<div class="doneform"><span class="donechip skipped">${icon('x')}No lo hiciste${movesClock(e) ? ' · he ajustado los días siguientes' : ''}</span><div class="row"><button class="btn link small" data-done="undo" data-ev="${id}">Deshacer</button></div></div>`;
  }
  if (rec) {
    return `<div class="doneform"><span class="donechip">${icon('check')}${esc(doneText(e, rec, tz))}</span><div class="row">${timed(e) ? `<button class="btn ghost small" data-done="edit" data-ev="${id}">Cambiar hora</button>` : ''}<button class="btn link small" data-done="undo" data-ev="${id}">Deshacer</button></div></div>`;
  }
  return `<div class="doneform"><div class="row"><button class="btn small" data-done="mark" data-ev="${id}">${icon('check')}Hecho</button><button class="btn ghost small" data-done="skip" data-ev="${id}">${icon('x')}No lo hice</button></div></div>`;
}

/** Gestiona clics y envíos de los controles. Devuelve true si los ha atendido. */
export function handleDone(target: Element, tripId: string, find: (id: string) => { e: PlanEvent; tz: string } | null, rerender: () => void): boolean {
  const b = target.closest<HTMLElement>('[data-done]');
  if (!b) return false;
  const hit = find(b.dataset.ev!);
  if (!hit) return true;
  const { e } = hit;
  switch (b.dataset.done) {
    case 'mark': setDone(tripId, e.id, { at: plannedAt(e) }); doneUi.editing = null; break;
    case 'toggle': setDone(tripId, e.id, S.done[tripId]?.[e.id] ? null : { at: plannedAt(e) }); break;
    case 'skip': setDone(tripId, e.id, { at: plannedAt(e), skipped: true }); doneUi.editing = null; break;
    case 'edit': doneUi.editing = e.id; break;
    case 'undo': setDone(tripId, e.id, null); doneUi.editing = null; break;
    case 'cancel': doneUi.editing = null; break;
  }
  rerender();
  if (b.dataset.done === 'edit') document.querySelector<HTMLInputElement>('[data-doneform] input')?.focus();
  return true;
}

export function handleDoneSubmit(ev: SubmitEvent, tripId: string, find: (id: string) => { e: PlanEvent; tz: string } | null, rerender: () => void): boolean {
  const form = (ev.target as Element).closest<HTMLFormElement>('[data-doneform]');
  if (!form) return false;
  ev.preventDefault();
  const hit = find(form.dataset.doneform!);
  const val = (form.elements.namedItem('t') as HTMLInputElement).value;
  if (hit && val) setDone(tripId, hit.e.id, { at: timeNear(hit.tz, val, plannedAt(hit.e)) });
  doneUi.editing = null;
  rerender();
  return true;
}
