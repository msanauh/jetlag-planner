import { findCity, searchCities } from '../../cities';
import { DAY, H, localToUtc } from '../../core/time';
import { DL, esc, fmtH, T } from '../format';
import { build, snap, type LegRaw, type TripRaw } from '../model';
import { icon } from '../icons';
import { app, go, persist, S } from '../state';
import { calReset } from './calendar';

interface WLeg { to: string; date: string; time: string; durH: string; durM: string; adapt: boolean }
interface WForm {
  home: string; bed: string; wake: string; mb: string; ml: string; md: string;
  legs: WLeg[]; mode: 'subtle' | 'abrupt'; origin: string; dir: 'auto' | 'adv' | 'del'; cutoff: string; melatonin: boolean;
}
let wiz: { step: number; err: string; f: WForm } | null = null;
const STEPS = 6;
const DEF = { home: 'Barcelona (España)', bed: '23:30', wake: '07:30', mb: '08:00', ml: '14:00', md: '21:00' };
const p2 = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const addDays = (date: string, n: number) => { const [y, m, d] = date.split('-').map(Number); return isoDate(new Date(y, m - 1, d + n)); };
const durOf = (l: WLeg) => (+l.durH || 0) + (+l.durM || 0) / 60;

export function resetWizard(): void { wiz = null; }

function newWiz() {
  const pr = { ...DEF, ...S.profile };
  return {
    step: 1, err: '',
    f: {
      home: pr.home, bed: pr.bed, wake: pr.wake, mb: pr.mb, ml: pr.ml, md: pr.md,
      legs: [{ to: '', date: isoDate(new Date(Date.now() + 14 * DAY)), time: '10:00', durH: '', durM: '0', adapt: false }],
      mode: 'subtle' as const, origin: '', dir: 'auto' as const, cutoff: '8', melatonin: false,
    },
  };
}

/* ---------- utilidades del formulario ---------- */
const fromCity = (f: WForm, i: number) => i === 0 ? findCity(f.origin || f.home) : findCity(f.legs[i - 1].to);
function legTimes(f: WForm, i: number): { dep: number; arr: number } | null {
  const l = f.legs[i], from = fromCity(f, i), dur = durOf(l);
  if (!from || !l.date || !l.time || !(dur > 0)) return null;
  const [y, m, d] = l.date.split('-').map(Number), [hh, mm] = l.time.split(':').map(Number);
  const dep = localToUtc(from.tz, y, m, d, hh, mm);
  return { dep, arr: dep + dur * H };
}
function arrivalText(f: WForm, i: number): string {
  const t = legTimes(f, i), dest = findCity(f.legs[i].to);
  if (!t || !dest) return '';
  return `Llegas el <b>${esc(DL(dest.tz).format(t.arr))} a las ${esc(T(dest.tz).format(t.arr))}</b>, hora de ${esc(dest.n)}.`;
}
function arrivalHTML(f: WForm, i: number): string {
  return icon('land') + '<span>' + (arrivalText(f, i) || 'Rellena el vuelo para ver a qué hora llegas.') + '</span>';
}
function stayText(f: WForm, i: number): string {
  const a = legTimes(f, i - 1), b = legTimes(f, i), c = findCity(f.legs[i - 1].to);
  if (!a || !b || !c) return '';
  const h = (b.dep - a.arr) / H;
  if (h < 0) return `<b>Este vuelo sale antes de que llegues a ${esc(c.n)}.</b>`;
  if (h < 12) return `Escala de ${fmtH(Math.round(h * 2) / 2)} h en ${esc(c.n)}: no cambia tu reloj.`;
  const days = fmtH(Math.round(h / 24 * 2) / 2);
  if (h <= 48) {
    const nextIsHome = findCity(f.legs[f.legs.length - 1].to)?.tz === findCity(f.origin || f.home)?.tz;
    return `Estancia corta (${days} d) en ${esc(c.n)}: te propongo no adaptarte y ${nextIsHome && i === f.legs.length - 1 ? 'mantener tu hora de casa' : 'seguir hacia tu siguiente destino'}.` +
      `<label class="check" style="margin-top:10px"><input type="checkbox" data-leg="${i - 1}" data-k="adapt"${f.legs[i - 1].adapt ? ' checked' : ''}><span>Adaptarme igualmente a ${esc(c.n)}</span></label>`;
  }
  return `Estancia de ${days} días en ${esc(c.n)}.`;
}
function toRaw(f: WForm, startAt: number): TripRaw {
  const home = findCity(f.home), origin = f.origin ? findCity(f.origin) : null;
  const legs: LegRaw[] = f.legs.map(l => { const c = findCity(l.to); return { to: l.to, toCity: c ? snap(c) : undefined, date: l.date, time: l.time, dur: String(durOf(l)), adapt: l.adapt || undefined }; });
  return {
    v: 2, home: f.home, homeCity: home ? snap(home) : undefined, origin: f.origin, originCity: origin ? snap(origin) : undefined,
    bed: f.bed, wake: f.wake, mb: f.mb, ml: f.ml, md: f.md, legs, mode: f.mode, dir: f.dir, cutoff: f.cutoff, tzmode: 'auto',
    melatonin: f.melatonin, startAt,
  };
}

/* ---------- aviso de poco margen ---------- */
function preflightHTML(f: WForm): string {
  let pf;
  try { pf = build(toRaw(f, Date.now())).p.preflight; } catch { return ''; }
  if (!pf || !pf.short) return '';
  if (pf.hoursLeft <= 0) return `<div class="warn">${icon('warn')}<div><b>Tu vuelo ya ha salido.</b> El plan empieza ahora y todo el ajuste será en destino.</div></div>`;
  const hrs = Math.round(pf.hoursLeft);
  const body = pf.achieved > 0
    ? `Quedan ${hrs} h para tu vuelo. De las ${fmtH(pf.total)} h de diferencia horaria, te da tiempo a ajustar ${fmtH(pf.achieved)} h antes de salir; las ${fmtH(pf.remaining)} h restantes, al llegar.`
    : `Quedan ${hrs} h para tu vuelo: no da tiempo a ajustar nada antes. Las ${fmtH(pf.total)} h de diferencia las ajustarás al llegar.`;
  return `<div class="warn" role="status">${icon('warn')}<div><b>Lo intentaremos.</b> ${body}` +
    (pf.suggestAbrupt ? '<br>Con tan poco margen, te irá mejor el modo brusco.<br><button class="btn small" data-act="abrupt">Pasar a brusco</button>' : '') + '</div></div>';
}

/* ---------- pasos ---------- */
function legFields(f: WForm, i: number): string {
  const l = f.legs[i], from = fromCity(f, i);
  return `<section class="legcard" aria-label="Vuelo ${i + 1}"><header><h2>Vuelo ${i + 1}${from ? ' · desde ' + esc(from.n) : ''}</h2><button class="btn link small" data-act="rmleg" data-i="${i}">Quitar</button></header>
    <label class="f">Destino<input class="in" data-leg="${i}" data-k="to" data-city list="citylist" spellcheck="false" autocomplete="off" value="${esc(l.to)}" placeholder="Ciudad"></label>
    <div class="pair"><label class="f">Fecha<input class="in" type="date" data-leg="${i}" data-k="date" value="${esc(l.date)}"></label><label class="f">Hora de salida<input class="in" type="time" data-leg="${i}" data-k="time" value="${esc(l.time)}"></label></div>
    <div class="pair"><label class="f">Duración (horas)<input class="in" type="number" min="0" max="30" step="1" inputmode="numeric" data-leg="${i}" data-k="durH" value="${esc(l.durH)}" placeholder="14"></label><label class="f">Minutos<select class="in" data-leg="${i}" data-k="durM">${['0', '15', '30', '45'].map(m => `<option value="${m}"${l.durM === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>
    <div class="info" data-arr="${i}">${arrivalHTML(f, i)}</div></section>`;
}

function stepHTML(): string {
  const f = wiz!.f, v = (k: keyof WForm) => esc(f[k] as string), l0 = f.legs[0];
  const head = (n: number) => `<div class="progress" aria-hidden="true">${Array.from({ length: STEPS }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div><p class="kicker">Paso ${n} de ${STEPS}</p>`;
  switch (wiz!.step) {
    case 1: return head(1) + `<h1>¿Dónde vives y cómo duermes?</h1><p class="lead">Con tu ciudad calculo el amanecer y el atardecer. Tus horas de siempre son el punto de partida.</p><div class="fields"><label class="f">Tu ciudad<input class="in" id="home" data-city list="citylist" spellcheck="false" autocomplete="off" value="${v('home')}" placeholder="Barcelona"></label><div class="pair"><label class="f">Me acuesto a las<input class="in" id="bed" type="time" value="${v('bed')}"></label><label class="f">Me levanto a las<input class="in" id="wake" type="time" value="${v('wake')}"></label></div></div>`;
    case 2: return head(2) + `<h1>¿A qué hora comes?</h1><p class="lead">Un día normal. Moveré las comidas junto con tu reloj.</p><div class="fields"><label class="f inline">Desayuno<input class="in" id="mb" type="time" value="${v('mb')}"></label><label class="f inline">Comida<input class="in" id="ml" type="time" value="${v('ml')}"></label><label class="f inline">Cena<input class="in" id="md" type="time" value="${v('md')}"></label></div>`;
    case 3: return head(3) + `<h1>¿A dónde vas y qué día sales?</h1><p class="lead">La diferencia horaria la calculo yo. Escribe y elige de la lista: hay más de 30 000 ciudades.</p><div class="fields"><label class="f">Ciudad de destino<input class="in" data-leg="0" data-k="to" data-city list="citylist" spellcheck="false" autocomplete="off" value="${esc(l0.to)}" placeholder="Tokio"></label><label class="f">Fecha de salida<input class="in" type="date" data-leg="0" data-k="date" value="${esc(l0.date)}"></label></div>`;
    case 4: return head(4) + `<h1>¿A qué hora sale tu vuelo?</h1><p class="lead">Hora local de salida y duración total del vuelo, como en tu billete.</p><div class="fields"><label class="f">Hora de salida<input class="in" type="time" data-leg="0" data-k="time" value="${esc(l0.time)}"></label><div class="pair"><label class="f">Duración (horas)<input class="in" type="number" min="0" max="30" step="1" inputmode="numeric" data-leg="0" data-k="durH" value="${esc(l0.durH)}" placeholder="14"></label><label class="f">Minutos<select class="in" data-leg="0" data-k="durM">${['0', '15', '30', '45'].map(m => `<option value="${m}"${l0.durM === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div><div class="info" data-arr="0">${arrivalHTML(f, 0)}</div></div>`;
    case 5: {
      const home = findCity(f.origin || f.home), last = findCity(f.legs[f.legs.length - 1].to);
      const hasReturn = !!home && !!last && f.legs.length > 1 && last.tz === home.tz && last.n === home.n;
      const extra = f.legs.slice(1).map((_, k) => { const i = k + 1, st = stayText(f, i); return (st ? `<p class="stayline">${st}</p>` : '') + legFields(f, i); }).join('');
      return head(5) + `<h1>¿Y después?</h1><p class="lead">Opcional. Añade la vuelta para preparar también el jet lag de regreso, u otras ciudades si el viaje tiene varias paradas.</p><div class="fields">${extra}<div class="addrow">${hasReturn ? '' : `<button class="btn ghost small" data-act="addret">Añadir vuelta${home ? ' a ' + esc(home.n) : ''}</button>`}<button class="btn ghost small" data-act="addleg">Añadir otra ciudad</button></div></div>`;
    }
    case 6: return head(6) + `<h1>¿Cómo quieres adaptarte?</h1><p class="lead">Elige el ritmo. Puedes crear otro viaje con el otro modo y comparar.</p><div class="fields"><div class="opts" role="radiogroup" aria-label="Modo de adaptación"><label class="opt"><input type="radio" name="mode" value="subtle"${f.mode === 'subtle' ? ' checked' : ''}><span><b>Suave</b>Empiezas 3 días antes de volar. Ajustes de unos 45 a 60 minutos al día.</span></label><label class="opt"><input type="radio" name="mode" value="abrupt"${f.mode === 'abrupt' ? ' checked' : ''}><span><b>Brusco</b>Empiezas 1 día antes. Ajustes de 1,5 a 2 horas al día, y llegas más cansada.</span></label></div><div id="pf">${preflightHTML(f)}</div></div>
      <details class="adv"><summary>Ajustes avanzados</summary><div class="fields"><label class="f">Ciudad de salida (solo si no sales de donde vives)<input class="in" id="origin" data-city list="citylist" spellcheck="false" autocomplete="off" value="${v('origin')}" placeholder="Vacío = tu ciudad"></label><label class="f">Dirección<select class="in" id="dir"><option value="auto">Automática (la más rápida)</option><option value="adv"${f.dir === 'adv' ? ' selected' : ''}>Forzar adelantar</option><option value="del"${f.dir === 'del' ? ' selected' : ''}>Forzar retrasar</option></select></label><label class="f">Último café antes de dormir<select class="in" id="cutoff">${['6', '8', '10'].map(c => `<option value="${c}"${f.cutoff === c ? ' selected' : ''}>${c} h antes</option>`).join('')}</select></label><label class="check"><input type="checkbox" id="melatonin"${f.melatonin ? ' checked' : ''}><span>Incluir melatonina<small>Opcional y desactivada por defecto. Dosis baja los días que adelantas. Es un modelo simplificado, no consejo médico: consúltalo con tu médico.</small></span></label></div></details>`;
  }
  return '';
}

function suggest(el: HTMLInputElement) {
  const dl = document.getElementById('citylist')!;
  dl.innerHTML = searchCities(el.value, 8).map(c => `<option value="${esc(c.label)}">`).join('');
}

export function viewWizard(): void {
  wiz ??= newWiz();
  const scrollEl = app().querySelector('.scroll');
  const keep = scrollEl && app().dataset.view === 'wizard' && app().dataset.step === String(wiz.step) ? scrollEl.scrollTop : 0;
  app().dataset.view = 'wizard'; app().dataset.step = String(wiz.step);
  app().innerHTML = `<div class="scroll"><div class="wrap">${stepHTML()}${wiz.err ? `<p class="err" role="alert">${esc(wiz.err)}</p>` : ''}</div></div><div class="nav"><div class="in-nav"><button class="btn link" data-act="back">${wiz.step === 1 ? 'Cancelar' : 'Atrás'}</button><button class="btn" data-act="next">${wiz.step === STEPS ? 'Crear plan' : wiz.step === 5 && wiz.f.legs.length === 1 ? 'Saltar' : 'Siguiente'}</button></div></div>`;
  app().onclick = e => {
    const b = (e.target as Element).closest('button'); if (!b || !wiz) return;
    const f = wiz.f;
    switch (b.dataset.act) {
      case 'back': if (wiz.step === 1) { wiz = null; go('viajes'); } else { wiz.step--; wiz.err = ''; viewWizard(); } break;
      case 'next': next(); break;
      case 'abrupt': f.mode = 'abrupt'; viewWizard(); break;
      case 'addret': {
        const last = f.legs[f.legs.length - 1];
        f.legs.push({ to: f.origin || f.home, date: addDays(last.date, 7), time: '10:00', durH: f.legs[0].durH, durM: f.legs[0].durM, adapt: false });
        viewWizard(); break;
      }
      case 'addleg': {
        const last = f.legs[f.legs.length - 1];
        f.legs.push({ to: '', date: addDays(last.date, 3), time: '10:00', durH: '', durM: '0', adapt: false });
        viewWizard(); break;
      }
      case 'rmleg': f.legs.splice(+b.dataset.i!, 1); wiz.err = ''; viewWizard(); break;
    }
  };
  app().oninput = e => {
    if (!wiz) return;
    const el = e.target as HTMLInputElement, f = wiz.f;
    if (el.name === 'mode') { f.mode = el.value as WForm['mode']; const pf = document.getElementById('pf'); if (pf) pf.innerHTML = preflightHTML(f); return; }
    const val = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.leg != null) (f.legs[+el.dataset.leg] as unknown as Record<string, unknown>)[el.dataset.k!] = val;
    else if (el.id && el.id in f) (f as unknown as Record<string, unknown>)[el.id] = val;
    if (el.dataset.city != null) suggest(el);
    app().querySelectorAll<HTMLElement>('[data-arr]').forEach(a => { a.innerHTML = arrivalHTML(f, +a.dataset.arr!); });
  };
  app().onchange = e => {
    const el = e.target as HTMLInputElement;
    // En el paso 5, al confirmar un campo se recalculan los textos de estancia (escala, corta, larga).
    if (wiz?.step === 5 && el.dataset.leg != null) viewWizard();
  };
  app().onkeydown = null;
  const first = app().querySelector<HTMLElement>('.in');
  if (first && !('ontouchstart' in window) && wiz.step < 5) first.focus();
  app().querySelector('.scroll')!.scrollTop = keep;
}

function next(): void {
  const w = wiz!, f = w.f;
  let err = '';
  const l0 = f.legs[0];
  if (w.step === 1) { if (!findCity(f.home)) err = 'No encuentro tu ciudad. Elige una de la lista, por ejemplo Barcelona.'; else if (!f.bed || !f.wake) err = 'Indica a qué hora te acuestas y te levantas.'; }
  if (w.step === 2 && (!f.mb || !f.ml || !f.md)) err = 'Indica la hora de las tres comidas.';
  if (w.step === 3) { if (!findCity(l0.to)) err = 'No encuentro esa ciudad. Elige una de la lista, por ejemplo Tokio.'; else if (!l0.date) err = 'Elige la fecha de salida.'; }
  if (w.step === 4) { if (!l0.time) err = 'Indica la hora de salida.'; else if (!(durOf(l0) > 0)) err = 'Indica cuánto dura el vuelo.'; }
  if (w.step === 5) {
    f.legs.slice(1).forEach((l, k) => {
      if (err) return;
      if (!findCity(l.to)) err = `No encuentro la ciudad del vuelo ${k + 2}.`;
      else if (!l.date || !l.time) err = `Indica fecha y hora del vuelo ${k + 2}.`;
      else if (!(durOf(l) > 0)) err = `Indica cuánto dura el vuelo ${k + 2}.`;
    });
    if (!err) { try { build(toRaw(f, Date.now())); } catch (e) { err = (e as Error).message; } }
  }
  if (w.step === 6) {
    if (f.origin && !findCity(f.origin)) err = 'No encuentro la ciudad de salida. Elige una de la lista o déjala vacía.';
    if (!err) {
      const raw = toRaw(f, Date.now());
      try { build(raw); } catch (e) { err = (e as Error).message; }
      if (!err) {
        const t = { id: String(Date.now()), raw };
        S.trips = [t, ...S.trips].slice(0, 30); persist.trips();
        S.profile = { home: f.home, bed: f.bed, wake: f.wake, mb: f.mb, ml: f.ml, md: f.md }; persist.profile();
        S.current = t.id; persist.current(); calReset();
        wiz = null; go('calendario'); return;
      }
    }
  }
  w.err = err;
  if (!err) w.step++;
  viewWizard();
}
