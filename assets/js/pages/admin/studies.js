// Exámenes por visita: cada fila es una visita (paciente + médicos + fecha) con
// sus exámenes. Se busca por paciente, médico, código, examen o fecha, y se
// filtra por un día. Al abrir una visita se ve el explorador (explorer.js), donde
// también se cambian sus médicos.

import { groupSearchText, groupStudies, PAY_STATE, searchTerm } from '../../services/groups.js';
import { escapeHtml } from '../../ui/dom.js';
import { fmtDate, fmtSize } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { bindTabs, doctorNames, personCell } from './common.js';

const FILTERS = {
  all: () => true,
  new: (g) => g.hasNew,
  nodoctor: (g) => !g.doctorIds.length,
  noreport: (g) => g.missingReports > 0,
  unpaid: (g) => g.payState !== 'paid',
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
      (!q || groupSearchText(g, doctorNames(state.doctors, g.doctorIds, '')).includes(q)));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty">' + (state.studies.length ? 'No se encontraron exámenes.' : 'Todavía no hay exámenes. Cárguelos abajo.') + '</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map((g) => {
      const key = escapeHtml(g.key);
      const sub = [g.patientCode, g.patientAge ? g.patientAge + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ');
      const exams = g.modalities.map((m) => '<span class="badge ' + (m === 'Informe' ? 'green' : 'blue') + '">' + escapeHtml(m) + '</span>').join(' ') +
        (g.hasNew ? ' <span class="badge amber" title="El médico aún no abre algún examen">Nuevo</span>' : '') +
        (g.missingReports ? ' <span class="badge gray" title="Exámenes sin su informe PDF">' + g.missingReports + ' sin informe</span>' : '');
      return '<tr class="group-row" data-open="' + key + '">' +
        '<td>' + personCell(g.patientName, sub) + '</td>' +
        '<td>' + fmtDate(g.date) + '</td>' +
        '<td>' + (g.doctorIds.length
          ? g.doctorIds.map((id) => '<span class="doc-name">' + escapeHtml(ctx.doctorName(id) || 'Médico eliminado') + '</span>').join('')
          : '<span class="warn-text">Sin médico</span>') + '</td>' +
        '<td><div class="badges">' + exams + '</div></td>' +
        '<td><span class="mono">' + g.fileCount + ' · ' + fmtSize(g.totalSize) + '</span></td>' +
        '<td><span class="badge ' + ({ paid: 'green', partial: 'amber', unpaid: 'gray' })[g.payState] + '">' + PAY_STATE[g.payState] + '</span></td>' +
        '<td><div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-open="' + key + '">' + icon('folder') + ' Abrir visita</button></div></td>' +
      '</tr>';
    }).join('');
  }

  bindTabs('study-tabs', (f) => { filter = f; render(); });
  search.addEventListener('input', render);
  dateInput.addEventListener('change', render);

  // Clic en la fila abre la visita.
  body.addEventListener('click', (e) => {
    const row = e.target.closest('[data-open]');
    if (row) ctx.explorer.openGroup(row.dataset.open);
  });

  return { render };
}
