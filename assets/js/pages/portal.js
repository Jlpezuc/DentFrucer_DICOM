// Portal del médico: los estudios asignados a su cuenta y, a partir de ellos,
// sus pacientes (los pacientes no tienen médico; cada estudio sí).

import { backend } from '../services/backend.js';
import { escapeHtml, setText, toast } from '../ui/dom.js';
import { fmtDate, fmtSize, initials, statusBadge } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { requireRole } from './session.js';
import { initFilesModal, openStudy } from './study-actions.js';

export async function init() {
  const user = await requireRole('doctor');
  if (!user) return;
  const openFiles = initFilesModal();
  let mine = [];
  let patients = [];

  const grid = document.getElementById('study-grid');
  const search = document.getElementById('portal-search');
  const mod = document.getElementById('modality-filter');

  function render() {
    setText('stat-my-patients', patients.length);
    setText('stat-my-studies', mine.length);
    setText('stat-my-new', mine.filter((s) => s.status === 'Nuevo').length);

    const q = search.value.trim().toLowerCase();
    const rows = mine.filter((s) => (!mod.value || s.modality === mod.value) && (!q || [s.patientName, s.patientCode, s.description].join(' ').toLowerCase().includes(q)));
    grid.innerHTML = rows.length ? rows.map((s) => {
      const shape = s.modality === 'Panorámica' ? 'pano' : (s.modality === 'CBCT' ? 'axial' : '');
      return '<article class="study-card">' +
        '<div class="study-thumb"><span class="badge blue mod">' + escapeHtml(s.modality) + '</span><div class="vm-shape ' + shape + '"></div></div>' +
        '<div class="study-body">' +
          '<h3>' + escapeHtml(s.patientName) + '</h3>' +
          '<div class="meta">' + escapeHtml(s.description) + '</div>' +
          '<div class="meta">' + fmtDate(s.date) + ' · ' + (s.files || []).length + ' archivo(s) · ' + fmtSize(s.totalSize) + '</div>' +
        '</div>' +
        '<div class="study-foot">' + statusBadge(s.status) +
          '<div class="row-actions">' +
            '<button class="icon-btn" title="Descargar" data-files="' + escapeHtml(s.id) + '">' + icon('download') + '</button>' +
            '<button class="btn btn-primary btn-sm" data-view="' + escapeHtml(s.id) + '">' + icon('eye') + ' Abrir</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('') : '<div class="empty">' + (mine.length ? 'No hay estudios que coincidan.' : 'Aún no tiene estudios disponibles. Aparecerán aquí en cuanto DentFrucer los cargue.') + '</div>';

    const pBody = document.getElementById('patients-body');
    pBody.innerHTML = patients.length ? patients.map((p) => {
      const sub = [p.code, p.age ? p.age + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ');
      return '<tr><td><div class="cell-patient"><span class="avatar">' + initials(p.name) + '</span><div><strong>' + escapeHtml(p.name) + '</strong><small>' + (sub || '&nbsp;') + '</small></div></div></td>' +
        '<td>' + p.count + '</td><td>' + fmtDate(p.last) + '</td></tr>';
    }).join('') : '<tr><td colspan="3"><div class="empty">Aún no tiene pacientes con estudios.</div></td></tr>';
  }

  search.addEventListener('input', render);
  mod.addEventListener('change', render);
  grid.addEventListener('click', async (e) => {
    const find = (attr) => { const b = e.target.closest('[' + attr + ']'); return b && mine.find((s) => s.id === b.getAttribute(attr)); };
    const f = find('data-files'); if (f) openFiles(f);
    const v = find('data-view');
    if (v) {
      openStudy(v);
      if (v.status === 'Nuevo') {
        try { await backend.markSeen(v.id); v.status = 'Visto'; render(); } catch (ex) { /* no crítico */ }
      }
    }
  });

  try {
    mine = await backend.listStudies({ doctorId: user.uid });
    patients = patientsOf(mine);
  } catch (e) {
    toast('No se pudieron cargar sus estudios: ' + e.message);
  }
  render();
}

// Pacientes del médico: los de sus estudios, con los datos copiados en cada estudio
// (el más reciente manda), cuántos estudios tiene y la fecha del último.
function patientsOf(studies) {
  const map = new Map();
  for (const s of studies) {
    const p = map.get(s.patientId) || { id: s.patientId, count: 0, last: '' };
    p.count++;
    if (s.date >= p.last) Object.assign(p, { name: s.patientName, code: s.patientCode, age: s.patientAge, last: s.date });
    map.set(s.patientId, p);
  }
  return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
}
