// Pacientes y médicos. Los pacientes solo guardan identidad y contacto (no
// tienen médico); los que agendan en línea aparecen solos con la etiqueta
// "Agenda". Al editar un paciente se actualizan también sus exámenes.
// Clic en la fila (o "Ver exámenes") abre el explorador: todas las visitas del
// paciente con sus exámenes, o los pacientes del médico.

import { backend } from '../../services/backend.js';
import { groupStudies } from '../../services/groups.js';
import { busy, escapeHtml, modal, showError, toast } from '../../ui/dom.js';
import { initials } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { contactOf, formValues, personCell } from './common.js';

export function createPeople(ctx) {
  const patients = createPatients(ctx);
  const doctors = createDoctors(ctx);
  return { render() { patients.render(); doctors.render(); } };
}

// --- Pacientes --------------------------------------------------------------------------
function createPatients(ctx) {
  const { state } = ctx;
  const body = document.getElementById('patients-body');
  const search = document.getElementById('patient-search');

  function render() {
    const q = search.value.trim().toLowerCase();
    const rows = state.patients.filter((p) => !q || [p.name, p.code, p.email, p.phone].join(' ').toLowerCase().includes(q));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4"><div class="empty">' + (state.patients.length ? 'No se encontraron pacientes.' : 'Aún no hay pacientes.') + '</div></td></tr>';
      return;
    }
    const visits = new Map();
    groupStudies(state.studies).forEach((g) => visits.set(g.patientId, (visits.get(g.patientId) || 0) + 1));
    const exams = new Map();
    state.studies.forEach((st) => exams.set(st.patientId, (exams.get(st.patientId) || 0) + 1));
    body.innerHTML = rows.map((p) => {
      const n = visits.get(p.id) || 0;
      const e = exams.get(p.id) || 0;
      const sub = [p.code, p.age ? p.age + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ') || '<span class="muted">Sin expediente</span>';
      const tag = p.source === 'agenda' ? ' <span class="badge green" title="Se registró al agendar una cita">Agenda</span>' : '';
      return '<tr class="patient-row" data-browse="' + escapeHtml(p.id) + '" title="Ver sus visitas y exámenes">' +
        '<td>' + personCell(p.name, sub, tag) + '</td>' +
        '<td class="cell-contact">' + (contactOf(p) || '<span class="muted">—</span>') + '</td>' +
        '<td>' + (n ? n + ' <small class="muted">(' + e + ' exámenes)</small>' : '<span class="muted">Sin exámenes</span>') + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="btn btn-outline btn-sm" type="button" data-browse="' + escapeHtml(p.id) + '">' + icon('folder') + ' Ver exámenes</button>' +
          (ctx.can('pacientes') ? '<button class="icon-btn" type="button" data-edit="' + escapeHtml(p.id) + '" title="Editar paciente" aria-label="Editar paciente">' + icon('edit') + '</button>' : '') + '</div></td>' +
      '</tr>';
    }).join('');
  }
  search.addEventListener('input', render);

  // Formulario: nuevo paciente / editar
  const m = modal('patient-modal');
  const form = document.getElementById('patient-form');
  const err = form.querySelector('.form-error');
  let editing = null;

  function open(p) {
    editing = p || null;
    form.reset();
    showError(err, '');
    document.getElementById('patient-modal-title').textContent = p ? 'Editar paciente' : 'Nuevo paciente';
    if (p) {
      const [first, ...rest] = (p.name || '').split(' ');
      const values = { firstName: p.firstName || first, lastName: p.lastName || rest.join(' '), code: p.code, age: p.age ?? '', email: p.email, phone: p.phone };
      Object.entries(values).forEach(([k, v]) => { form.elements.namedItem(k).value = v || v === 0 ? v : ''; });
    }
    m.open();
  }
  document.querySelectorAll('[data-open="patient"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(null); }));
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit], [data-browse]');
    if (!b) return;
    if (b.dataset.edit) open(ctx.patientById(b.dataset.edit));
    else ctx.explorer.openPatient(b.dataset.browse);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    showError(err, '');
    busy(btn, true, 'Guardando…');
    try {
      const data = formValues(form);
      if (editing) await backend.updatePatient(editing.id, data);
      const id = editing ? editing.id : await backend.createPatient(data);
      toast(editing ? 'Paciente actualizado.' : 'Paciente registrado.');
      m.close();
      await ctx.reload();
      // Recién registrado: queda elegido para cargar su examen.
      if (!editing) document.getElementById('u-patient').value = id;
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  return { render };
}

// --- Médicos ----------------------------------------------------------------------------
function createDoctors(ctx) {
  const { state } = ctx;
  const body = document.getElementById('doctors-body');

  function render() {
    if (!state.doctors.length) { body.innerHTML = '<tr><td colspan="4"><div class="empty">Aún no hay médicos registrados.</div></td></tr>'; return; }
    body.innerHTML = state.doctors.map((d) => {
      const n = state.studies.filter((s) => s.doctorIds.includes(d.id)).length;
      return '<tr class="patient-row" data-browse="' + escapeHtml(d.id) + '" title="Ver sus pacientes y exámenes"><td><div class="cell-patient"><span class="avatar" style="background:var(--green-600)">' + initials(d.name) + '</span><div><strong>' + escapeHtml(d.name) + '</strong><small>' + escapeHtml(d.email) + '</small></div></div></td>' +
        '<td>' + escapeHtml(d.specialty || '—') + '</td><td>' + n + '</td>' +
        '<td><div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-browse="' + escapeHtml(d.id) + '">' + icon('folder') + ' Ver exámenes</button></div></td></tr>';
    }).join('');
  }
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-browse]');
    if (b) ctx.explorer.openDoctor(b.dataset.browse);
  });

  const m = modal('doctor-modal');
  const form = document.getElementById('doctor-form');
  document.querySelectorAll('[data-open="doctor"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); m.open(); }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    const btn = form.querySelector('button[type=submit]');
    const data = formValues(form);
    showError(err, '');
    if (!data.name.trim() || !data.email.trim() || data.password.length < 6) { showError(err, 'Complete nombre, correo y una contraseña de al menos 6 caracteres.'); return; }
    busy(btn, true, 'Creando…');
    try {
      await backend.createDoctor(data);
      form.reset();
      m.close();
      toast('Cuenta creada para ' + data.name + '. Comparta sus credenciales de forma segura.');
      await ctx.reload();
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  return { render };
}
