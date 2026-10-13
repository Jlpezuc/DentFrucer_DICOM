// Explorador de exámenes: una ventana con tres niveles y migas de pan.
//
//   Médico    sus pacientes y, de cada uno, los grupos (fechas) de ese médico
//   Paciente  todas sus visitas (grupos), con búsqueda por fecha, médico o examen
//   Grupo     los exámenes de un paciente, para un médico, en una fecha:
//             ver, editar datos, agregar exámenes, subir más imágenes o el
//             informe PDF de cada examen, renombrar, descargar y eliminar archivos.
//
// Se abre desde la tabla de exámenes (grupo), de pacientes o de médicos.

import { backend, isDemo } from '../../services/backend.js';
import { fileKind, groupKey, groupSearchText, groupStudies, modifiedAt, searchTerm, STUDY_MODALITIES } from '../../services/groups.js';
import { escapeHtml, modal, toast } from '../../ui/dom.js';
import { fmtDate, fmtSize } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { openStudy } from '../study-actions.js';
import { contactOf, doctorOptions } from './common.js';

export function createExplorer(ctx) {
  const { state } = ctx;
  const m = modal('explorer-modal');
  const body = document.getElementById('explorer-body');
  const crumbs = document.getElementById('explorer-crumbs');
  const fileInput = document.getElementById('explorer-file-input');
  let stack = [];            // [{ type: 'doctor' | 'patient' | 'group', id }]
  let query = '';            // búsqueda en las vistas de médico y paciente
  let ui = {};               // { editing: studyId, adding: true } dentro de un grupo
  let uploadTarget = null;   // examen al que se suben archivos

  const groups = () => groupStudies(state.studies);
  const groupByKey = (key) => groups().find((g) => g.key === key);
  const doctorLabel = (id) => ctx.doctorName(id) || 'Sin médico';

  // --- Navegación ---------------------------------------------------------------------
  function open(type, id) { stack = [{ type, id }]; query = ''; ui = {}; render(); m.open(); }
  function push(type, id) { stack.push({ type, id }); query = ''; ui = {}; render(); body.scrollTop = 0; }
  function goTo(i) { stack = stack.slice(0, i + 1); query = ''; ui = {}; render(); }

  function crumbLabel({ type, id }) {
    if (type === 'doctor') return doctorLabel(id);
    if (type === 'patient') return (ctx.patientById(id) || {}).name || 'Paciente';
    const g = groupByKey(id);
    return g ? fmtDate(g.date) : 'Grupo';
  }

  function render() {
    crumbs.innerHTML = stack.map((c, i) => (i < stack.length - 1
      ? `<button type="button" data-crumb="${i}">${escapeHtml(crumbLabel(c))}</button><span aria-hidden="true">›</span>`
      : `<h3 id="explorer-title">${escapeHtml(crumbLabel(c))}</h3>`)).join('');
    const cur = stack[stack.length - 1];
    if (!cur) return;
    if (cur.type === 'doctor') renderDoctor(cur.id);
    else if (cur.type === 'patient') renderPatient(cur.id);
    else renderGroup(cur.id);
  }

  // Lista de grupos (filas que se pueden abrir).
  function groupRows(list, { showPatient = false, showDoctor = true } = {}) {
    if (!list.length) return '<div class="empty">' + (query ? 'Nada coincide con la búsqueda.' : 'No hay exámenes.') + '</div>';
    return '<ul class="group-list">' + list.map((g) => `
      <li><button type="button" data-group="${escapeHtml(g.key)}">
        <span class="group-date">${fmtDate(g.date)}</span>
        <span class="group-main">
          ${showPatient ? `<strong>${escapeHtml(g.patientName)}</strong>` : ''}
          ${showDoctor ? `<span class="${g.doctorId ? '' : 'warn-text'}">${escapeHtml(doctorLabel(g.doctorId))}</span>` : ''}
        </span>
        <span class="group-badges">${g.modalities.map((x) => `<span class="badge ${x === 'Informe' ? 'green' : 'blue'}">${escapeHtml(x)}</span>`).join('')}${g.hasNew ? '<span class="badge amber">Nuevo</span>' : ''}</span>
        <span class="group-files">${g.fileCount} archivo(s) · ${fmtSize(g.totalSize)}</span>
        ${icon('chevronRight')}
      </button></li>`).join('') + '</ul>';
  }

  const searchBox = (placeholder) => `<label class="search explorer-search"><span class="sr-only">Buscar</span>${icon('search')}<input class="input" type="search" data-search placeholder="${placeholder}" value="${escapeHtml(query)}"></label>`;
  const matches = (g) => !query || groupSearchText(g, doctorLabel(g.doctorId)).includes(searchTerm(query));

  // --- Vista: médico -------------------------------------------------------------------
  function renderDoctor(doctorId) {
    const d = state.doctors.find((x) => x.id === doctorId) || {};
    const mine = groups().filter((g) => (g.doctorId || '') === (doctorId || ''));
    const byPatient = new Map();
    mine.filter(matches).forEach((g) => { if (!byPatient.has(g.patientId)) byPatient.set(g.patientId, []); byPatient.get(g.patientId).push(g); });
    const patients = [...byPatient.entries()].sort((a, b) => (a[1][0].patientName || '').localeCompare(b[1][0].patientName || '', 'es'));
    body.innerHTML = `
      <div class="explorer-head">
        <div><strong>${escapeHtml(d.name || 'Sin médico')}</strong><small>${escapeHtml([d.specialty, d.email].filter(Boolean).join(' · '))}</small></div>
        <span class="muted">${new Set(mine.map((g) => g.patientId)).size} paciente(s) · ${mine.reduce((n, g) => n + g.studies.length, 0)} examen(es)</span>
      </div>
      ${searchBox('Buscar paciente, fecha o examen')}
      ${patients.length ? patients.map(([pid, list]) => `
        <div class="explorer-section">
          <h4><button type="button" class="link-btn" data-patient="${escapeHtml(pid)}">${escapeHtml(list[0].patientName)}</button> <small>${list.length} visita(s)</small></h4>
          ${groupRows(list, { showDoctor: false })}
        </div>`).join('') : '<div class="empty">' + (query ? 'Nada coincide con la búsqueda.' : 'Este médico aún no tiene exámenes.') + '</div>'}`;
  }

  // --- Vista: paciente -----------------------------------------------------------------
  function renderPatient(patientId) {
    const p = ctx.patientById(patientId) || {};
    const visits = groups().filter((g) => g.patientId === patientId);
    const sub = [p.code, p.age ? p.age + ' años' : '', contactOf(p)].filter(Boolean).join(' · ');
    body.innerHTML = `
      <div class="explorer-head">
        <div><strong>${escapeHtml(p.name || visits[0]?.patientName || 'Paciente')}</strong><small>${sub}</small></div>
        <span class="muted">${visits.length} visita(s) · ${visits.reduce((n, g) => n + g.studies.length, 0)} examen(es)</span>
      </div>
      ${searchBox('Buscar por fecha (08/10/2026, oct 2026), médico o examen')}
      ${groupRows(visits.filter(matches))}`;
  }

  // --- Vista: grupo --------------------------------------------------------------------
  function renderGroup(key) {
    const g = groupByKey(key);
    if (!g) {
      body.innerHTML = '<div class="empty">Este grupo ya no tiene exámenes (se eliminaron o cambiaron de médico o de fecha).</div>';
      return;
    }
    body.innerHTML = `
      <div class="explorer-head">
        <div>
          <strong><button type="button" class="link-btn" data-patient="${escapeHtml(g.patientId)}">${escapeHtml(g.patientName)}</button></strong>
          <small>${fmtDate(g.date)} · ${g.doctorId ? `<button type="button" class="link-btn" data-doctor="${escapeHtml(g.doctorId)}">${escapeHtml(doctorLabel(g.doctorId))}</button>` : '<span class="warn-text">Sin médico</span>'}</small>
        </div>
        <div class="panel-actions">
          <label class="group-doctor"><span>Médico del grupo</span><select class="input select input-sm" data-group-doctor>${doctorOptions(state.doctors, g.doctorId)}</select></label>
          <button type="button" class="btn btn-primary btn-sm" data-add-exam>${icon('plus')} Agregar examen</button>
        </div>
      </div>
      ${ui.adding ? examForm(null, g) : ''}
      ${g.studies.map((s) => examCard(s)).join('')}`;
  }

  function examForm(s, g) {
    const v = s || { modality: 'Panorámica', description: '', date: g.date, doctorId: g.doctorId };
    return `
      <form class="exam-form" data-exam-form="${s ? escapeHtml(s.id) : ''}">
        <div class="form-row ${s ? 'four' : 'three'}">
          <div class="field"><label>Modalidad <select class="input select" name="modality">${STUDY_MODALITIES.map((x) => `<option${x === v.modality ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div>
          <div class="field"><label>Descripción <input class="input" name="description" value="${escapeHtml(v.description || '')}"></label></div>
          ${s ? `<div class="field"><label>Fecha <input class="input" type="date" name="date" value="${escapeHtml(v.date)}"></label></div>
          <div class="field"><label>Médico <select class="input select" name="doctorId">${doctorOptions(state.doctors, v.doctorId)}</select></label></div>`
          : `<div class="field"><label>Imágenes <span class="opt">(DICOM, fotos…)</span> <input class="input" type="file" name="files" multiple data-exam-files></label></div>`}
        </div>
        ${s ? '' : `<div class="field"><label>Informe <span class="opt">(PDF, opcional)</span> <input class="input" type="file" name="report" accept="application/pdf,.pdf" multiple data-exam-report></label></div>`}
        ${s ? '<p class="hint">Si cambia la fecha o el médico, el examen pasa al grupo que corresponda.</p>' : ''}
        <div class="exam-form-actions"><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancelar</button><button type="submit" class="btn btn-primary btn-sm">${s ? 'Guardar' : 'Subir examen'}</button></div>
        <div class="progress" hidden><span></span></div>
      </form>`;
  }

  function fileRow(f) {
    const pdf = fileKind(f) === 'pdf';
    return `
          <li data-path="${escapeHtml(f.path)}">
            <span class="file-icon ${fileKind(f)}">${icon(pdf ? 'file' : 'image')}</span>
            <span class="file-name">${escapeHtml(f.name)}</span>
            <span class="mono">${fmtSize(f.size)}</span>
            <span class="row-actions">
              ${pdf ? `<button type="button" class="icon-btn" data-open-file title="Abrir PDF" aria-label="Abrir PDF">${icon('eye')}</button>` : ''}
              <button type="button" class="icon-btn" data-download title="Descargar" aria-label="Descargar">${icon('download')}</button>
              <button type="button" class="icon-btn" data-rename title="Renombrar" aria-label="Renombrar">${icon('edit')}</button>
              <button type="button" class="icon-btn" data-delete-file title="Eliminar archivo" aria-label="Eliminar archivo">${icon('trash')}</button>
            </span>
          </li>`;
  }

  const fmtStamp = (ms) => new Date(ms).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Cada examen (del modificado más recientemente al más antiguo): sus imágenes (DICOM, fotos…) y su informe PDF, por separado.
  function examCard(s) {
    const id = escapeHtml(s.id);
    const files = s.files || [];
    const images = files.filter((f) => fileKind(f) !== 'pdf');
    const reports = files.filter((f) => fileKind(f) === 'pdf');
    const isReportOnly = s.modality === 'Informe';
    const changed = modifiedAt(s);
    return `
      <article class="exam-card" data-study="${id}">
        <header>
          <div>
            <span class="badge ${isReportOnly ? 'green' : 'blue'}">${escapeHtml(s.modality)}</span>
            <strong>${escapeHtml(s.description || s.modality)}</strong>
            <small class="mono">${escapeHtml(s.code || '')}</small>
            ${changed ? `<small class="muted" title="Última modificación: subida, archivos o datos">Modificado ${fmtStamp(changed)}</small>` : ''}
            ${s.status === 'Nuevo' ? '<span class="badge amber" title="El médico aún no lo abre">No visto</span>' : ''}
            ${!isReportOnly && !reports.length ? '<span class="badge gray" title="Este examen aún no tiene su informe PDF">Sin informe</span>' : ''}
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-outline btn-sm" data-view title="Abrir en el visor">${icon('eye')} Ver</button>
            <button type="button" class="btn btn-outline btn-sm" data-add-files title="Subir más imágenes a este examen">${icon('upload')} Agregar archivos</button>
            <button type="button" class="icon-btn" data-edit title="Editar examen" aria-label="Editar examen">${icon('edit')}</button>
            <button type="button" class="icon-btn" data-delete-study title="Eliminar examen" aria-label="Eliminar examen">${icon('trash')}</button>
          </div>
        </header>
        ${ui.editing === s.id ? examForm(s) : ''}
        <div class="progress" data-progress hidden><span></span></div>
        ${isReportOnly ? '' : `<h5 class="exam-sub">Imágenes</h5>
        ${images.length ? `<ul class="exam-files">${images.map(fileRow).join('')}</ul>` : '<p class="muted exam-empty">Sin imágenes. Use «Agregar archivos».</p>'}`}
        <div class="exam-sub exam-sub-report">
          <h5>Informe</h5>
          <button type="button" class="btn btn-ghost btn-sm" data-add-report>${icon('upload')} ${reports.length ? 'Agregar otro PDF' : 'Subir informe (PDF)'}</button>
        </div>
        ${reports.length ? `<ul class="exam-files">${reports.map(fileRow).join('')}</ul>` : '<p class="muted exam-empty">Aún no se subió el informe de este examen.</p>'}
      </article>`;
  }

  // --- Acciones ------------------------------------------------------------------------------
  const studyById = (id) => state.studies.find((s) => s.id === id);
  const currentGroup = () => { const c = stack[stack.length - 1]; return c && c.type === 'group' ? groupByKey(c.id) : null; };

  async function refresh(message) {
    await ctx.reload();
    if (message) toast(message);
    render();
  }

  // Si un examen cambió de médico o de fecha, el explorador sigue a su nuevo grupo.
  function followStudy(id) {
    const s = studyById(id);
    const c = stack[stack.length - 1];
    if (s && c && c.type === 'group' && !groupByKey(c.id)) { c.id = groupKey(s); render(); }
  }

  async function fileUrl(file) {
    const url = await backend.fileUrl(file);
    if (!url) toast(isDemo ? 'En modo demostración no hay archivos para descargar.' : 'No se encontró el archivo.');
    return url;
  }

  crumbs.addEventListener('click', (e) => { const b = e.target.closest('[data-crumb]'); if (b) goTo(Number(b.dataset.crumb)); });

  body.addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = body.querySelector('[data-search]');
    input.focus();
    input.setSelectionRange(pos, pos);
  });

  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.group) return push('group', t.dataset.group);
    if (t.dataset.patient) return push('patient', t.dataset.patient);
    if (t.dataset.doctor) return push('doctor', t.dataset.doctor);
    if (t.hasAttribute('data-add-exam')) { ui = { adding: true }; return render(); }
    if (t.hasAttribute('data-cancel')) { ui = {}; return render(); }

    const card = t.closest('[data-study]');
    const study = card && studyById(card.dataset.study);
    if (!study) return;
    if (t.hasAttribute('data-view')) {
      if (isDemo && (study.files || []).every((f) => fileKind(f) === 'pdf')) { toast('En modo demostración los PDF no se pueden abrir.'); return; }
      return openStudy(study);
    }
    if (t.hasAttribute('data-edit')) { ui = { editing: study.id }; return render(); }
    if (t.hasAttribute('data-add-files') || t.hasAttribute('data-add-report')) {
      uploadTarget = study;
      fileInput.value = '';
      fileInput.accept = t.hasAttribute('data-add-report') ? 'application/pdf,.pdf' : '';
      return fileInput.click();
    }
    if (t.hasAttribute('data-delete-study')) {
      if (!confirm('¿Eliminar el examen «' + (study.description || study.modality) + '» (' + study.code + ') y todos sus archivos?')) return;
      try { await backend.deleteStudy(study); await refresh('Examen eliminado.'); } catch (ex) { toast('No se pudo eliminar: ' + ex.message); }
      return;
    }

    const li = t.closest('[data-path]');
    const file = li && (study.files || []).find((f) => f.path === li.dataset.path);
    if (!file) return;
    if (t.hasAttribute('data-open-file') || t.hasAttribute('data-download')) {
      const url = await fileUrl(file);
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      if (t.hasAttribute('data-download')) a.download = file.name;
      a.click();
      return;
    }
    if (t.hasAttribute('data-rename')) {
      const name = prompt('Nuevo nombre del archivo:', file.name);
      if (!name || name.trim() === file.name) return;
      try { await backend.renameStudyFile(study, file.path, name); await refresh('Archivo renombrado.'); } catch (ex) { toast('No se pudo renombrar: ' + ex.message); }
      return;
    }
    if (t.hasAttribute('data-delete-file')) {
      if (!confirm('¿Eliminar el archivo «' + file.name + '»? No se puede deshacer.')) return;
      try { await backend.deleteStudyFile(study, file.path); await refresh('Archivo eliminado.'); } catch (ex) { toast('No se pudo eliminar: ' + ex.message); }
    }
  });

  // Médico de todo el grupo: se cambia en cada uno de sus exámenes.
  body.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-group-doctor]')) return;
    const g = currentGroup();
    if (!g) return;
    e.target.disabled = true;
    try {
      await Promise.all(g.studies.map((s) => backend.setStudyDoctor(s.id, e.target.value)));
      stack[stack.length - 1].id = groupKey({ ...g, doctorId: e.target.value });
      await refresh(e.target.value ? 'El grupo pasó al portal de ' + ctx.doctorName(e.target.value) + '.' : 'El grupo quedó sin médico.');
    } catch (ex) { toast('No se pudo cambiar el médico: ' + ex.message); e.target.disabled = false; }
  });

  // Formularios: editar examen o agregar un examen nuevo al grupo.
  body.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-exam-form]');
    if (!f) return;
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(f));
    btn.disabled = true;
    try {
      const id = f.dataset.examForm;
      if (id) {
        const before = groupKey(studyById(id));
        await backend.updateStudy(studyById(id), { modality: data.modality, description: data.description, date: data.date, doctorId: data.doctorId });
        ui = {};
        const moved = before !== groupKey({ ...studyById(id), date: data.date, doctorId: data.doctorId || null });
        await refresh(moved ? 'Examen actualizado: pasó al grupo del ' + fmtDate(data.date) + ' · ' + doctorLabel(data.doctorId) + '.' : 'Examen actualizado.');
        followStudy(id);
      } else {
        const g = currentGroup();
        const files = [...f.querySelector('[data-exam-files]').files, ...f.querySelector('[data-exam-report]').files];
        if (!files.length) { toast('Elija las imágenes o el informe del examen.'); btn.disabled = false; return; }
        const patient = ctx.patientById(g.patientId) || { id: g.patientId, name: g.patientName, code: g.patientCode, age: g.patientAge };
        const bar = f.querySelector('.progress');
        bar.hidden = false;
        await backend.uploadStudy({
          patient, doctorId: g.doctorId, date: g.date, modality: data.modality, description: data.description || data.modality, files,
          onProgress: (p) => { bar.querySelector('span').style.width = Math.round(p * 100) + '%'; }
        });
        ui = {};
        await refresh('Examen agregado al grupo.');
      }
    } catch (ex) { toast('No se pudo guardar: ' + ex.message); btn.disabled = false; }
  });

  // Subir más archivos a un examen existente.
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    const study = uploadTarget;
    if (!files.length || !study) return;
    const bar = body.querySelector(`[data-study="${CSS.escape(study.id)}"] [data-progress]`);
    if (bar) bar.hidden = false;
    try {
      await backend.addStudyFiles(study, files, (p) => { if (bar) bar.querySelector('span').style.width = Math.round(p * 100) + '%'; });
      await refresh(files.length + ' archivo(s) agregado(s).');
    } catch (ex) { toast('No se pudieron subir los archivos: ' + ex.message); if (bar) bar.hidden = true; }
  });

  return {
    openGroup: (key) => open('group', key),
    openPatient: (id) => open('patient', id),
    openDoctor: (id) => open('doctor', id || '')
  };
}
