// Estudios agrupados: cada fila es un grupo (paciente + médico + fecha) con sus
// exámenes. Se busca por paciente, médico, código, examen o fecha, y se filtra
// por un día. Al abrir un grupo se ve el explorador (explorer.js).

import { backend } from '../../services/backend.js';
import { groupSearchText, groupStudies, searchTerm } from '../../services/groups.js';
import { escapeHtml, toast } from '../../ui/dom.js';
import { fmtDate, fmtSize } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { bindTabs, doctorOptions, personCell } from './common.js';

const FILTERS = {
  all: () => true,
  new: (g) => g.hasNew,
  nodoctor: (g) => !g.doctorId,
  cbct: (g) => g.modalities.includes('CBCT')
};

export function createStudies(ctx) {
  const { state } = ctx;
  const body = document.getElementById('studies-body');
  const search = document.getElementById('admin-search');
  const dateInput = document.getElementById('admin-date');
  let filter = 'all';
  let groups = [];

  function render() {
    groups = groupStudies(state.studies);
    const q = searchTerm(search.value);
    const day = dateInput.value;
    const rows = groups.filter((g) => FILTERS[filter](g) && (!day || g.date === day) &&
      (!q || groupSearchText(g, ctx.doctorName(g.doctorId)).includes(q)));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty">' + (state.studies.length ? 'No se encontraron exámenes.' : 'Todavía no hay exámenes. Cárguelos abajo.') + '</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map((g) => {
      const key = escapeHtml(g.key);
      const sub = [g.patientCode, g.patientAge ? g.patientAge + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ');
      const exams = g.modalities.map((m) => '<span class="badge ' + (m === 'Informe' ? 'green' : 'blue') + '">' + escapeHtml(m) + '</span>').join(' ') +
        (g.hasNew ? ' <span class="badge amber" title="El médico aún no abre algún examen">Nuevo</span>' : '');
      return '<tr class="group-row" data-open="' + key + '">' +
        '<td>' + personCell(g.patientName, sub) + '</td>' +
        '<td>' + fmtDate(g.date) + '</td>' +
        '<td><label class="sr-only" for="gd-' + key + '">Médico del grupo</label>' +
          '<select class="input select input-sm' + (g.doctorId ? '' : ' warn') + '" id="gd-' + key + '" data-doctor="' + key + '">' + doctorOptions(state.doctors, g.doctorId) + '</select></td>' +
        '<td><div class="badges">' + exams + '</div></td>' +
        '<td><span class="mono">' + g.fileCount + ' · ' + fmtSize(g.totalSize) + '</span></td>' +
        '<td><div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-open="' + key + '">' + icon('folder') + ' Abrir</button></div></td>' +
      '</tr>';
    }).join('');
  }

  bindTabs('study-tabs', (f) => { filter = f; render(); });
  search.addEventListener('input', render);
  dateInput.addEventListener('change', render);

  // Clic en la fila (salvo en el selector de médico) abre el grupo.
  body.addEventListener('click', (e) => {
    if (e.target.closest('select, label')) return;
    const row = e.target.closest('[data-open]');
    if (row) ctx.explorer.openGroup(row.dataset.open);
  });

  // El médico del grupo se cambia en todos sus exámenes.
  body.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-doctor]');
    if (!sel) return;
    const g = groups.find((x) => x.key === sel.dataset.doctor);
    sel.disabled = true;
    try {
      await Promise.all(g.studies.map((s) => backend.setStudyDoctor(s.id, sel.value)));
      toast(sel.value ? 'Los exámenes ahora están en el portal de ' + ctx.doctorName(sel.value) + '.' : 'El grupo quedó sin médico: solo lo ve la clínica.');
      await ctx.reload();
    } catch (ex) { toast('No se pudo cambiar el médico: ' + ex.message); sel.disabled = false; }
  });

  return { render };
}
