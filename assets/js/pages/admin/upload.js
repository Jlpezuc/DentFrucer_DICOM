// Carga de estudios: paciente + médico que lo recibe + archivos.
// Si el paciente tiene una cita pendiente (o se llega desde "Cargar estudio"
// en la agenda), se rellenan examen y fecha, se sugiere el médico que indicó
// al agendar y, al subir, la cita queda como atendida.

import { examLabel } from '../../services/agenda.js';
import { backend } from '../../services/backend.js';
import { busy, escapeHtml, showError, toast } from '../../ui/dom.js';
import { fmtDate, fmtSize, today } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { doctorOptions, matchDoctor } from './common.js';

export function createUpload(ctx) {
  const { state } = ctx;
  const $ = (id) => document.getElementById(id);
  const form = $('upload-form');
  const err = form.querySelector('.form-error');
  const patientSel = $('u-patient');
  const doctorSel = $('u-doctor');
  const doctorHint = $('u-doctor-hint');
  const apptBox = $('upload-appt');
  const progress = $('upload-progress');
  const DOCTOR_HINT = doctorHint.textContent;
  let appt = null;
  let files = [];
  $('u-date').value = today();

  // --- Selectores ----------------------------------------------------------------------
  function render() {
    const curPatient = patientSel.value;
    const curDoctor = doctorSel.value;
    const option = (p, extra = '') => '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + (p.code ? ' · ' + escapeHtml(p.code) : '') + extra + '</option>';
    // Arriba, los pacientes con cita hoy: son los que se van a cargar.
    const seen = new Set();
    const todays = state.appointments
      .filter((a) => a.date === today() && a.status !== 'Cancelada' && ctx.patientById(a.patientId) && !seen.has(a.patientId) && seen.add(a.patientId))
      .map((a) => option(ctx.patientById(a.patientId), ' (' + a.time + ' · ' + a.exam + ')')).join('');
    patientSel.innerHTML = '<option value="">Seleccione un paciente…</option>' +
      (todays ? '<optgroup label="Citas de hoy">' + todays + '</optgroup><optgroup label="Todos los pacientes">' : '') +
      state.patients.map((p) => option(p)).join('') + (todays ? '</optgroup>' : '');
    patientSel.value = curPatient;
    doctorSel.innerHTML = doctorOptions(state.doctors, curDoctor, 'Sin médico (solo la clínica)');
  }

  // --- Cita y médico sugerido -----------------------------------------------------------
  function setAppointment(a) {
    appt = a || null;
    apptBox.hidden = !appt;
    if (!appt) return;
    apptBox.innerHTML = icon('calendar') + '<span>Cita del ' + fmtDate(appt.date) + ' a las ' + escapeHtml(appt.time) + ' · ' + escapeHtml(examLabel(appt.exam)) +
      '. Al subir el estudio se marcará como <strong>atendida</strong>.</span>';
    $('u-modality').value = appt.exam;
    $('u-date').value = appt.date <= today() ? appt.date : today();
  }

  // Médico propuesto: el que indicó el paciente en la cita (si está registrado)
  // o, si no, el de su último estudio.
  function suggestDoctor(patientId) {
    const byReferrer = appt && appt.referrer ? matchDoctor(state.doctors, appt.referrer) : undefined;
    const last = state.studies.filter((s) => s.patientId === patientId && s.doctorId).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (byReferrer) {
      doctorSel.value = byReferrer.id;
      doctorHint.textContent = 'Sugerido: el paciente indicó «' + appt.referrer + '» al agendar.';
    } else if (last) {
      doctorSel.value = last.doctorId;
      doctorHint.textContent = 'Sugerido: el médico de su último estudio.';
    } else {
      doctorSel.value = '';
      doctorHint.textContent = appt && appt.referrer ? 'Indicó «' + appt.referrer + '», que no está registrado como médico.' : DOCTOR_HINT;
    }
  }

  // Cita pendiente más reciente del paciente (hoy o antes).
  const pendingOf = (patientId) => state.appointments
    .filter((a) => a.patientId === patientId && a.status === 'Pendiente' && a.date <= today())
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];

  patientSel.addEventListener('change', () => {
    setAppointment(pendingOf(patientSel.value));
    suggestDoctor(patientSel.value);
  });
  doctorSel.addEventListener('change', () => { doctorHint.textContent = DOCTOR_HINT; });

  function startFor(a) {
    if (!a) return;
    if (!ctx.patientById(a.patientId)) { toast('No se encontró el paciente de esta cita.'); return; }
    patientSel.value = a.patientId;
    setAppointment(a);
    suggestDoctor(a.patientId);
    $('carga').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Archivos ---------------------------------------------------------------------------
  const dz = $('dropzone');
  const fileInput = $('file-input');
  const folderInput = $('folder-input');
  function setFiles(list) {
    files = Array.from(list || []).filter((f) => !f.name.startsWith('.'));
    $('file-summary').textContent = files.length ? files.length + ' archivo(s) · ' + fmtSize(files.reduce((n, f) => n + f.size, 0)) : '';
  }
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => setFiles(e.dataTransfer && e.dataTransfer.files));
  fileInput.addEventListener('change', () => setFiles(fileInput.files));
  folderInput.addEventListener('change', () => setFiles(folderInput.files));
  $('pick-folder').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); folderInput.click(); });

  // --- Subir ------------------------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const patient = ctx.patientById(patientSel.value);
    const doctorId = doctorSel.value;
    showError(err, '');
    if (!patient) { showError(err, 'Seleccione un paciente (o regístrelo primero).'); return; }
    if (!files.length) { showError(err, 'Agregue los archivos del estudio.'); return; }
    if (!doctorId && !confirm('El estudio no tiene médico: no aparecerá en ningún portal hasta que se lo asigne. ¿Subirlo igual?')) return;
    busy(btn, true, 'Subiendo…');
    progress.hidden = false;
    const bar = progress.querySelector('span');
    bar.style.width = '0%';
    try {
      const modality = $('u-modality').value;
      await backend.uploadStudy({
        patient, doctorId, modality,
        description: $('u-desc').value.trim() || modality,
        date: $('u-date').value || today(),
        files,
        onProgress: (p) => { bar.style.width = Math.round(p * 100) + '%'; }
      });
      if (appt && appt.patientId === patient.id) {
        try { await backend.updateAppointment(appt, { status: 'Atendida' }); } catch (ex) { toast('El estudio se cargó, pero no se pudo marcar la cita como atendida.'); }
      }
      toast('Estudio cargado' + (doctorId ? ' y visible para ' + ctx.doctorName(doctorId) : '') + '.');
      form.reset();
      $('u-date').value = today();
      doctorHint.textContent = DOCTOR_HINT;
      setAppointment(null);
      setFiles([]);
      await ctx.reload();
    } catch (ex) { showError(err, 'No se pudo cargar: ' + ex.message); }
    progress.hidden = true;
    busy(btn, false);
  });

  return { render, startFor };
}
