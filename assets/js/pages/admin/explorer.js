// Explorador de exámenes: una ventana con tres niveles y una ruta arriba
// ("Médico › Paciente › Visita") para volver atrás.
//
//   Médico    sus pacientes y, de cada uno, sus visitas con ese médico
//   Paciente  todas sus visitas, cada una con sus exámenes (se pueden abrir en
//             el visor desde aquí), con búsqueda por fecha, médico o examen
//   Visita    los exámenes de un paciente en una fecha, para los mismos médicos:
//             resumen (paciente, médicos, cobro), y cada examen con sus imágenes
//             y su informe PDF: ver, editar datos y médicos, subir, renombrar,
//             descargar y eliminar archivos, agregar otro examen.
//
// Sin el permiso "Exámenes" el explorador es de solo lectura.

import { backend, isDemo } from '../../services/backend.js';
import { doctorsOf, fileKind, groupKey, groupSearchText, groupStudies, isReportOnly, modifiedAt, PAY_STATE, searchTerm } from '../../services/groups.js';
import { fmtCLP, isPaid } from '../../services/payments.js';
import { studyServiceId, studyServiceName } from '../../services/settings.js';
import { escapeHtml, modal, toast } from '../../ui/dom.js';
import { fmtDate, fmtSize, initials } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { openStudy } from '../study-actions.js';
import { bindDoctorPickers, contactOf, doctorNames, doctorPickerHtml, pickerValue, serviceOptions } from './common.js';

const LEVEL = { doctor: 'Médico', patient: 'Paciente', group: 'Visita' };
const PAY_BADGE = { paid: 'green', partial: 'amber', unpaid: 'gray' };
const payBadge = (g) => `<span class="badge ${PAY_BADGE[g.payState]}">${PAY_STATE[g.payState]}</span>`;

export function createExplorer(ctx) {
  const { state } = ctx;
  const m = modal('explorer-modal');
  const body = document.getElementById('explorer-body');
  const crumbs = document.getElementById('explorer-crumbs');
  const fileInput = document.getElementById('explorer-file-input');
  let stack = [];            // [{ type: 'doctor' | 'patient' | 'group', id }]
  let query = '';            // búsqueda en las vistas de médico y paciente
  let ui = {};               // { editing: studyId, adding: true } dentro de una visita
  let uploadTarget = null;   // examen al que se suben archivos
  let expanded = new Set();  // visitas desplegadas en las vistas de paciente y médico

  const canEdit = () => ctx.can('examenes');
  const groups = () => groupStudies(state.studies);
  const groupByKey = (key) => groups().find((g) => g.key === key);
  const names = (ids) => doctorNames(state.doctors, ids);
  const longDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  // --- Navegación ---------------------------------------------------------------------
  function open(type, id) { stack = [{ type, id }]; query = ''; ui = {}; expanded = new Set(); render(); m.open(); }
  function push(type, id) { stack.push({ type, id }); query = ''; ui = {}; render(); body.scrollTop = 0; }
  function goTo(i) { stack = stack.slice(0, i + 1); query = ''; ui = {}; render(); }

  function crumbLabel({ type, id }) {
    if (type === 'doctor') return ctx.doctorName(id) || 'Sin médico';
    if (type === 'patient') return (ctx.patientById(id) || {}).name || 'Paciente';
    const g = groupByKey(id);
    return g ? fmtDate(g.date) : 'Visita';
  }

  function render() {
    const back = stack.length > 1 ? `<button type="button" class="crumb-back" data-crumb="${stack.length - 2}" aria-label="Volver">${icon('arrowLeft')}</button>` : '';
    crumbs.innerHTML = back + stack.map((c, i) => (i < stack.length - 1
      ? `<button type="button" data-crumb="${i}"><small>${LEVEL[c.type]}</small>${escapeHtml(crumbLabel(c))}</button><span class="crumb-sep" aria-hidden="true">›</span>`
      : `<h3 id="explorer-title"><small>${LEVEL[c.type]}</small>${escapeHtml(crumbLabel(c))}</h3>`)).join('');
    body.classList.toggle('readonly', !canEdit());
    const cur = stack[stack.length - 1];
    if (!cur) return;
    if (cur.type === 'doctor') renderDoctor(cur.id);
    else if (cur.type === 'patient') renderPatient(cur.id);
    else renderGroup(cur.id);
  }

  const searchBox = (placeholder) => `<label class="search explorer-search"><span class="sr-only">Buscar</span>${icon('search')}<input class="input" type="search" data-search placeholder="${placeholder}" value="${escapeHtml(query)}"></label>`;
  const matches = (g) => !query || groupSearchText(g, names(g.doctorIds)).includes(searchTerm(query));

  // Estado de un examen: si ya tiene su informe.
  const reportsOf = (s) => (s.files || []).filter((f) => fileKind(f) === 'pdf');
  function examStatus(s) {
    const out = [];
    if (!isReportOnly(s)) out.push(reportsOf(s).length ? '<span class="st ok">Informe listo</span>' : '<span class="st warn">Falta el informe</span>');
    return out.join('');
  }

  // Tarjeta de una visita (vistas de paciente y médico): fecha, médicos y, al
  // desplegarla, sus exámenes (que se abren en el visor desde ahí).
  function visitCard(g, { showDoctor = true } = {}) {
    const key = escapeHtml(g.key);
    const open = expanded.has(g.key);
    return `
      <article class="visit-item${open ? ' is-open' : ''}">
        <div class="visit-item-head">
          <button type="button" class="visit-toggle" data-toggle-visit="${key}" aria-expanded="${open}" title="${open ? 'Ocultar' : 'Ver'} los exámenes de esta visita">
            <span class="visit-chevron">${icon('chevronRight')}</span>
            <span class="visit-date"><strong>${fmtDate(g.date)}</strong><small>${escapeHtml(longDate(g.date).split(',')[0])}</small></span>
            <span class="visit-meta">
              ${showDoctor ? `<span class="${g.doctorIds.length ? '' : 'warn-text'}">${icon('stethoscope')} ${escapeHtml(names(g.doctorIds))}</span>` : ''}
              <span class="visit-counts"><span class="badge green">${plural(g.studies.length, 'examen', 'exámenes')}</span>${g.missingReports ? `<span class="badge red">${g.missingReports} sin informe</span>` : ''}</span>
            </span>
          </button>
          <span class="visit-open">${payBadge(g)}<button type="button" class="btn btn-outline btn-sm" data-group="${key}">Abrir visita ${icon('chevronRight')}</button></span>
        </div>
        <ul class="visit-item-exams"${open ? '' : ' hidden'}>${g.studies.map((s) => `
          <li data-study="${escapeHtml(s.id)}">
            <span class="vi-name"><strong>${escapeHtml(studyServiceName(s))}</strong>${s.description ? ` <span class="muted">· ${escapeHtml(s.description)}</span>` : ''}</span>
            <span class="vi-status">${examStatus(s)}</span>
            <button type="button" class="btn btn-ghost btn-sm" data-view>${icon('eye')} Ver</button>
          </li>`).join('')}</ul>
      </article>`;
  }

  const personHead = (name, sub, stats, color = '') => `
    <div class="explorer-card person-head">
      <span class="avatar"${color ? ` style="background:${color}"` : ''}>${initials(name)}</span>
      <div><strong>${escapeHtml(name)}</strong><small>${sub}</small></div>
      <div class="person-stats">${stats}</div>
    </div>`;

  // --- Vista: médico -------------------------------------------------------------------
  function renderDoctor(doctorId) {
    const d = state.doctors.find((x) => x.id === doctorId) || {};
    const mine = groups().filter((g) => (doctorId ? g.doctorIds.includes(doctorId) : !g.doctorIds.length));
    const byPatient = new Map();
    mine.filter(matches).forEach((g) => { if (!byPatient.has(g.patientId)) byPatient.set(g.patientId, []); byPatient.get(g.patientId).push(g); });
    const patients = [...byPatient.entries()].sort((a, b) => (a[1][0].patientName || '').localeCompare(b[1][0].patientName || '', 'es'));
    body.innerHTML = personHead(d.name || 'Sin médico', escapeHtml([d.specialty, d.email].filter(Boolean).join(' · ')),
      `<span><strong>${new Set(mine.map((g) => g.patientId)).size}</strong> pacientes</span><span><strong>${mine.reduce((n, g) => n + g.studies.length, 0)}</strong> exámenes</span>`, 'var(--green-600)') +
      searchBox('Buscar paciente, fecha o examen') +
      (patients.length ? patients.map(([pid, list]) => `
        <section class="explorer-section">
          <h4><button type="button" class="link-btn" data-patient="${escapeHtml(pid)}">${escapeHtml(list[0].patientName)}</button> <small>${plural(list.length, 'visita', 'visitas')}</small></h4>
          ${list.map((g) => visitCard(g, { showDoctor: false })).join('')}
        </section>`).join('') : '<div class="empty">' + (query ? 'Nada coincide con la búsqueda.' : 'Este médico aún no tiene exámenes.') + '</div>');
  }

  // --- Vista: paciente -----------------------------------------------------------------
  function renderPatient(patientId) {
    const p = ctx.patientById(patientId) || {};
    const visits = groups().filter((g) => g.patientId === patientId);
    const name = p.name || visits[0]?.patientName || 'Paciente';
    const sub = [p.code, p.age ? p.age + ' años' : '', contactOf(p)].filter(Boolean).join(' · ') || '<span class="muted">Sin expediente</span>';
    const shown = visits.filter(matches);
    body.innerHTML = personHead(name, sub,
      `<span><strong>${visits.length}</strong> ${visits.length === 1 ? 'visita' : 'visitas'}</span><span><strong>${visits.reduce((n, g) => n + g.studies.length, 0)}</strong> exámenes</span>${visits[0] ? `<span>Última: <strong>${fmtDate(visits[0].date)}</strong></span>` : ''}`) +
      (visits.length > 1 ? searchBox('Buscar por fecha (08/10/2026, oct 2026), médico o examen') : '') +
      (shown.length ? `<p class="explorer-hint">Todas las visitas del paciente, de la más reciente a la más antigua. Haga clic en una visita para ver sus exámenes («Ver» los abre en el visor); «Abrir visita» muestra sus archivos para editarlos.</p>` + shown.map((g) => visitCard(g)).join('')
        : '<div class="empty">' + (query ? 'Nada coincide con la búsqueda.' : 'Este paciente aún no tiene exámenes.') + '</div>');
  }

  // --- Vista: visita -------------------------------------------------------------------
  function renderGroup(key) {
    const g = groupByKey(key);
    if (!g) {
      body.innerHTML = '<div class="empty">Esta visita ya no tiene exámenes (se eliminaron o cambiaron de médicos o de fecha).</div>';
      return;
    }
    const p = ctx.patientById(g.patientId) || {};
    const sub = [g.patientCode, g.patientAge ? g.patientAge + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ');
    // Cobros de la visita: los asociados a sus exámenes o, si no, los del mismo paciente y día.
    const ids = new Set(g.studies.map((x) => x.id));
    // Solo cuentan los pagados; un cobro con la maquinita en curso se avisa aparte.
    const linked = (state.payments || []).filter((x) => (x.studyIds || []).some((id) => ids.has(id)));
    const related = linked.length ? linked : (state.payments || []).filter((x) => x.patientId === g.patientId && x.date === g.date && !(x.studyIds || []).length);
    const pays = related.filter(isPaid);
    const waiting = related.some((x) => x.status === 'pending');
    const paid = pays.reduce((n, x) => n + (x.total || 0), 0);
    const payInfo = payBadge(g) + (pays.length
      ? ` <strong>${fmtCLP(paid)}</strong> <span class="muted">· ${escapeHtml(pays.map((x) => x.method + (x.docNumber ? ' · ' + x.docType + ' ' + x.docNumber : '')).join(' / '))}</span>`
      : waiting ? '' : ' <span class="muted">Sin cobro registrado</span>') + (waiting ? ' <span class="badge amber">Esperando la maquinita</span>' : '');
    const payActions = ctx.can('cobros') ? `<br><span class="pay-actions">
      <button type="button" class="link-btn" data-pay>${pays.length ? 'Registrar otro cobro' : 'Registrar cobro'}</button>
      <button type="button" class="link-btn" data-mark-paid="${g.payState === 'paid' ? '0' : '1'}">${g.payState === 'paid' ? 'Marcar como no pagada' : 'Marcar como pagada'}</button></span>` : '';
    body.innerHTML = `
      <div class="explorer-card visit-summary">
        <div class="vs-title">
          <h2>Visita del ${escapeHtml(longDate(g.date))}</h2>
          <p>Una visita reúne los exámenes que el paciente se hizo este día. Cada examen tiene sus imágenes y su informe PDF.</p>
        </div>
        <dl class="vs-grid">
          <div><dt>Paciente</dt><dd><strong>${escapeHtml(g.patientName)}</strong>${sub ? ' <span class="muted">· ' + sub + '</span>' : ''}<br><button type="button" class="link-btn" data-patient="${escapeHtml(g.patientId)}">Ver todas sus visitas</button>${contactOf(p) ? ' <span class="muted">· ' + contactOf(p) + '</span>' : ''}</dd></div>
          <div><dt>Médicos</dt><dd>${canEdit()
            ? doctorPickerHtml(state.doctors, g.doctorIds, { emptyLabel: 'Sin médico: solo lo ve la clínica' }) + '<small class="muted">Los exámenes de esta visita aparecen en el portal de estos médicos.</small>'
            : escapeHtml(names(g.doctorIds))}</dd></div>
          <div><dt>Contenido</dt><dd>${plural(g.studies.length, 'examen', 'exámenes')} · ${plural(g.fileCount, 'archivo', 'archivos')} · ${fmtSize(g.totalSize)}${g.missingReports ? '<br><span class="warn-text">' + plural(g.missingReports, 'examen sin informe', 'exámenes sin informe') + '</span>' : '<br><span class="ok-text">Todos los informes subidos</span>'}</dd></div>
          <div><dt>Pago</dt><dd>${payInfo}${payActions}</dd></div>
        </dl>
      </div>
      <h3 class="explorer-subtitle">Exámenes de la visita</h3>
      ${g.studies.map((s, i) => examCard(s, i + 1, g.studies.length)).join('')}
      ${canEdit() ? (ui.adding ? examForm(null, g) : `<button type="button" class="add-exam-card" data-add-exam>${icon('plus')} Agregar otro examen a esta visita</button>`) : ''}`;
  }

  function examForm(s, g) {
    const v = s || { description: '', date: g.date, doctorIds: g.doctorIds };
    return `
      <form class="exam-form" data-exam-form="${s ? escapeHtml(s.id) : ''}">
        <h4>${s ? 'Editar datos del examen' : 'Nuevo examen en esta visita'}</h4>
        <div class="form-row ${s ? 'three' : 'two'}">
          <div class="field"><label>Servicio <select class="input select" name="serviceId">${serviceOptions(s ? studyServiceId(s) : '', s ? studyServiceName(s) : '')}</select></label></div>
          <div class="field"><label>Detalle <span class="opt">(opcional)</span> <input class="input" name="description" maxlength="120" value="${escapeHtml(v.description || '')}" placeholder="Ej.: maxilar completo, pieza 36"></label></div>
          ${s ? `<div class="field"><label>Fecha <input class="input" type="date" name="date" value="${escapeHtml(v.date)}"></label></div>` : ''}
        </div>
        ${s ? `<div class="field"><span class="field-label">Médicos de este examen</span>${doctorPickerHtml(state.doctors, doctorsOf(v))}</div>
        <p class="hint">Si cambia la fecha o los médicos, el examen pasa a la visita que corresponda.</p>`
        : `<div class="form-row">
          <div class="field"><label>Imágenes <span class="opt">(DICOM, fotos…)</span> <input class="input" type="file" name="files" multiple data-exam-files></label></div>
          <div class="field"><label>Informe <span class="opt">(PDF, opcional)</span> <input class="input" type="file" name="report" accept="application/pdf,.pdf" multiple data-exam-report></label></div>
        </div>`}
        <div class="exam-form-actions"><button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancelar</button><button type="submit" class="btn btn-primary btn-sm">${s ? 'Guardar cambios' : 'Subir examen'}</button></div>
        <div class="progress" hidden><span></span></div>
      </form>`;
  }

  function fileRow(f) {
    const pdf = fileKind(f) === 'pdf';
    return `
          <li data-path="${escapeHtml(f.path)}">
            <span class="file-icon ${fileKind(f)}">${icon(pdf ? 'file' : 'image')}</span>
            <span class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
            <span class="mono">${fmtSize(f.size)}</span>
            <span class="row-actions">
              ${pdf ? `<button type="button" class="icon-btn" data-open-file title="Abrir PDF" aria-label="Abrir PDF">${icon('eye')}</button>` : ''}
              <button type="button" class="icon-btn" data-download title="Descargar" aria-label="Descargar">${icon('download')}</button>
              <button type="button" class="icon-btn edit-only" data-rename title="Renombrar" aria-label="Renombrar">${icon('edit')}</button>
              <button type="button" class="icon-btn edit-only" data-delete-file title="Eliminar archivo" aria-label="Eliminar archivo">${icon('trash')}</button>
            </span>
          </li>`;
  }

  const fmtStamp = (ms) => new Date(ms).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Cada examen (del modificado más recientemente al más antiguo), numerado,
  // con sus imágenes y su informe en dos columnas.
  function examCard(s, n, total) {
    const id = escapeHtml(s.id);
    const files = s.files || [];
    const images = files.filter((f) => fileKind(f) !== 'pdf');
    const reports = reportsOf(s);
    const reportOnly = isReportOnly(s);
    const changed = modifiedAt(s);
    return `
      <article class="exam-card" data-study="${id}">
        <header>
          <span class="exam-num" title="Examen ${n} de ${total}">${n}</span>
          <div class="exam-title">
            <div><strong>${escapeHtml(studyServiceName(s))}</strong>${s.description ? ` <span class="muted">· ${escapeHtml(s.description)}</span>` : ''}</div>
            <small class="muted"><span class="mono">${escapeHtml(s.code || '')}</span>${changed ? ' · Modificado ' + fmtStamp(changed) : ''}</small>
            <div class="exam-status">${examStatus(s)}</div>
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-primary btn-sm" data-view title="Abrir en el visor">${icon('eye')} Ver</button>
            <button type="button" class="btn btn-outline btn-sm edit-only" data-edit title="Editar servicio, detalle, fecha o médicos">${icon('edit')} Editar</button>
            <button type="button" class="icon-btn edit-only" data-delete-study title="Eliminar examen" aria-label="Eliminar examen">${icon('trash')}</button>
          </div>
        </header>
        ${ui.editing === s.id ? examForm(s) : ''}
        <div class="progress" data-progress hidden><span></span></div>
        <div class="exam-columns${reportOnly ? ' single' : ''}">
          ${reportOnly ? '' : `<section>
            <div class="exam-sub"><h5>${icon('image')} Imágenes <small>${images.length}</small></h5><button type="button" class="btn btn-ghost btn-sm edit-only" data-add-files>${icon('upload')} Subir imágenes</button></div>
            ${images.length ? `<ul class="exam-files">${images.map(fileRow).join('')}</ul>` : '<p class="muted exam-empty">Sin imágenes.</p>'}
          </section>`}
          <section class="exam-report${reports.length ? '' : ' missing'}">
            <div class="exam-sub"><h5>${icon('file')} Informe <small>${reports.length}</small></h5><button type="button" class="btn btn-ghost btn-sm edit-only" data-add-report>${icon('upload')} ${reports.length ? 'Agregar PDF' : 'Subir informe'}</button></div>
            ${reports.length ? `<ul class="exam-files">${reports.map(fileRow).join('')}</ul>` : '<p class="exam-empty">Aún no se subió el informe de este examen.</p>'}
          </section>
        </div>
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

  // Si un examen cambió de médicos o de fecha, el explorador sigue a su nueva visita.
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
    if (t.dataset.toggleVisit) {
      if (expanded.has(t.dataset.toggleVisit)) expanded.delete(t.dataset.toggleVisit); else expanded.add(t.dataset.toggleVisit);
      return render();
    }
    if (t.dataset.group) return push('group', t.dataset.group);
    if (t.dataset.patient) return push('patient', t.dataset.patient);
    if (t.dataset.doctor) return push('doctor', t.dataset.doctor);
    if (t.hasAttribute('data-add-exam')) { ui = { adding: true }; return render(); }
    if (t.hasAttribute('data-cancel')) { ui = {}; return render(); }
    if (t.hasAttribute('data-pay')) {
      const g = currentGroup();
      if (g && ctx.openPayment) ctx.openPayment({ patientId: g.patientId, date: g.date, visitKey: g.key });
      return;
    }
    // Estado de pago a mano (por ejemplo, pagada por convenio sin cobro registrado aquí).
    if (t.dataset.markPaid !== undefined) {
      const g = currentGroup();
      if (!g) return;
      const paid = t.dataset.markPaid === '1';
      try {
        await backend.setStudiesPaid(g.studies.map((x) => x.id), paid);
        await refresh(paid ? 'Visita marcada como pagada.' : 'Visita marcada como por cobrar.');
      } catch (ex) { toast('No se pudo cambiar el estado de pago: ' + ex.message); }
      return;
    }

    const card = t.closest('[data-study]');
    const study = card && studyById(card.dataset.study);
    if (!study) return;
    if (t.hasAttribute('data-view')) {
      if (isDemo && (study.files || []).every((f) => fileKind(f) === 'pdf')) { toast('En modo demostración los PDF no se pueden abrir.'); return; }
      return openStudy(study);
    }
    if (!canEdit()) return;
    if (t.hasAttribute('data-edit')) { ui = { editing: ui.editing === study.id ? null : study.id }; return render(); }
    if (t.hasAttribute('data-add-files') || t.hasAttribute('data-add-report')) {
      uploadTarget = study;
      fileInput.value = '';
      fileInput.accept = t.hasAttribute('data-add-report') ? 'application/pdf,.pdf' : '';
      return fileInput.click();
    }
    if (t.hasAttribute('data-delete-study')) {
      if (!confirm('¿Eliminar el examen «' + studyServiceName(study) + '» (' + study.code + ') y todos sus archivos?')) return;
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

  // Médicos: el selector del resumen cambia los de todos los exámenes de la
  // visita; el del formulario de un examen solo se guarda con ese formulario.
  bindDoctorPickers(body, () => state.doctors, async (picker, ids) => {
    if (picker.closest('[data-exam-form]')) return;
    const g = currentGroup();
    if (!g) return;
    picker.classList.add('busy');
    try {
      await Promise.all(g.studies.map((s) => backend.setStudyDoctors(s.id, ids)));
      stack[stack.length - 1].id = groupKey({ ...g, doctorIds: ids });
      await refresh(ids.length ? 'Los exámenes de la visita ahora están en el portal de ' + names(ids) + '.' : 'La visita quedó sin médico: solo la ve la clínica.');
    } catch (ex) { toast('No se pudieron cambiar los médicos: ' + ex.message); render(); }
  });

  // Formularios: editar examen o agregar un examen nuevo a la visita.
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
        const doctorIds = pickerValue(f.querySelector('[data-doctor-picker]'));
        const service = f.querySelector('[name=serviceId]').selectedOptions[0]?.textContent || '';
        await backend.updateStudy(studyById(id), { serviceId: data.serviceId, service, description: data.description, date: data.date, doctorIds });
        ui = {};
        const moved = before !== groupKey({ ...studyById(id), date: data.date, doctorIds });
        await refresh(moved ? 'Examen actualizado: pasó a la visita del ' + fmtDate(data.date) + ' · ' + names(doctorIds) + '.' : 'Examen actualizado.');
        followStudy(id);
      } else {
        const g = currentGroup();
        const files = [...f.querySelector('[data-exam-files]').files, ...f.querySelector('[data-exam-report]').files];
        if (!files.length) { toast('Elija las imágenes o el informe del examen.'); btn.disabled = false; return; }
        const patient = ctx.patientById(g.patientId) || { id: g.patientId, name: g.patientName, code: g.patientCode, age: g.patientAge };
        const bar = f.querySelector('.progress');
        bar.hidden = false;
        await backend.uploadStudy({
          patient, doctorIds: g.doctorIds, date: g.date, serviceId: data.serviceId, service: f.querySelector('[name=serviceId]').selectedOptions[0]?.textContent || '',
          description: data.description, files,
          onProgress: (p) => { bar.querySelector('span').style.width = Math.round(p * 100) + '%'; }
        });
        ui = {};
        await refresh('Examen agregado a la visita.');
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
    openDoctor: (id) => open('doctor', id || ''),
    refresh: () => { if (m.el.classList.contains('open')) render(); }
  };
}
