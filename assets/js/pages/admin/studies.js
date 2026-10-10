// Estudios: lista con filtros y búsqueda. Cada estudio pertenece a un paciente
// y a un médico; el médico se puede cambiar aquí y el estudio pasa a su portal.

import { backend } from '../../services/backend.js';
import { escapeHtml, toast } from '../../ui/dom.js';
import { fmtDate, fmtSize } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { initFilesModal, openStudy } from '../study-actions.js';
import { bindTabs, doctorOptions, personCell } from './common.js';

const FILTERS = {
  all: () => true,
  new: (s) => s.status === 'Nuevo',
  nodoctor: (s) => !s.doctorId,
  cbct: (s) => s.modality === 'CBCT'
};

export function createStudies(ctx) {
  const { state } = ctx;
  const body = document.getElementById('studies-body');
  const search = document.getElementById('admin-search');
  const openFiles = initFilesModal();
  let filter = 'all';

  function render() {
    const q = search.value.trim().toLowerCase();
    const rows = state.studies.filter((s) => FILTERS[filter](s) &&
      (!q || [s.patientName, s.patientCode, s.code, ctx.doctorName(s.doctorId), s.modality].join(' ').toLowerCase().includes(q)));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty">' + (state.studies.length ? 'No se encontraron estudios.' : 'Todavía no hay estudios. Cargue el primero abajo.') + '</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map((s) => {
      const id = escapeHtml(s.id);
      const sub = [s.patientCode, s.patientAge ? s.patientAge + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ');
      return '<tr>' +
        '<td>' + personCell(s.patientName, sub) + '</td>' +
        '<td><span class="mono">' + escapeHtml(s.code) + '</span></td>' +
        '<td><span class="badge blue">' + escapeHtml(s.modality) + '</span></td>' +
        '<td>' + fmtDate(s.date) + '</td>' +
        '<td><label class="sr-only" for="sd-' + id + '">Médico del estudio ' + escapeHtml(s.code) + '</label>' +
          '<select class="input select input-sm' + (s.doctorId ? '' : ' warn') + '" id="sd-' + id + '" data-doctor="' + id + '">' + doctorOptions(state.doctors, s.doctorId) + '</select></td>' +
        '<td><span class="mono">' + fmtSize(s.totalSize) + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-btn" type="button" title="Ver" aria-label="Ver estudio" data-view="' + id + '">' + icon('eye') + '</button>' +
          '<button class="icon-btn" type="button" title="Archivos" aria-label="Archivos" data-files="' + id + '">' + icon('download') + '</button>' +
          '<button class="icon-btn" type="button" title="Eliminar" aria-label="Eliminar estudio" data-delete="' + id + '">' + icon('trash') + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  bindTabs('study-tabs', (f) => { filter = f; render(); });
  search.addEventListener('input', render);

  const find = (id) => state.studies.find((s) => s.id === id);
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-view], [data-files], [data-delete]');
    if (!b) return;
    if (b.dataset.view) openStudy(find(b.dataset.view));
    if (b.dataset.files) openFiles(find(b.dataset.files));
    const d = b.dataset.delete && find(b.dataset.delete);
    if (d && confirm('¿Eliminar el estudio ' + d.code + ' de ' + d.patientName + '? Se borrarán también sus archivos.')) {
      try { await backend.deleteStudy(d); toast('Estudio eliminado.'); await ctx.reload(); } catch (ex) { toast('No se pudo eliminar: ' + ex.message); }
    }
  });

  body.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-doctor]');
    if (!sel) return;
    sel.disabled = true;
    try {
      await backend.setStudyDoctor(sel.dataset.doctor, sel.value);
      toast(sel.value ? 'El estudio ahora está en el portal de ' + ctx.doctorName(sel.value) + '.' : 'El estudio quedó sin médico: solo lo ve la clínica.');
      await ctx.reload();
    } catch (ex) { toast('No se pudo cambiar el médico: ' + ex.message); sel.disabled = false; }
  });

  return { render };
}
