// Panel "Información": datos del estudio y etiquetas DICOM más relevantes,
// con una lista completa desplegable y un buscador.

import { escapeHtml } from '../../ui/dom.js';
import { formatDicomDate, formatPersonName } from '../data/dicom-parser.js';
import { UID_NAMES } from '../data/dicom-dictionary.js';

const KEY_TAGS = [
  ['00100010', 'Paciente', (v) => formatPersonName(v)],
  ['00100020', 'ID del paciente'],
  ['00100030', 'Nacimiento', formatDicomDate],
  ['00100040', 'Sexo', (v) => ({ M: 'Masculino', F: 'Femenino', O: 'Otro' }[v] || v)],
  ['00080020', 'Fecha del estudio', formatDicomDate],
  ['00080060', 'Modalidad DICOM'],
  ['00081030', 'Descripción'],
  ['0008103e', 'Serie'],
  ['00080070', 'Fabricante'],
  ['00081090', 'Equipo'],
  ['00080080', 'Institución'],
  ['00180060', 'kVp'],
  ['00181151', 'Corriente (mA)'],
  ['00181150', 'Exposición (ms)'],
  ['00180050', 'Grosor de corte (mm)']
];

function rows(list) {
  return list.filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<div class="dv-kv"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
}

// extra: [[etiqueta, valor]] con datos técnicos que calcula el modo (dimensiones, espaciado…)
export function renderInfo(container, { study, dataset, extra = [] }) {
  const studyRows = rows([
    ['Paciente', study.patientName],
    ['Expediente', study.patientCode],
    ['Edad', study.patientAge ? study.patientAge + ' años' : ''],
    ['Estudio', study.description],
    ['Tipo', study.modality],
    ['Fecha', study.date ? new Date(study.date + 'T12:00:00').toLocaleDateString('es') : ''],
    ['Código', study.code]
  ]);
  let dicomRows = '';
  let all = '';
  if (dataset) {
    dicomRows = rows(KEY_TAGS.map(([tag, label, f]) => {
      const v = dataset.string(tag);
      return [label, v && f ? f(v) : v];
    }));
    const ts = dataset.transferSyntax;
    dicomRows += rows([['Codificación', UID_NAMES[ts] || ts]]);
    all = dataset.describe().map((t) => `<tr><td class="mono">${t.tag}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.value)}</td></tr>`).join('');
  }
  container.innerHTML = `
    <section class="dv-sec"><h4>Estudio</h4>${studyRows}</section>
    ${extra.length ? `<section class="dv-sec"><h4>Imagen</h4>${rows(extra)}</section>` : ''}
    ${dicomRows ? `<section class="dv-sec"><h4>Datos DICOM</h4>${dicomRows}</section>` : ''}
    ${all ? `<details class="dv-sec dv-alltags"><summary>Todas las etiquetas DICOM</summary>
      <input class="dv-input dv-tag-search" type="search" placeholder="Buscar etiqueta…">
      <table class="dv-tags"><tbody>${all}</tbody></table></details>` : ''}`;
  const search = container.querySelector('.dv-tag-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      container.querySelectorAll('.dv-tags tr').forEach((tr) => { tr.hidden = q && !tr.textContent.toLowerCase().includes(q); });
    });
  }
}
