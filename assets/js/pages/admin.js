// Panel de administración: estudios, carga de archivos, pacientes y médicos.

import { backend } from '../services/backend.js';
import { busy, escapeHtml, modal, setText, showError, toast } from '../ui/dom.js';
import { fmtDate, fmtSize, initials, today } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { requireRole } from './session.js';
import { initFilesModal, openStudy } from './study-actions.js';

export async function init() {
  if (!(await requireRole('admin'))) return;
  const openFiles = initFilesModal();
  const doctorModal = modal('doctor-modal');
  const patientModal = modal('patient-modal');

  const state = { studies: [], patients: [], doctors: [], filter: 'all' };
  const doctorName = (id) => (state.doctors.find((d) => d.id === id) || {}).name;

  async function load() {
    try {
      const [studies, patients, doctors] = await Promise.all([backend.listStudies(), backend.listPatients(), backend.listDoctors()]);
      Object.assign(state, { studies, patients, doctors });
    } catch (e) {
      toast('No se pudieron cargar los datos: ' + e.message);
    }
    renderAll();
  }

  function renderAll() {
    setText('stat-studies', state.studies.length);
    setText('stat-patients', state.patients.length);
    setText('stat-doctors', state.doctors.length);
    setText('stat-unassigned', state.patients.filter((p) => !p.doctorId).length);
    renderStudies();
    renderPatients();
    renderDoctors();
    renderSelects();
  }

  // Estudios
  const tbody = document.getElementById('studies-body');
  const search = document.getElementById('admin-search');
  function renderStudies() {
    const q = search.value.trim().toLowerCase();
    const rows = state.studies.filter((s) => {
      if (state.filter === 'new' && s.status !== 'Nuevo') return false;
      if (state.filter === 'cbct' && s.modality !== 'CBCT') return false;
      return !q || [s.patientName, s.patientCode, s.code, doctorName(s.doctorId), s.modality].join(' ').toLowerCase().includes(q);
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty">' + (state.studies.length ? 'No se encontraron estudios.' : 'Todavía no hay estudios. Cargue el primero abajo.') + '</div></td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((s) => {
      const doc = s.doctorId && doctorName(s.doctorId) ? escapeHtml(doctorName(s.doctorId)) : '<span class="badge gray">Sin asignar</span>';
      return '<tr>' +
        '<td><div class="cell-patient"><span class="avatar">' + initials(s.patientName) + '</span><div><strong>' + escapeHtml(s.patientName) + '</strong><small>' + escapeHtml(s.patientCode) + (s.patientAge ? ' · ' + s.patientAge + ' años' : '') + '</small></div></div></td>' +
        '<td><span class="mono">' + escapeHtml(s.code) + '</span></td>' +
        '<td><span class="badge blue">' + escapeHtml(s.modality) + '</span></td>' +
        '<td>' + fmtDate(s.date) + '</td>' +
        '<td>' + doc + '</td>' +
        '<td><span class="mono">' + fmtSize(s.totalSize) + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-btn" title="Ver" data-view="' + escapeHtml(s.id) + '">' + icon('eye') + '</button>' +
          '<button class="icon-btn" title="Archivos" data-files="' + escapeHtml(s.id) + '">' + icon('download') + '</button>' +
          '<button class="icon-btn" title="Eliminar" data-delete="' + escapeHtml(s.id) + '">' + icon('trash') + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }
  document.querySelectorAll('#study-tabs button').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    document.querySelectorAll('#study-tabs button').forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
    renderStudies();
  }));
  search.addEventListener('input', renderStudies);
  tbody.addEventListener('click', async (e) => {
    const find = (attr) => { const b = e.target.closest('[' + attr + ']'); return b && state.studies.find((s) => s.id === b.getAttribute(attr)); };
    const v = find('data-view'); if (v) openStudy(v);
    const f = find('data-files'); if (f) openFiles(f);
    const d = find('data-delete');
    if (d && confirm('¿Eliminar el estudio ' + d.code + ' de ' + d.patientName + '? Se borrarán también sus archivos.')) {
      try { await backend.deleteStudy(d); toast('Estudio eliminado.'); await load(); } catch (ex) { toast('No se pudo eliminar: ' + ex.message); }
    }
  });

  // Pacientes
  const pBody = document.getElementById('patients-body');
  function doctorOptions(selected, emptyLabel) {
    return '<option value="">' + (emptyLabel || 'Sin asignar') + '</option>' +
      state.doctors.map((d) => '<option value="' + escapeHtml(d.id) + '"' + (d.id === selected ? ' selected' : '') + '>' + escapeHtml(d.name) + '</option>').join('');
  }
  function renderPatients() {
    if (!state.patients.length) { pBody.innerHTML = '<tr><td colspan="3"><div class="empty">Aún no hay pacientes.</div></td></tr>'; return; }
    pBody.innerHTML = state.patients.map((p) => {
      const n = state.studies.filter((s) => s.patientId === p.id).length;
      return '<tr><td><div class="cell-patient"><span class="avatar">' + initials(p.name) + '</span><div><strong>' + escapeHtml(p.name) + '</strong><small>' + escapeHtml(p.code) + (p.age ? ' · ' + p.age + ' años' : '') + '</small></div></div></td>' +
        '<td>' + n + '</td>' +
        '<td><label class="sr-only" for="pd-' + escapeHtml(p.id) + '">Médico de ' + escapeHtml(p.name) + '</label><select class="input select input-sm" id="pd-' + escapeHtml(p.id) + '" data-patient="' + escapeHtml(p.id) + '">' + doctorOptions(p.doctorId) + '</select></td></tr>';
    }).join('');
  }
  pBody.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-patient]');
    if (!sel) return;
    sel.disabled = true;
    try {
      await backend.setPatientDoctor(sel.dataset.patient, sel.value);
      toast('Médico actualizado. Sus estudios ahora son visibles para ' + (doctorName(sel.value) || 'nadie') + '.');
      await load();
    } catch (ex) { toast('No se pudo actualizar: ' + ex.message); sel.disabled = false; }
  });

  // Médicos
  const dBody = document.getElementById('doctors-body');
  function renderDoctors() {
    if (!state.doctors.length) { dBody.innerHTML = '<tr><td colspan="3"><div class="empty">Aún no hay médicos registrados.</div></td></tr>'; return; }
    dBody.innerHTML = state.doctors.map((d) => {
      const n = state.patients.filter((p) => p.doctorId === d.id).length;
      return '<tr><td><div class="cell-patient"><span class="avatar" style="background:var(--green-600)">' + initials(d.name) + '</span><div><strong>' + escapeHtml(d.name) + '</strong><small>' + escapeHtml(d.email) + '</small></div></div></td>' +
        '<td>' + escapeHtml(d.specialty || '—') + '</td><td>' + n + '</td></tr>';
    }).join('');
  }

  function renderSelects() {
    const up = document.getElementById('u-patient');
    const cur = up.value;
    up.innerHTML = '<option value="">Seleccione un paciente…</option>' + state.patients.map((p) =>
      '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + ' · ' + escapeHtml(p.code) + (p.doctorId ? ' — ' + escapeHtml(doctorName(p.doctorId) || '') : ' — sin médico') + '</option>').join('');
    up.value = cur;
    document.getElementById('np-doctor').innerHTML = doctorOptions('', 'Asignar más tarde');
  }

  // Nuevo médico
  document.querySelectorAll('[data-open="doctor"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); doctorModal.open(); }));
  const dForm = document.getElementById('doctor-form');
  dForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = dForm.querySelector('.form-error');
    const btn = dForm.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(dForm));
    showError(err, '');
    if (!data.name.trim() || !data.email.trim() || data.password.length < 6) { showError(err, 'Complete nombre, correo y una contraseña de al menos 6 caracteres.'); return; }
    busy(btn, true, 'Creando…');
    try {
      await backend.createDoctor(data);
      dForm.reset();
      doctorModal.close();
      toast('Cuenta creada para ' + data.name + '. Comparta sus credenciales de forma segura.');
      await load();
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  // Nuevo paciente
  document.querySelectorAll('[data-open="patient"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); patientModal.open(); }));
  const pForm = document.getElementById('patient-form');
  pForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = pForm.querySelector('.form-error');
    const btn = pForm.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(pForm));
    showError(err, '');
    if (!data.name.trim()) { showError(err, 'Escriba el nombre del paciente.'); return; }
    busy(btn, true, 'Guardando…');
    try {
      const id = await backend.createPatient(data);
      pForm.reset();
      patientModal.close();
      toast('Paciente registrado.');
      await load();
      document.getElementById('u-patient').value = id;
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  // Carga de estudios
  const uForm = document.getElementById('upload-form');
  const dz = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const folderInput = document.getElementById('folder-input');
  const fileSummary = document.getElementById('file-summary');
  const progress = document.getElementById('upload-progress');
  let files = [];
  document.getElementById('u-date').value = today();

  function setFiles(list) {
    files = Array.from(list || []).filter((f) => !f.name.startsWith('.'));
    fileSummary.textContent = files.length ? files.length + ' archivo(s) · ' + fmtSize(files.reduce((n, f) => n + f.size, 0)) : '';
  }
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => setFiles(e.dataTransfer && e.dataTransfer.files));
  fileInput.addEventListener('change', () => setFiles(fileInput.files));
  folderInput.addEventListener('change', () => setFiles(folderInput.files));
  document.getElementById('pick-folder').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); folderInput.click(); });

  uForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = uForm.querySelector('.form-error');
    const btn = uForm.querySelector('button[type=submit]');
    const patient = state.patients.find((p) => p.id === document.getElementById('u-patient').value);
    showError(err, '');
    if (!patient) { showError(err, 'Seleccione un paciente (o regístrelo primero).'); return; }
    if (!files.length) { showError(err, 'Agregue los archivos del estudio.'); return; }
    busy(btn, true, 'Subiendo…');
    progress.hidden = false;
    const bar = progress.querySelector('span');
    bar.style.width = '0%';
    try {
      await backend.uploadStudy({
        patient,
        modality: document.getElementById('u-modality').value,
        description: document.getElementById('u-desc').value.trim() || document.getElementById('u-modality').value,
        date: document.getElementById('u-date').value || today(),
        files,
        onProgress: (p) => { bar.style.width = Math.round(p * 100) + '%'; }
      });
      toast('Estudio cargado' + (patient.doctorId ? ' y visible para ' + doctorName(patient.doctorId) : '') + '.');
      uForm.reset();
      document.getElementById('u-date').value = today();
      setFiles([]);
      await load();
    } catch (ex) { showError(err, 'No se pudo cargar: ' + ex.message); }
    progress.hidden = true;
    busy(btn, false);
  });

  await load();
}
