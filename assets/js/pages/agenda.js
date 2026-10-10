// Agenda pública (agendar.html): el paciente elige examen, día y hora y deja
// sus datos, sin crear una cuenta. Al confirmar se guardan la cita y el
// paciente, que queda listo en el panel para cargar sus estudios.

import { agendaConfig } from '../config/agenda-config.js';
import { backend } from '../services/backend.js';
import { addDays, bookingRange, daySlots, examLabel, isoDate, parseIso, SlotTakenError } from '../services/agenda.js';
import { escapeHtml, showError } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const longDate = (iso) => parseIso(iso).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export async function init() {
  const $ = (id) => document.getElementById(id);
  const form = $('booking-form');
  const errEl = $('bk-error');
  const submit = $('bk-submit');
  const state = { exam: null, date: null, time: null, month: null, busy: new Set(), loadedAt: 0, range: bookingRange() };

  // --- Disponibilidad -------------------------------------------------------------
  async function loadBusy() {
    state.range = bookingRange();
    try {
      state.busy = await backend.listBusySlots(state.range.from, state.range.to);
      state.loadedAt = Date.now();
      return true;
    } catch (e) {
      console.error(e);
      $('bk-cal').innerHTML = '<p class="form-error show">No se pudo consultar la disponibilidad. Revise su conexión e intente de nuevo, o llámenos al ' + escapeHtml(agendaConfig.clinic.phone) + '.</p>';
      return false;
    }
  }
  const freeSlots = (date) => daySlots(date, state.busy).filter((s) => s.state === 'free');
  const inRange = (date) => date >= state.range.from && date <= state.range.to;

  // --- 1. Examen --------------------------------------------------------------------
  const examsEl = $('bk-exams');
  examsEl.innerHTML = agendaConfig.exams.map((e) => `
    <label class="bk-exam">
      <input type="radio" name="exam" value="${escapeHtml(e.id)}">
      <span><strong>${escapeHtml(e.label)}</strong><small>${escapeHtml(e.detail)}</small></span>
    </label>`).join('');
  examsEl.addEventListener('change', (e) => { state.exam = e.target.value; update(); });
  const wanted = new URLSearchParams(location.search).get('examen');
  const pre = wanted && examsEl.querySelector(`input[value="${CSS.escape(wanted)}"]`);
  if (pre) { pre.checked = true; state.exam = pre.value; }

  // --- 2. Calendario ----------------------------------------------------------------
  const calEl = $('bk-cal');
  function renderCalendar() {
    const m = state.month;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // semana desde el lunes
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const minMonth = parseIso(state.range.from);
    const maxMonth = parseIso(state.range.to);
    const canPrev = first > new Date(minMonth.getFullYear(), minMonth.getMonth(), 1);
    const canNext = new Date(m.getFullYear(), m.getMonth() + 1, 1) <= maxMonth;
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const date = isoDate(new Date(m.getFullYear(), m.getMonth(), d));
      const n = inRange(date) ? freeSlots(date).length : 0;
      const cls = ['bk-day', date === state.date ? 'sel' : '', date === state.range.from ? 'today' : ''].join(' ');
      const label = longDate(date) + (n ? ` · ${n} horario${n > 1 ? 's' : ''} libre${n > 1 ? 's' : ''}` : ' · sin horarios');
      cells += `<button type="button" class="${cls}" data-date="${date}" ${n ? '' : 'disabled'} aria-label="${escapeHtml(label)}" aria-pressed="${date === state.date}">${d}</button>`;
    }
    const title = first.toLocaleDateString('es', { month: 'long', year: 'numeric' });
    calEl.innerHTML = `
      <div class="bk-cal-head">
        <button type="button" class="icon-btn" data-month="-1" ${canPrev ? '' : 'disabled'} aria-label="Mes anterior">${icon('chevronLeft')}</button>
        <strong>${escapeHtml(title.charAt(0).toUpperCase() + title.slice(1))}</strong>
        <button type="button" class="icon-btn" data-month="1" ${canNext ? '' : 'disabled'} aria-label="Mes siguiente">${icon('chevronRight')}</button>
      </div>
      <div class="bk-cal-grid">${WEEKDAYS.map((w) => `<span class="bk-wd">${w}</span>`).join('')}${cells}</div>`;
  }
  calEl.addEventListener('click', async (e) => {
    const mb = e.target.closest('[data-month]');
    if (mb) { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(mb.dataset.month), 1); renderCalendar(); return; }
    const db = e.target.closest('[data-date]');
    if (!db || db.disabled) return;
    state.date = db.dataset.date;
    state.time = null;
    // Si la página lleva un rato abierta, se vuelve a consultar lo ocupado.
    if (Date.now() - state.loadedAt > 60000) await loadBusy();
    update();
    $('bk-times').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // --- 3. Hora ----------------------------------------------------------------------
  const timesEl = $('bk-times');
  function renderTimes() {
    if (!state.date) { timesEl.innerHTML = '<p class="muted">Primero elija un día.</p>'; return; }
    const slots = daySlots(state.date, state.busy).filter((s) => s.state !== 'past');
    if (!slots.some((s) => s.state === 'free')) { timesEl.innerHTML = '<p class="muted">No quedan horarios este día. Elija otro.</p>'; return; }
    const group = (title, list) => (list.length ? `<div class="bk-tgroup"><h4>${title}</h4><div class="bk-times">${list.map((s) =>
      `<button type="button" class="bk-time ${s.time === state.time ? 'sel' : ''}" data-time="${s.time}" ${s.state === 'free' ? '' : 'disabled title="Ocupado"'} aria-pressed="${s.time === state.time}">${s.time}</button>`).join('')}</div></div>` : '');
    timesEl.innerHTML = `<p class="bk-date-title">${escapeHtml(longDate(state.date))}</p>` +
      group('Mañana', slots.filter((s) => s.time < '13:00')) + group('Tarde', slots.filter((s) => s.time >= '13:00'));
  }
  timesEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-time]');
    if (!b || b.disabled) return;
    state.time = b.dataset.time;
    update();
  });

  // --- Resumen ----------------------------------------------------------------------
  function update() {
    renderCalendar();
    renderTimes();
    const set = (k, v) => { document.querySelector(`[data-sum="${k}"]`).textContent = v || '—'; };
    set('exam', state.exam && examLabel(state.exam));
    set('date', state.date && longDate(state.date));
    set('time', state.time);
    submit.disabled = !(state.exam && state.date && state.time);
  }

  // --- Confirmar ----------------------------------------------------------------------
  let booked = null;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(errEl, '');
    if (!state.exam) { showError(errEl, 'Elija el tipo de examen.'); return; }
    if (!state.date || !state.time) { showError(errEl, 'Elija el día y la hora.'); return; }
    const fd = Object.fromEntries(new FormData(form));
    if (!String(fd.firstName || '').trim() || !String(fd.lastName || '').trim()) {
      showError(errEl, 'Escriba su nombre y su apellido.');
      (String(fd.firstName || '').trim() ? $('bk-last') : $('bk-first')).focus();
      return;
    }
    const input = { ...fd, exam: state.exam, date: state.date, time: state.time };
    submit.disabled = true;
    const label = submit.innerHTML;
    submit.textContent = 'Agendando…';
    try {
      // Campo trampa completado: es un robot. Se simula el éxito sin guardar nada.
      booked = fd.website ? { ...input, code: '—' } : await backend.bookAppointment(input);
      showDone(booked);
    } catch (ex) {
      showError(errEl, ex.message);
      if (ex instanceof SlotTakenError) { state.time = null; await loadBusy(); update(); }
    }
    submit.innerHTML = label;
    submit.disabled = !(state.exam && state.date && state.time);
  });

  function showDone(b) {
    $('booking').hidden = true;
    document.querySelector('.booking-head').hidden = true;
    const done = $('bk-done');
    done.hidden = false;
    $('bk-done-lead').textContent = `${b.firstName}, lo esperamos el ${longDate(b.date)} a las ${b.time}.`;
    const rows = [
      ['Código de la cita', b.code],
      ['Examen', examLabel(b.exam)],
      ['Paciente', `${b.firstName} ${b.lastName}`],
      ['Dirección', agendaConfig.clinic.address],
      ['Teléfono', agendaConfig.clinic.phone]
    ];
    $('bk-done-details').innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
    $('bk-instructions').innerHTML = agendaConfig.instructions.map((t) => `<li>${escapeHtml(t)}</li>`).join('') +
      '<li>Si no puede asistir, avísenos por teléfono para liberar el horario.</li>';
    window.scrollTo({ top: 0 });
    done.focus();
  }

  $('bk-ics').addEventListener('click', () => { if (booked) downloadIcs(booked); });
  $('bk-again').addEventListener('click', async () => {
    form.reset();
    Object.assign(state, { exam: null, date: null, time: null });
    booked = null;
    $('bk-done').hidden = true;
    $('booking').hidden = false;
    document.querySelector('.booking-head').hidden = false;
    await loadBusy();
    update();
    window.scrollTo({ top: 0 });
  });

  // --- Inicio -------------------------------------------------------------------------
  if (!(await loadBusy())) return;
  // Mes inicial: el del primer día con horarios libres.
  let first = state.range.from;
  while (first <= state.range.to && !freeSlots(first).length) first = addDays(first, 1);
  const startMonth = parseIso(first <= state.range.to ? first : state.range.from);
  state.month = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
  update();
}

// Archivo .ics para agregar la cita al calendario del teléfono o del correo.
function downloadIcs(b) {
  const { slotMinutes, clinic } = agendaConfig;
  const stamp = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
    'T' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '00';
  const start = parseIso(b.date);
  const [h, m] = b.time.split(':').map(Number);
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + slotMinutes * 60000);
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DentFrucer//Agenda//ES', 'BEGIN:VEVENT',
    'UID:' + (b.id || Date.now()) + '@dentfrucer',
    'DTSTAMP:' + stamp(new Date()),
    'DTSTART:' + stamp(start), 'DTEND:' + stamp(end),
    'SUMMARY:' + esc(examLabel(b.exam) + ' · DentFrucer'),
    'LOCATION:' + esc(clinic.address),
    'DESCRIPTION:' + esc('Código de la cita: ' + b.code + '\n' + agendaConfig.instructions.join('\n')),
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'cita-dentfrucer.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
