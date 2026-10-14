// Carga de exámenes: un paciente + los médicos que los reciben (uno o varios) +
// la fecha, y uno o varios exámenes (cada uno con su servicio, un detalle
// opcional, sus imágenes y su informe PDF). Los exámenes del mismo paciente, médicos y fecha
// quedan en la misma visita, aunque se suban en momentos distintos.
//
// Si el paciente tiene una cita pendiente (o se llega desde "Cargar" en la
// agenda), se rellenan el servicio de la cita y la fecha, se sugiere el médico que indicó
// al agendar y, al subir, la cita queda como atendida.

import { examLabel } from '../../services/agenda.js';
import { backend } from '../../services/backend.js';
import { groupKey } from '../../services/groups.js';
import { studyServiceName } from '../../services/settings.js';
import { busy, escapeHtml, showError, toast } from '../../ui/dom.js';
import { fmtDate, fmtSize, today } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { bindDoctorPickers, doctorNames, doctorPickerHtml, matchDoctor, pickerValue, serviceOptions } from './common.js';

export function createUpload(ctx) {
  const { state } = ctx;
  const $ = (id) => document.getElementById(id);
  const form = $('upload-form');
  const err = form.querySelector('.form-error');
  const patientSel = $('u-patient');
  const doctorBox = $('u-doctors');
  const dateInput = $('u-date');
  const doctorHint = $('u-doctor-hint');
  const groupHint = $('u-group-hint');
  const apptBox = $('upload-appt');
  const examList = $('exam-list');
  const progress = $('upload-progress');
  const DOCTOR_HINT = doctorHint.textContent;
  let appt = null;
  dateInput.value = today();

  // Médicos elegidos (selector de varios médicos, common.js).
  const doctorIds = () => pickerValue(doctorBox.querySelector('[data-doctor-picker]'));
  const setDoctors = (ids) => { doctorBox.innerHTML = doctorPickerHtml(state.doctors, ids, { emptyLabel: 'Sin médico (solo la clínica)' }); updateGroupHint(); };
  bindDoctorPickers(doctorBox, () => state.doctors, () => { doctorHint.textContent = DOCTOR_HINT; updateGroupHint(); });

  // --- Bloques de examen -------------------------------------------------------------
  // Cada bloque tiene su servicio, un detalle opcional, archivos (block.files:
  // DICOM, ZIP, fotos…) y su informe PDF (block.report), que se guarda en el mismo examen.
  function addExamBlock(serviceId = '') {
    const block = document.createElement('div');
    block.className = 'exam-block';
    block.files = [];
    block.report = [];
    block.innerHTML = `
      <div class="exam-block-head">
        <strong data-title></strong>
        <button type="button" class="icon-btn" data-remove title="Quitar este examen" aria-label="Quitar este examen">${icon('x')}</button>
      </div>
      <div class="form-row">
        <div class="field"><label>Servicio <select class="input select" data-service>${serviceOptions(serviceId)}</select></label></div>
        <div class="field"><label>Detalle <span class="opt">(opcional)</span> <input class="input" data-desc maxlength="120" placeholder="Ej.: maxilar completo, pieza 36"></label></div>
      </div>
      <div class="dropzone compact" data-dropzone>
        ${icon('cloud')}
        <p style="margin:0"><strong>Arrastre aquí las imágenes de este examen</strong></p>
        <p style="margin:4px 0 12px;font-size:14px">DICOM (.dcm), .zip, fotos u otras imágenes</p>
        <span class="links">
          <button type="button" class="btn btn-outline btn-sm" data-pick-files>Seleccionar archivos</button>
          <button type="button" class="btn btn-ghost btn-sm" data-pick-folder>Seleccionar carpeta</button>
        </span>
        <input type="file" multiple class="sr-only" tabindex="-1" data-files>
        <input type="file" webkitdirectory multiple class="sr-only" tabindex="-1" data-folder>
      </div>
      <div class="file-summary" data-summary aria-live="polite"></div>
      <div class="report-field">
        <span class="file-icon pdf">${icon('file')}</span>
        <span><strong>Informe del examen</strong> <span class="opt">(PDF, opcional; también se puede subir después)</span><small data-report-name></small></span>
        <button type="button" class="btn btn-outline btn-sm" data-pick-report>Elegir PDF</button>
        <input type="file" accept="application/pdf,.pdf" multiple class="sr-only" tabindex="-1" data-report>
      </div>`;
    const $b = (sel) => block.querySelector(sel);
    const dz = $b('[data-dropzone]');
    const setFiles = (list) => {
      const all = Array.from(list || []).filter((f) => !f.name.startsWith('.'));
      // Un PDF soltado junto con las imágenes se toma como informe.
      block.report = [...block.report, ...all.filter((f) => /\.pdf$/i.test(f.name))];
      block.files = all.filter((f) => !/\.pdf$/i.test(f.name));
      $b('[data-summary]').textContent = block.files.length ? block.files.length + ' archivo(s) · ' + fmtSize(block.files.reduce((n, f) => n + f.size, 0)) : '';
      showReport();
    };
    const showReport = () => { $b('[data-report-name]').textContent = block.report.length ? block.report.map((f) => f.name).join(', ') : ''; };
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => setFiles(e.dataTransfer && e.dataTransfer.files));
    // Clic en la zona (fuera de los botones) = elegir archivos.
    dz.addEventListener('click', (e) => { if (!e.target.closest('button, input')) $b('[data-files]').click(); });
    $b('[data-pick-files]').addEventListener('click', () => $b('[data-files]').click());
    $b('[data-pick-folder]').addEventListener('click', () => $b('[data-folder]').click());
    $b('[data-files]').addEventListener('change', (e) => setFiles(e.target.files));
    $b('[data-folder]').addEventListener('change', (e) => setFiles(e.target.files));
    $b('[data-pick-report]').addEventListener('click', () => $b('[data-report]').click());
    $b('[data-report]').addEventListener('change', (e) => { block.report = Array.from(e.target.files || []); showReport(); });
    $b('[data-remove]').addEventListener('click', () => { block.remove(); renumber(); });
    examList.appendChild(block);
    renumber();
    return block;
  }
  function renumber() {
    const blocks = [...examList.children];
    blocks.forEach((b, i) => {
      b.querySelector('[data-title]').textContent = 'Examen ' + (i + 1);
      b.querySelector('[data-remove]').hidden = blocks.length === 1;
    });
  }
  function resetBlocks() {
    examList.innerHTML = '';
    addExamBlock();
  }
  $('add-exam').addEventListener('click', () => addExamBlock());
  resetBlocks();

  // --- Selectores ----------------------------------------------------------------------
  function render() {
    const curPatient = patientSel.value;
    const curDoctors = doctorBox.querySelector('[data-doctor-picker]') ? doctorIds() : [];
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
    setDoctors(curDoctors);
    // Los servicios pueden haber cambiado en «Servicios y horarios».
    examList.querySelectorAll('[data-service]').forEach((sel) => { const v = sel.value; sel.innerHTML = serviceOptions(v); sel.value = v; });
  }

  // ¿Ya hay exámenes de este paciente, médicos y fecha? Entonces se suman a esa visita.
  function updateGroupHint() {
    if (!patientSel.value || !dateInput.value || !doctorBox.querySelector('[data-doctor-picker]')) { groupHint.textContent = 'Los exámenes del mismo paciente, médicos y día forman una visita.'; return; }
    const key = groupKey({ patientId: patientSel.value, doctorIds: doctorIds(), date: dateInput.value });
    const existing = state.studies.filter((s) => groupKey(s) === key);
    groupHint.innerHTML = existing.length
      ? icon('folder') + ' Se agregará a la visita del ' + fmtDate(dateInput.value) + ', que ya tiene ' + existing.length + ' examen(es): ' + escapeHtml(existing.map(studyServiceName).join(', ')) + '.'
      : 'Se creará una visita nueva para el ' + fmtDate(dateInput.value) + '.';
  }
  [patientSel, dateInput].forEach((el) => el.addEventListener('change', updateGroupHint));

  // --- Cita y médico sugerido -----------------------------------------------------------
  function setAppointment(a) {
    appt = a || null;
    apptBox.hidden = !appt;
    if (!appt) return;
    apptBox.innerHTML = icon('calendar') + '<span>Cita del ' + fmtDate(appt.date) + ' a las ' + escapeHtml(appt.time) + ' · ' + escapeHtml(examLabel(appt.exam)) +
      '. Al subir los exámenes se marcará como <strong>atendida</strong>.</span>';
    // El primer examen es el servicio de la cita (aunque ya no se ofrezca en línea).
    const first = examList.querySelector('[data-service]');
    if (first) { first.innerHTML = serviceOptions(appt.exam); first.value = appt.exam; }
    dateInput.value = appt.date <= today() ? appt.date : today();
  }

  // Médico propuesto: el que indicó el paciente en la cita (si está registrado)
  // o, si no, el de su último examen.
  function suggestDoctor(patientId) {
    const byReferrer = appt && appt.referrer ? matchDoctor(state.doctors, appt.referrer) : undefined;
    const last = state.studies.filter((s) => s.patientId === patientId && s.doctorIds.length).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (byReferrer) {
      setDoctors([byReferrer.id]);
      doctorHint.textContent = 'Sugerido: el paciente indicó «' + appt.referrer + '» al agendar.';
    } else if (last) {
      setDoctors(last.doctorIds);
      doctorHint.textContent = 'Sugerido: ' + (last.doctorIds.length > 1 ? 'los médicos' : 'el médico') + ' de su último examen.';
    } else {
      setDoctors([]);
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

  function startFor(a) {
    if (!a) return;
    if (!ctx.patientById(a.patientId)) { toast('No se encontró el paciente de esta cita.'); return; }
    patientSel.value = a.patientId;
    setAppointment(a);
    suggestDoctor(a.patientId);
    ctx.go('carga');
  }

  // --- Subir ------------------------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const patient = ctx.patientById(patientSel.value);
    const ids = doctorIds();
    const date = dateInput.value || today();
    const exams = [...examList.children].filter((b) => b.files.length || b.report.length).map((b) => ({
      serviceId: b.querySelector('[data-service]').value,
      service: b.querySelector('[data-service]').selectedOptions[0]?.textContent || '',
      description: b.querySelector('[data-desc]').value.trim(),
      files: [...b.files, ...b.report]
    }));
    showError(err, '');
    if (!patient) { showError(err, 'Seleccione un paciente (o regístrelo primero).'); return; }
    if (!exams.length) { showError(err, 'Agregue los archivos de al menos un examen.'); return; }
    if (!ids.length && !confirm('Los exámenes no tienen médico: no aparecerán en ningún portal hasta que se lo asigne. ¿Subirlos igual?')) return;
    busy(btn, true, 'Subiendo…');
    progress.hidden = false;
    const bar = progress.querySelector('span');
    bar.style.width = '0%';
    const total = exams.reduce((n, x) => n + x.files.reduce((m, f) => m + f.size, 0), 0) || 1;
    let sent = 0;
    try {
      for (const x of exams) {
        const size = x.files.reduce((m, f) => m + f.size, 0);
        await backend.uploadStudy({
          patient, doctorIds: ids, date, serviceId: x.serviceId, service: x.service,
          description: x.description,
          files: x.files,
          onProgress: (p) => { bar.style.width = Math.round(((sent + p * size) / total) * 100) + '%'; }
        });
        sent += size;
      }
      if (appt && appt.patientId === patient.id) {
        try { await backend.updateAppointment(appt, { status: 'Atendida' }); } catch (ex) { toast('Los exámenes se cargaron, pero no se pudo marcar la cita como atendida.'); }
      }
      toast(exams.length + ' examen(es) cargado(s) en la visita del ' + fmtDate(date) + (ids.length ? ', visible(s) para ' + doctorNames(state.doctors, ids) : '') + '.');
      form.reset();
      dateInput.value = today();
      doctorHint.textContent = DOCTOR_HINT;
      setDoctors([]);
      setAppointment(null);
      resetBlocks();
      await ctx.reload();
    } catch (ex) { showError(err, 'No se pudo cargar: ' + ex.message); }
    progress.hidden = true;
    busy(btn, false);
  });

  return { render, startFor };
}
