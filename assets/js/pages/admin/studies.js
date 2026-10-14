// Exámenes por visita: cada fila es una visita (paciente + médicos + fecha) con
// sus exámenes. Se busca por paciente, médico, código, examen o fecha, y se
// filtra por un día, por servicio y por estado. Al abrir una visita se ve el
// explorador (explorer.js), donde también se cambian sus médicos.

import { groupSearchText, groupStudies, PAY_STATE, searchTerm } from '../../services/groups.js';
import { activeServices, studyServiceId } from '../../services/settings.js';
import { escapeHtml } from '../../ui/dom.js';
import { fmtDate } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { bindTabs, doctorNames, personCell } from './common.js';

const FILTERS = {
  all: () => true,
  nodoctor: (g) => !g.doctorIds.length,
  noreport: (g) => g.missingReports > 0,
  unpaid: (g) => g.payState !== 'paid'
};

export function createStudies(ctx) {
  const { state } = ctx;
  const body = document.getElementById('studies-body');
  const search = document.getElementById('admin-search');
  const dateInput = document.getElementById('admin-date');
  const serviceSel = document.getElementById('admin-service');
  let filter = 'all';
  let groups = [];

  function render() {
    const svc = serviceSel.value;
    serviceSel.innerHTML = '<option value="">Todos los servicios</option>' + activeServices().map((sv) => '<option value="' + escapeHtml(sv.id) + '">' + escapeHtml(sv.label) + '</option>').join('');
    serviceSel.value = svc;
    groups = groupStudies(state.studies);
    const q = searchTerm(search.value);
    const day = dateInput.value;
    const rows = groups.filter((g) => FILTERS[filter](g) && (!day || g.date === day) &&
      (!serviceSel.value || g.studies.some((s) => studyServiceId(s) === serviceSel.value)) &&
      (!q || groupSearchText(g, doctorNames(state.doctors, g.doctorIds, '')).includes(q)));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty">' + (state.studies.length ? 'No se encontraron exámenes.' : 'Todavía no hay exámenes. Cárguelos abajo.') + '</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map((g) => {
      const key = escapeHtml(g.key);
      const sub = [g.patientCode, g.patientAge ? g.patientAge + ' años' : ''].filter(Boolean).map(escapeHtml).join(' · ');
      // Solo cantidades: exámenes (verde) y, si faltan, los que no tienen informe (rojo).
      const n = g.studies.length;
      const exams = '<span class="badge green" title="' + escapeHtml(g.services.join(', ')) + '">' + n + (n === 1 ? ' examen' : ' exámenes') + '</span>' +
        (g.missingReports ? ' <span class="badge red" title="Exámenes sin su informe PDF">' + g.missingReports + ' sin informe</span>' : '');
      return '<tr class="group-row" data-open="' + key + '">' +
        '<td>' + personCell(g.patientName, sub) + '</td>' +
        '<td>' + fmtDate(g.date) + '</td>' +
        '<td>' + (g.doctorIds.length
          ? g.doctorIds.map((id) => '<span class="doc-name">' + escapeHtml(ctx.doctorName(id) || 'Médico eliminado') + '</span>').join('')
          : '<span class="warn-text">Sin médico</span>') + '</td>' +
        '<td><div class="badges">' + exams + '</div></td>' +
        '<td><span class="badge ' + ({ paid: 'green', partial: 'amber', unpaid: 'gray' })[g.payState] + '">' + PAY_STATE[g.payState] + '</span></td>' +
        '<td><div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-open="' + key + '">' + icon('folder') + ' Abrir visita</button></div></td>' +
      '</tr>';
    }).join('');
  }

  bindTabs('study-tabs', (f) => { filter = f; render(); });
  search.addEventListener('input', render);
  dateInput.addEventListener('change', render);
  serviceSel.addEventListener('change', render);

  // Clic en la fila abre la visita.
  body.addEventListener('click', (e) => {
    const row = e.target.closest('[data-open]');
    if (row) ctx.explorer.openGroup(row.dataset.open);
  });

  return { render };
}
