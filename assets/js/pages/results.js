// Resultados para pacientes (resultados.html?t=…): el paciente abre el enlace
// que recibe por correo, ve los datos de su estudio, lo abre en el visor de
// solo lectura y descarga los archivos.
//
// El acceso está desactivado (config/patient-access.js): mientras lo esté, la
// página solo funciona en modo demostración, con estudios de ejemplo
// (p. ej. resultados.html?demo=1&t=EST-2026-0418).

import { agendaConfig } from '../config/agenda-config.js';
import { patientAccess } from '../config/patient-access.js';
import { examLabel } from '../services/agenda.js';
import { isDemo } from '../services/mode.js';
import { escapeHtml } from '../ui/dom.js';
import { fmtDate } from '../ui/format.js';
import { icon } from '../ui/icons.js';

export async function init() {
  const card = document.getElementById('results');
  const token = new URLSearchParams(location.search).get('t') || '';

  const message = (title, text, ic = 'lock') => {
    card.innerHTML = `
      <span class="results-icon">${icon(ic)}</span>
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${escapeHtml(text)}</p>
      <p class="muted">¿Necesita sus resultados? Llámenos al ${escapeHtml(agendaConfig.clinic.phone)}.</p>
      <a class="btn btn-outline" href="index.html">Ir al inicio</a>`;
  };

  if (!patientAccess.enabled && !isDemo) {
    message('Acceso no disponible', 'La consulta de resultados en línea todavía no está habilitada.');
    return;
  }
  if (!token) {
    message('Enlace incompleto', 'Abra el enlace tal como le llegó en el correo de DentFrucer.', 'link');
    return;
  }

  // El backend se carga solo cuando el acceso está permitido.
  const { backend } = await import('../services/backend.js');
  let shared;
  try {
    shared = await backend.getSharedStudy(token);
  } catch (e) {
    message('No se pudo abrir el estudio', e.message);
    return;
  }

  const { study, files } = shared;
  card.innerHTML = `
    <span class="results-icon ok">${icon('scan')}</span>
    <p class="kicker">Sus resultados</p>
    <h1>${escapeHtml(examLabel(study.modality))}</h1>
    <dl class="results-details">
      <dt>Paciente</dt><dd>${escapeHtml(study.patientName || '')}</dd>
      <dt>Estudio</dt><dd>${escapeHtml(study.description || study.modality)}</dd>
      <dt>Fecha</dt><dd>${fmtDate(study.date)}</dd>
      <dt>Código</dt><dd class="mono">${escapeHtml(study.code || '')}</dd>
    </dl>
    <div class="results-actions">
      <button class="btn btn-primary" type="button" data-open-viewer>${icon('eye')} Ver imágenes</button>
    </div>
    <div class="results-files">
      <h2>Archivos</h2>
      ${files.length
        ? `<ul class="file-list">${files.map((f) => `<li><a href="${escapeHtml(f.url)}" download target="_blank" rel="noopener">${icon('download')} ${escapeHtml(f.name)}</a></li>`).join('')}</ul>`
        : `<p class="muted">${isDemo ? 'En modo demostración no hay archivos para descargar.' : 'Este estudio no tiene archivos para descargar.'}</p>`}
      <p class="hint">Los archivos DICOM se abren con el software de su odontólogo. Para verlos aquí use «Ver imágenes».</p>
    </div>`;
  card.querySelector('[data-open-viewer]').addEventListener('click', async () => {
    const { openViewer } = await import('../viewer/index.js');
    openViewer(study, { backend, isDemo, viewOnly: true, fileUrls: async () => files });
  });
}
