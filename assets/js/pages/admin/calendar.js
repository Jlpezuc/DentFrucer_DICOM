// Calendario de la agenda (panel): vista de semana con franja horaria y vista
// de mes. Una cita se abre para editarla; un hueco de la semana crea una cita
// a esa hora; un día (encabezado de la semana o celda del mes) muestra la lista
// de ese día.
//
//   createCalendar(el, { appointments, onEdit, onNew, onPickDay })
//     .render(view)   view: 'week' | 'month'

import { agendaConfig } from '../../config/agenda-config.js';
import { addDays, examLabel, isActive, isoDate, parseIso } from '../../services/agenda.js';
import { escapeHtml } from '../../ui/dom.js';
import { today } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';

const PX_PER_MIN = 1.6;        // alto de la franja horaria: 20 min = 32 px
const MONTH_CHIPS = 3;         // citas visibles por día en el mes
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const EXAM_CLASS = { CBCT: 'ex-cbct', 'Panorámica': 'ex-pano', 'Cefalometría': 'ex-ceph', Periapical: 'ex-peri' };
const STATUS_CLASS = { Atendida: 'st-done', 'No asistió': 'st-noshow', Cancelada: 'st-cancel' };

const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
const mondayOf = (iso) => addDays(iso, -((parseIso(iso).getDay() + 6) % 7));
const shortName = (name) => { const [a, b] = String(name || '').split(' '); return b ? a + ' ' + b[0] + '.' : a || ''; };
const fmt = (iso, opts) => parseIso(iso).toLocaleDateString('es', opts);
const evClass = (a) => ['cal-ev', EXAM_CLASS[a.exam] || 'ex-other', STATUS_CLASS[a.status] || ''].join(' ');
const evTitle = (a) => `${a.time} · ${a.name} · ${examLabel(a.exam)} · ${a.status}`;

// Horario de atención de un día: [[inicio, fin], …] en minutos (vacío si cierra).
function openRanges(iso) {
  if (agendaConfig.closedDates.includes(iso)) return [];
  return (agendaConfig.hours[parseIso(iso).getDay()] || []).map(([a, b]) => [toMin(a), toMin(b)]);
}

export function createCalendar(el, { appointments, onEdit, onNew, onPickDay }) {
  let cursor = today();
  let view = 'week';

  el.innerHTML = `
    <div class="cal-bar">
      <div class="cal-nav">
        <button type="button" class="icon-btn" data-cal-step="-1" aria-label="Anterior">${icon('chevronLeft')}</button>
        <button type="button" class="btn btn-outline btn-sm" data-cal-today>Hoy</button>
        <button type="button" class="icon-btn" data-cal-step="1" aria-label="Siguiente">${icon('chevronRight')}</button>
      </div>
      <h3 class="cal-title" aria-live="polite"></h3>
      <ul class="cal-legend" aria-label="Colores por examen">
        <li class="ex-cbct">CBCT</li><li class="ex-pano">Panorámica</li><li class="ex-ceph">Cefalometría</li><li class="ex-peri">Intraorales</li><li class="ex-other">Otro</li>
      </ul>
    </div>
    <div class="cal-body"></div>`;
  const title = el.querySelector('.cal-title');
  const body = el.querySelector('.cal-body');

  const byDate = () => {
    const map = new Map();
    for (const a of appointments()) {
      if (!map.has(a.date)) map.set(a.date, []);
      map.get(a.date).push(a);
    }
    map.forEach((list) => list.sort((x, y) => x.time.localeCompare(y.time) || (isActive(y) - isActive(x))));
    return map;
  };

  // --- Semana ---------------------------------------------------------------------------
  function week() {
    const start = mondayOf(cursor);
    const all = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const appts = byDate();
    // Sábado y domingo solo si atienden o tienen citas.
    const days = all.filter((d, i) => i < 5 || openRanges(d).length || (appts.get(d) || []).length);
    const end = all[6];
    title.textContent = parseIso(start).getMonth() === parseIso(end).getMonth()
      ? `${fmt(start, { day: 'numeric' })} – ${fmt(end, { day: 'numeric', month: 'long', year: 'numeric' })}`
      : `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;

    // Rango de horas: el horario de atención y cualquier cita fuera de él.
    let from = Infinity;
    let to = -Infinity;
    for (const d of days) {
      for (const [a, b] of openRanges(d)) { from = Math.min(from, a); to = Math.max(to, b); }
      for (const a of appts.get(d) || []) { from = Math.min(from, toMin(a.time)); to = Math.max(to, toMin(a.time) + agendaConfig.slotMinutes); }
    }
    if (!Number.isFinite(from)) { from = 9 * 60; to = 18 * 60; }
    from = Math.floor(from / 60) * 60;
    to = Math.ceil(to / 60) * 60;
    const y = (min) => (min - from) * PX_PER_MIN;
    const height = y(to);
    const t = today();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const hours = [];
    for (let h = from; h <= to; h += 60) hours.push(h);

    const head = days.map((d) => {
      const list = (appts.get(d) || []).filter(isActive);
      return `<button type="button" class="cal-dayhead${d === t ? ' is-today' : ''}${openRanges(d).length ? '' : ' is-closed'}" data-day="${d}" title="Ver la lista del ${escapeHtml(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }))}">
        <span>${WEEKDAYS[(parseIso(d).getDay() + 6) % 7]}</span><strong>${parseIso(d).getDate()}</strong>${list.length ? `<em>${list.length} cita${list.length > 1 ? 's' : ''}</em>` : '<em class="none">—</em>'}
      </button>`;
    }).join('');

    const cols = days.map((d) => {
      // Fuera del horario de atención: franjas sombreadas.
      const open = openRanges(d);
      const off = [];
      let last = from;
      for (const [a, b] of open) { if (a > last) off.push([last, Math.min(a, to)]); last = Math.max(last, b); }
      if (last < to) off.push([last, to]);
      // Citas: las que comparten hora se reparten el ancho.
      const list = appts.get(d) || [];
      const sameTime = new Map();
      list.forEach((a) => sameTime.set(a.time, (sameTime.get(a.time) || 0) + 1));
      const seen = new Map();
      const events = list.map((a) => {
        const n = sameTime.get(a.time);
        const i = seen.get(a.time) || 0;
        seen.set(a.time, i + 1);
        const top = y(toMin(a.time));
        const h = agendaConfig.slotMinutes * PX_PER_MIN - 2;
        return `<button type="button" class="${evClass(a)}" data-appt="${escapeHtml(a.id)}" title="${escapeHtml(evTitle(a))}"
          style="top:${top}px;height:${h}px;left:calc(${(i / n) * 100}% + 3px);width:calc(${100 / n}% - 6px)">
          <b>${escapeHtml(a.time)}</b><span>${escapeHtml(shortName(a.name))}</span><small>${escapeHtml(a.exam)}</small>
        </button>`;
      }).join('');
      const nowLine = d === t && nowMin >= from && nowMin <= to ? `<div class="cal-now" style="top:${y(nowMin)}px"></div>` : '';
      return `<div class="cal-col${d === t ? ' is-today' : ''}" data-col="${d}" style="height:${height}px">
        ${off.map(([a, b]) => `<div class="cal-off" style="top:${y(a)}px;height:${y(b) - y(a)}px"></div>`).join('')}
        ${events}${nowLine}
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="cal-week" style="--days:${days.length}">
        <div class="cal-week-head"><span></span>${head}</div>
        <div class="cal-week-scroll">
          <div class="cal-week-grid" style="height:${height}px">
            <div class="cal-hours">${hours.map((h) => `<span style="top:${y(h)}px">${toTime(h)}</span>`).join('')}</div>
            ${cols}
          </div>
        </div>
      </div>
      <p class="cal-hint">Haga clic en una cita para editarla o en un horario libre para crear una cita a esa hora.</p>`;

    // Se muestra desde la primera cita de la semana (o desde la apertura).
    const starts = days.flatMap((d) => (appts.get(d) || []).filter(isActive).map((x) => toMin(x.time)));
    const focusMin = starts.length ? Math.min(...starts) - agendaConfig.slotMinutes : from;
    body.querySelector('.cal-week-scroll').scrollTop = Math.max(0, y(focusMin));
  }

  // --- Mes ------------------------------------------------------------------------------
  function month() {
    const first = parseIso(cursor.slice(0, 8) + '01');
    const firstIso = isoDate(first);
    const start = mondayOf(firstIso);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const weeks = Math.ceil((offset + daysInMonth) / 7);
    const label = first.toLocaleDateString('es', { month: 'long', year: 'numeric' });
    title.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    const appts = byDate();
    const t = today();

    const cells = Array.from({ length: weeks * 7 }, (_, i) => {
      const d = addDays(start, i);
      const inMonth = parseIso(d).getMonth() === first.getMonth();
      const list = (appts.get(d) || []).filter(isActive);
      const chips = list.slice(0, MONTH_CHIPS).map((a) =>
        `<button type="button" class="${evClass(a)}" data-appt="${escapeHtml(a.id)}" title="${escapeHtml(evTitle(a))}"><b>${escapeHtml(a.time)}</b> ${escapeHtml(shortName(a.name))}</button>`).join('');
      const more = list.length > MONTH_CHIPS ? `<span class="cal-more">+${list.length - MONTH_CHIPS} más</span>` : '';
      const cls = ['cal-cell', inMonth ? '' : 'is-out', d === t ? 'is-today' : '', openRanges(d).length ? '' : 'is-closed'].join(' ');
      return `<div class="${cls}" data-day="${d}" role="button" tabindex="0" aria-label="${escapeHtml(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }))}: ${list.length} cita(s)">
        <span class="cal-num">${parseIso(d).getDate()}</span>${chips}${more}
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="cal-month">
        <div class="cal-month-head">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
        <div class="cal-month-grid">${cells}</div>
      </div>
      <p class="cal-hint">Haga clic en un día para ver su lista de citas, o en una cita para editarla.</p>`;
  }

  // --- Interacción ------------------------------------------------------------------------
  el.addEventListener('click', (e) => {
    const step = e.target.closest('[data-cal-step]');
    if (step) {
      const n = Number(step.dataset.calStep);
      if (view === 'week') cursor = addDays(cursor, 7 * n);
      else { const d = parseIso(cursor); cursor = isoDate(new Date(d.getFullYear(), d.getMonth() + n, 1)); }
      render(view);
      return;
    }
    if (e.target.closest('[data-cal-today]')) { cursor = today(); render(view); return; }
    const ev = e.target.closest('[data-appt]');
    if (ev) { onEdit(ev.dataset.appt); return; }
    const day = e.target.closest('[data-day]');
    if (day) { onPickDay(day.dataset.day); return; }
    // Hueco de la semana: nueva cita en el turno más cercano.
    const col = e.target.closest('[data-col]');
    if (col) {
      const grid = col.getBoundingClientRect();
      const from = toMin(body.querySelector('.cal-hours span').textContent);
      const min = from + (e.clientY - grid.top) / PX_PER_MIN;
      const slot = Math.floor(min / agendaConfig.slotMinutes) * agendaConfig.slotMinutes;
      onNew(col.dataset.col, toTime(slot));
    }
  });
  el.addEventListener('keydown', (e) => {
    const day = e.target.closest('.cal-cell[data-day]');
    if (day && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPickDay(day.dataset.day); }
  });

  function render(v = view) {
    view = v;
    if (view === 'month') month(); else week();
  }

  return {
    render,
    // Lleva el calendario a la fecha (por ejemplo, el día elegido en la lista).
    goTo(iso) { if (iso) cursor = iso; }
  };
}
