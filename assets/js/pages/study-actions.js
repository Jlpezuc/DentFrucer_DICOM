// Acciones sobre un examen compartidas por el portal y el panel de administración:
// abrir el visor y listar los archivos para descargar.

import { backend, isDemo } from '../services/backend.js';
import { studyServiceName } from '../services/settings.js';
import { escapeHtml, modal, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

// Abre el visor (se carga solo cuando se usa por primera vez). El visor recibe
// el nombre vigente del servicio del examen.
// Cada apertura queda en el registro de accesos (backend.logAccess).
export async function openStudy(study) {
  const { openViewer } = await import('../viewer/index.js');
  openViewer({ ...study, service: studyServiceName(study) }, { backend, isDemo });
  backend.logAccess(study, 'ver');
}

export function initFilesModal() {
  const m = modal('files-modal');
  return async (study) => {
    if (isDemo) { toast('Descarga no disponible en modo demostración.'); return; }
    const list = m.el.querySelector('.file-list');
    list.innerHTML = '<li class="muted">Preparando enlaces…</li>';
    m.el.querySelector('.modal-head h3').textContent = 'Archivos · ' + study.patientName;
    m.open();
    try {
      const files = await backend.fileUrls(study);
      backend.logAccess(study, 'descargar');
      list.innerHTML = files.length
        ? files.map((f) => '<li><a href="' + escapeHtml(f.url) + '" target="_blank" rel="noopener" download>' + icon('download') + ' ' + escapeHtml(f.name) + '</a></li>').join('')
        : '<li class="muted">Este examen no tiene archivos.</li>';
    } catch (e) {
      list.innerHTML = '<li class="muted">No se pudieron obtener los archivos.</li>';
    }
  };
}
