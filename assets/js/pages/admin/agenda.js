// Agenda en el panel: lista (hoy, próximas, anteriores o un día cualquiera) y
// calendario de semana y de mes (calendar.js); crear, editar, cambiar de estado
// y borrar citas. Cambiar el día, la hora o cancelar mueve o libera el turno,
// así que la agenda pública siempre muestra la disponibilidad real.

import { agendaConfig } from '../../config/agenda-config.js';
import { addDays, adminDayTimes, APPOINTMENT_STATUSES, examLabel, isActive, parseIso, slotId } from '../../services/agenda.js';
import { backend } from '../../services/backend.js';
import { fmtCLP } from '../../services/payments.js';
import { busy, escapeHtml, modal, showError, toast } from '../../ui/dom.js';
import { fmtDate, today } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { createCalendar } from './calendar.js';
import { contactOf, formValues, personCell } from './common.js';

const EMPTY = { today: 'No hay citas para hoy.', next: 'No hay citas próximas.', past: 'No hay citas anteriores.', day: 'No hay citas este día.' };
const VIEW_KEY = 'dentfrucer.agenda.view';
const longDay = (iso) => parseIso(iso).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function createAgenda(ctx) {
  const { state } = ctx;
  const $ = (id) => document.getElementById(id);
  const body = $('agenda-body');
  const dayInput = $('agenda-day');
  const summary = $('agenda-summary');
  let filter = 'today'; // 'today' | 'next' | 'past' | 'day' (el de dayInput)
  let view = 'list';    // 'list' | 'week' | 'month'

  // --- Lista ---------------------------------------------------------------------------
  function rowsFor(f) {
    const t = today();
    const day = f === 'today' ? t : f === 'day' ? dayInput.value : null;
    const rows = state.appointments.filter((a) => (day ? a.date === day : f === 'next' ? a.date > t && isActive(a) : a.date < t));
    return f === 'past' ? rows.reverse() : rows;
  }

  // Pestañas y día: "Hoy" es el día de hoy; elegir otro día deja las pestañas sin marcar.
  function setFilter(f, day) {
    if (f === 'day' && day === today()) f = 'today';
    filter = f;
    dayInput.value = f === 'today' ? today() : f === 'day' ? day : '';
    document.querySelectorAll('#agenda-tabs [data-filter]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === f)));
    renderList();
  }

  function statusSelect(a) {
    return '<label class="sr-only" for="as-' + escapeHtml(a.id) + '">Estado de la cita de ' + escapeHtml(a.name) + '</label>' +
      '<select class="input select input-sm" id="as-' + escapeHtml(a.id) + '" data-status="' + escapeHtml(a.id) + '">' +
      APPOINTMENT_STATUSES.map((st) => '<option' + (st === a.status ? ' selected' : '') + '>' + st + '</option>').join('') + '</select>';
  }

  function renderList() {
    const rows = rowsFor(filter);
    const oneDay = filter === 'today' || filter === 'day';
    const active = rows.filter(isActive).length;
    summary.textContent = oneDay
      ? longDay(dayInput.value).replace(/^./, (c) => c.toUpperCase()) + ' · ' + (active ? active + ' cita' + (active > 1 ? 's' : '') : 'sin citas') + (rows.length > active ? ' (' + (rows.length - active) + ' cancelada' + (rows.length - active > 1 ? 's' : '') + ')' : '')
      : rows.length + ' cita' + (rows.length === 1 ? '' : 's');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty">' + EMPTY[filter] + ' Cree una con <strong>Nueva cita</strong> o comparta la <a href="agendar.html" target="_blank" rel="noopener">agenda en línea</a>.</div></td></tr>';
      return;
    }
    // Cobros de cada cita (los que la mencionan) para mostrar si ya se pagó.
    const paidBy = new Map();
    state.payments.forEach((x) => { if (x.appointmentId) paidBy.set(x.appointmentId, (paidBy.get(x.appointmentId) || 0) + (x.total || 0)); });
    body.innerHTML = rows.map((a) => {
      const when = escapeHtml(a.time) + (oneDay ? '' : '<small>' + fmtDate(a.date) + '</small>');
      const id = escapeHtml(a.id);
      const paid = paidBy.get(a.id);
      const payCell = paid !== undefined
        ? '<span class="badge green" title="Cobro registrado">' + fmtCLP(paid) + '</span>'
        : (ctx.can('cobros') && isActive(a) && a.status !== 'No asistió' ? '<button class="btn btn-ghost btn-sm" type="button" data-pay="' + id + '" title="Registrar el cobro de esta cita">' + icon('cash') + ' Cobrar</button>' : '');
      return '<tr class="appt-row' + (isActive(a) ? '' : ' done') + '">' +
        '<td><span class="appt-time">' + when + '</span></td>' +
        '<td>' + personCell(a.name, (contactOf(a) || 'Sin contacto') + ' · ' + escapeHtml(a.code || '')) + '</td>' +
        '<td><span class="badge blue" title="' + escapeHtml(examLabel(a.exam)) + '">' + escapeHtml(a.exam) + '</span></td>' +
        '<td>' + (a.referrer ? escapeHtml(a.referrer) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + statusSelect(a) + '</td>' +
        '<td>' + payCell + '</td>' +
        '<td><div class="row-actions">' +
          (isActive(a) && ctx.can('examenes') ? '<button class="btn btn-outline btn-sm" type="button" data-upload="' + id + '" title="Cargar el examen de esta cita">' + icon('upload') + ' Cargar</button>' : '') +
          '<button class="icon-btn" type="button" data-edit="' + id + '" title="Editar cita" aria-label="Editar cita">' + icon('edit') + '</button>' +
          '<button class="icon-btn" type="button" data-delete="' + id + '" title="Borrar cita" aria-label="Borrar cita">' + icon('trash') + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  document.querySelectorAll('#agenda-tabs [data-filter]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  dayInput.addEventListener('change', () => setFilter(dayInput.value ? 'day' : 'today', dayInput.value));
  document.querySelectorAll('[data-day-step]').forEach((b) => b.addEventListener('click', () => {
    setFilter('day', addDays(dayInput.value || today(), Number(b.dataset.dayStep)));
  }));

  // --- Vistas: lista, semana, mes -----------------------------------------------------------
  const calendar = createCalendar($('agenda-calendar'), {
    appointments: () => state.appointments,
    onEdit: (id) => form.open(find(id)),
    onNew: (date, time) => form.open(null, { date, time }),
    onPickDay: (day) => { setView('list'); setFilter('day', day); }
  });

  function setView(v) {
    view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* almacenamiento no disponible */ }
    document.querySelectorAll('#agenda-views [data-agenda-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.agendaView === v)));
    $('agenda-list').hidden = v !== 'list';
    $('agenda-calendar').hidden = v === 'list';
    // El calendario abre en el día que se estaba mirando en la lista.
    if (v !== 'list') calendar.goTo(filter === 'day' ? dayInput.value : null);
    render();
  }
  document.querySelectorAll('#agenda-views [data-agenda-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.agendaView)));

  function render() {
    if (view === 'list') renderList();
    else calendar.render(view);
  }

  const find = (id) => state.appointments.find((a) => a.id === id);
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-upload], [data-edit], [data-delete], [data-pay]');
    if (!b) return;
    if (b.dataset.pay) { const a = find(b.dataset.pay); ctx.openPayment({ patientId: a.patientId, date: a.date, appointment: a }); }
    if (b.dataset.upload) ctx.startUploadFor(find(b.dataset.upload));
    if (b.dataset.edit) form.open(find(b.dataset.edit));
    if (b.dataset.delete) remove(find(b.dataset.delete));
  });

  // Cambio rápido de estado desde la tabla.
  body.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    const appt = find(sel.dataset.status);
    if (sel.value === 'Cancelada' && !confirm('¿Cancelar la cita de ' + appt.name + ' (' + fmtDate(appt.date) + ' ' + appt.time + ')? El horario quedará libre.')) {
      sel.value = appt.status;
      return;
    }
    sel.disabled = true;
    try {
      await backend.updateAppointment(appt, { status: sel.value });
      toast(sel.value === 'Cancelada' ? 'Cita cancelada. El horario quedó libre.' : 'Cita marcada como «' + sel.value + '».');
      await ctx.reload();
    } catch (ex) {
      toast('No se pudo actualizar la cita: ' + ex.message);
      sel.value = appt.status;
      sel.disabled = false;
    }
  });

  async function remove(appt) {
    if (!appt || !confirm('¿Borrar definitivamente la cita de ' + appt.name + ' (' + fmtDate(appt.date) + ' ' + appt.time + ')? La ficha del paciente se conserva.')) return false;
    try {
      await backend.deleteAppointment(appt);
      toast('Cita borrada.');
      await ctx.reload();
      return true;
    } catch (ex) { toast('No se pudo borrar la cita: ' + ex.message); return false; }
  }

  document.getElementById('copy-booking-link').addEventListener('click', async () => {
    const url = new URL('agendar.html', location.href).href;
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado: ' + url); } catch (ex) { toast(url); }
  });

  // --- Formulario: nueva cita / editar ----------------------------------------------------
  const form = createAppointmentForm(ctx, { onDelete: remove });
  document.querySelectorAll('[data-open="appointment"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); form.open(null); }));

  try { const saved = localStorage.getItem(VIEW_KEY); if (saved === 'week' || saved === 'month') view = saved; } catch (e) { /* sin almacenamiento */ }
  setFilter('today');
  setView(view);

  return { render };
}

function createAppointmentForm(ctx, { onDelete }) {
  const { state } = ctx;
  const m = modal('appointment-modal');
  const el = document.getElementById('appointment-form');
  const err = el.querySelector('.form-error');
  const $ = (id) => document.getElementById(id);
  const fields = { patient: $('ap-patient'), first: $('ap-first'), last: $('ap-last'), email: $('ap-email'), phone: $('ap-phone'), exam: $('ap-exam'), referrer: $('ap-referrer'), date: $('ap-date'), time: $('ap-time'), status: $('ap-status') };
  const deleteBtn = $('ap-delete');
  let editing = null;

  fields.status.innerHTML = APPOINTMENT_STATUSES.map((st) => '<option>' + st + '</option>').join('');

  // Horas del día elegido; las ocupadas por otras citas no se pueden elegir.
  function renderTimes(selected) {
    const date = fields.date.value;
    if (!date) { fields.time.innerHTML = '<option value="">Elija el día</option>'; return; }
    const { times, outside } = adminDayTimes(date);
    if (selected && !times.includes(selected)) { times.push(selected); times.sort(); }
    const taken = new Set(state.appointments.filter((a) => isActive(a) && (!editing || a.id !== editing.id)).map((a) => a.slotId));
    fields.time.innerHTML = '<option value="">Elija la hora</option>' + times.map((t) => {
      const busy = taken.has(slotId(date, t));
      return '<option value="' + t + '"' + (busy ? ' disabled' : '') + (t === selected ? ' selected' : '') + '>' + t + (busy ? ' · ocupado' : '') + '</option>';
    }).join('');
    fields.time.title = outside ? 'Día sin atención según el horario: se muestran todas las horas.' : '';
  }
  fields.date.addEventListener('change', () => renderTimes(fields.time.value));

  // Al elegir un paciente registrado se copian sus datos.
  fields.patient.addEventListener('change', () => {
    const p = ctx.patientById(fields.patient.value);
    if (!p) return;
    const [first, ...rest] = (p.name || '').split(' ');
    fields.first.value = p.firstName || first;
    fields.last.value = p.lastName || rest.join(' ');
    fields.email.value = p.email || '';
    fields.phone.value = p.phone || '';
  });

  // preset: { date, time } para una cita nueva desde el calendario.
  function open(appt, preset = {}) {
    editing = appt;
    el.reset();
    showError(err, '');
    document.getElementById('appointment-modal-title').textContent = appt ? 'Editar cita · ' + (appt.code || '') : 'Nueva cita';
    deleteBtn.hidden = !appt;
    fields.patient.innerHTML = '<option value="">Paciente nuevo</option>' +
      state.patients.map((p) => '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + (p.code ? ' · ' + escapeHtml(p.code) : '') + '</option>').join('');
    // En una cita existente el paciente no cambia (se editan los datos de la cita).
    fields.patient.disabled = !!appt;
    document.getElementById('doctor-names').innerHTML = state.doctors.map((d) => '<option value="' + escapeHtml(d.name) + '">').join('');
    // Servicios al abrir: pueden cambiar en «Servicios y horarios». Los inactivos
    // solo aparecen si la cita ya los tiene.
    fields.exam.innerHTML = agendaConfig.exams.filter((x) => x.active !== false || (appt && appt.exam === x.id))
      .map((x) => '<option value="' + escapeHtml(x.id) + '">' + escapeHtml(x.label) + '</option>').join('');
    const a = appt || { exam: (agendaConfig.exams.find((x) => x.active !== false) || agendaConfig.exams[0]).id, date: preset.date || today(), time: preset.time, status: 'Pendiente' };
    fields.patient.value = a.patientId || '';
    fields.first.value = a.firstName || '';
    fields.last.value = a.lastName || '';
    fields.email.value = a.email || '';
    fields.phone.value = a.phone || '';
    fields.exam.value = a.exam;
    fields.referrer.value = a.referrer || '';
    fields.date.value = a.date;
    fields.status.value = a.status;
    // Una cita nueva siempre empieza como Pendiente.
    fields.status.closest('.field').hidden = !appt;
    renderTimes(a.time);
    m.open();
  }

  deleteBtn.addEventListener('click', async () => { if (editing && await onDelete(editing)) m.close(); });

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector('button[type=submit]');
    const v = formValues(el);
    showError(err, '');
    if (!v.date || !v.time) { showError(err, 'Elija el día y la hora.'); return; }
    busy(btn, true, 'Guardando…');
    try {
      if (editing) {
        await backend.updateAppointment(editing, v);
        toast('Cita actualizada.');
      } else {
        await backend.createAppointment(v, { patientId: fields.patient.value || undefined });
        toast('Cita creada para ' + v.firstName + ' el ' + fmtDate(v.date) + ' a las ' + v.time + '.');
      }
      m.close();
      await ctx.reload();
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  return { open };
}
