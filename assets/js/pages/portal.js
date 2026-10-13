// Portal del médico: sus exámenes agrupados por visita (paciente + fecha; ver
// services/groups.js) y, a partir de ellos, sus pacientes. Los pacientes no
// tienen médico; cada examen sí.

import { backend } from '../services/backend.js';
import { fileKind, groupSearchText, groupStudies, searchTerm } from '../services/groups.js';
import { escapeHtml, setText, toast } from '../ui/dom.js';
import { fmtDate, fmtSize, initials } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { requireRole } from './session.js';
import { initViews } from './views.js';
import { initFilesModal, openStudy } from './study-actions.js';

export async function init() {
  const user = await requireRole('doctor');
  if (!user) return;
  const views = initViews({ fallback: 'examenes' });
  const openFiles = initFilesModal();
  const $ = (id) => document.getElementById(id);
  const grid = $('study-grid');
  const search = $('portal-search');
  const dateInput = $('portal-date');
  const mod = $('modality-filter');
  const chip = $('patient-chip');
  let mine = [];       // exámenes del médico
  let visits = [];     // grupos (paciente + fecha)
  let patientFilter = null;

  // --- Visitas ----------------------------------------------------------------------------
  function visitCard(g) {
    const sub = [g.patientCode, g.patientAge ? g.patientAge + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ');
    return '<article class="visit-card' + (g.hasNew ? ' is-new' : '') + '" data-key="' + escapeHtml(g.key) + '">' +
      '<header>' +
        '<span class="avatar">' + initials(g.patientName) + '</span>' +
        '<div><h3>' + escapeHtml(g.patientName) + '</h3><small>' + (sub ? sub + ' · ' : '') + fmtDate(g.date) + '</small></div>' +
        (g.hasNew ? '<span class="badge blue">Nuevo</span>' : '') +
      '</header>' +
      '<ul class="visit-exams">' + g.studies.map(examItem).join('') + '</ul>' +
      '<footer><span class="muted">' + g.fileCount + ' archivo(s) · ' + fmtSize(g.totalSize) + '</span>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-files>' + icon('download') + ' Descargar todo</button></footer>' +
    '</article>';
  }

  // Cada examen: abrir en el visor y, si ya tiene informe PDF, leerlo directamente.
  function examItem(s) {
    const id = escapeHtml(s.id);
    const isReport = s.modality === 'Informe';
    const hasReport = !isReport && reportsOf(s).length > 0;
    return '<li>' +
      '<span class="badge ' + (isReport ? 'green' : 'blue') + '">' + escapeHtml(s.modality) + '</span>' +
      '<span class="visit-exam-name">' + escapeHtml(s.description || s.modality) + '<small>' + (s.files || []).length + ' archivo(s) · ' + fmtSize(s.totalSize) +
        (isReport ? '' : hasReport ? ' · con informe' : ' · informe pendiente') + '</small></span>' +
      (s.status === 'Nuevo' ? '<span class="dot-new" title="Sin revisar"></span>' : '') +
      (hasReport ? '<button class="btn btn-outline btn-sm" type="button" data-report="' + id + '">' + icon('file') + ' Informe</button>' : '') +
      '<button class="btn btn-primary btn-sm" type="button" data-view="' + id + '">' + icon('eye') + ' ' + (isReport ? 'Leer' : 'Abrir') + '</button>' +
    '</li>';
  }

  function render() {
    visits = groupStudies(mine);
    const patients = patientsOf(visits);
    setText('stat-my-patients', patients.length);
    setText('stat-my-studies', mine.length);
    setText('stat-my-new', mine.filter((s) => s.status === 'Nuevo').length);

    const q = searchTerm(search.value);
    const rows = visits.filter((g) => (!patientFilter || g.patientId === patientFilter) &&
      (!dateInput.value || g.date === dateInput.value) &&
      (!mod.value || g.modalities.includes(mod.value)) &&
      (!q || groupSearchText(g).includes(q)));
    chip.hidden = !patientFilter;
    if (patientFilter) {
      const p = patients.find((x) => x.id === patientFilter);
      chip.innerHTML = 'Paciente: <strong>' + escapeHtml(p ? p.name : '') + '</strong> <button type="button" aria-label="Quitar filtro" data-clear-patient>' + icon('x') + '</button>';
    }
    grid.innerHTML = rows.length ? rows.map(visitCard).join('')
      : '<div class="empty">' + (mine.length ? 'No hay visitas que coincidan.' : 'Aún no tiene exámenes disponibles. Aparecerán aquí en cuanto DentFrucer los cargue.') + '</div>';

    $('patients-body').innerHTML = patients.length ? patients.map((p) => {
      const sub = [p.code, p.age ? p.age + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ');
      return '<tr><td><div class="cell-patient"><span class="avatar">' + initials(p.name) + '</span><div><strong>' + escapeHtml(p.name) + '</strong><small>' + (sub || '&nbsp;') + '</small></div></div></td>' +
        '<td>' + p.visits + '</td><td>' + fmtDate(p.last) + '</td>' +
        '<td><div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-patient="' + escapeHtml(p.id) + '">' + icon('folder') + ' Ver exámenes</button></div></td></tr>';
    }).join('') : '<tr><td colspan="4"><div class="empty">Aún no tiene pacientes con exámenes.</div></td></tr>';
  }

  search.addEventListener('input', render);
  dateInput.addEventListener('change', render);
  mod.addEventListener('change', render);

  // Abrir un examen lo marca como revisado; "Descargar todo" lista los archivos de la visita.
  grid.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-key]');
    const g = card && visits.find((x) => x.key === card.dataset.key);
    if (!g) return;
    if (e.target.closest('[data-files]')) {
      openFiles({ patientName: g.patientName + ' · ' + fmtDate(g.date), files: g.studies.flatMap((s) => s.files || []) });
      return;
    }
    const b = e.target.closest('[data-view], [data-report]');
    const s = b && g.studies.find((x) => x.id === (b.dataset.view || b.dataset.report));
    if (!s) return;
    if (b.dataset.view) openStudy(s);
    else await openReport(s);
    if (s.status === 'Nuevo') {
      try { await backend.markSeen(s.id); s.status = 'Visto'; render(); } catch (ex) { /* no crítico */ }
    }
  });

  // Informe del examen: si hay uno se abre en otra pestaña; si hay varios, se listan.
  async function openReport(s) {
    const reports = reportsOf(s);
    if (reports.length > 1) { openFiles({ patientName: reportTitle(s), files: reports }); return; }
    try {
      const url = await backend.fileUrl(reports[0]);
      if (!url) { toast('Los informes no se pueden abrir en modo demostración.'); return; }
      window.open(url, '_blank', 'noopener');
    } catch (ex) { toast('No se pudo abrir el informe.'); }
  }
  const reportTitle = (s) => s.patientName + ' · ' + (s.description || s.modality);

  // "Ver exámenes" de un paciente: filtra las visitas y sube a la lista.
  $('patients-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-patient]');
    if (!b) return;
    patientFilter = b.dataset.patient;
    render();
    views.go('examenes');
  });
  chip.addEventListener('click', (e) => { if (e.target.closest('[data-clear-patient]')) { patientFilter = null; render(); } });

  try {
    mine = await backend.listStudies({ doctorId: user.uid });
  } catch (e) {
    toast('No se pudieron cargar sus exámenes: ' + e.message);
  }
  render();
}

const reportsOf = (s) => (s.files || []).filter((f) => fileKind(f) === 'pdf');

// Pacientes del médico a partir de sus visitas: datos de la más reciente,
// cuántas visitas tiene y la fecha de la última.
function patientsOf(visits) {
  const map = new Map();
  for (const g of visits) {
    const p = map.get(g.patientId) || { id: g.patientId, visits: 0, last: '' };
    p.visits++;
    if (g.date >= p.last) Object.assign(p, { name: g.patientName, code: g.patientCode, age: g.patientAge, last: g.date });
    map.set(g.patientId, p);
  }
  return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
}
