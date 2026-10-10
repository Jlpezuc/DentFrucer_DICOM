// Visor de estudios DentFrucer — punto de entrada.
//
//   openViewer(study, { backend, isDemo })
//
// 1. Abre la carcasa del visor (shell.js) con la pantalla de carga.
// 2. Obtiene los archivos del estudio (Firebase) o genera datos de demostración.
// 3. Elige el modo según el contenido y el tipo de examen:
//      volumen (CBCT)     -> modes/volume-mode.js
//      imágenes 2D        -> modes/image-mode.js
//      solo informes PDF  -> modes/document-mode.js
//
// Estructura de la carpeta:
//   data/   lectura de DICOM, imágenes, ZIP y construcción de volúmenes
//   core/   viewport, herramientas, mediciones, render 3D, exportación, perfiles
//   modes/  cada tipo de visor
//   demo/   datos sintéticos para el modo demostración

import { escapeHtml } from '../ui/dom.js';
import { fmtSize } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { DownloadError, loadStudy } from './data/loader.js';
import { pickProfile } from './core/profiles.js';
import { createShell } from './shell.js';
import { startImageMode } from './modes/image-mode.js';
import { startVolumeMode } from './modes/volume-mode.js';
import { addDocumentsTab, startDocumentMode } from './modes/document-mode.js';

let current = null;

export async function openViewer(study, { backend, isDemo }) {
  if (current) current.close();
  const shell = createShell({ study, onClose: () => { current = null; } });
  current = shell;
  let closed = false;
  shell.on('close', () => { closed = true; });

  const files = { list: null };
  const download = async () => {
    try {
      const list = files.list || (await backend.fileUrls(study));
      if (!list.length) { shell.toast('Descarga no disponible en modo demostración.'); return; }
      showDownloads(shell, list);
    } catch (e) { shell.toast('No se pudieron obtener los archivos.'); }
  };

  try {
    let data;
    if (isDemo) {
      shell.setLoading({ title: 'Preparando estudio de demostración', detail: 'Generando imágenes sintéticas…', progress: 0 });
      const { demoStudyData } = await import('./demo/phantom.js');
      data = await demoStudyData(study.modality, (p) => shell.setLoading({ progress: p }));
    } else {
      shell.setLoading({ title: 'Preparando estudio', detail: 'Obteniendo archivos…', progress: null });
      files.list = await backend.fileUrls(study);
      if (!files.list.length) throw new Error('Este estudio no tiene archivos.');
      data = await loadStudy(files.list, (p) => {
        if (closed) return;
        if (p.phase === 'download') shell.setLoading({ detail: `Descargando ${p.done} de ${p.total} archivo(s) · ${fmtSize(p.bytes)}`, progress: p.done / p.total });
        else if (p.phase === 'unzip') shell.setLoading({ detail: 'Descomprimiendo ' + p.name + '…', progress: null });
        else if (p.phase === 'parse') shell.setLoading({ detail: `Leyendo imágenes ${p.done} de ${p.total}…`, progress: p.done / p.total });
        else if (p.phase === 'process') shell.setLoading({ title: 'Reconstruyendo volumen', detail: `Corte ${p.done} de ${p.total}`, progress: p.done / p.total });
      });
    }
    if (closed) return;

    const hasImages = data.volumes.length || data.images.length;
    if (!hasImages && !data.documents.length) {
      throw new Error(data.warnings[0] || 'No se encontraron imágenes que el visor pueda mostrar.');
    }

    shell.hideLoading();
    const ctx = { study, data, onDownload: download };
    if (data.volumes.length) startVolumeMode(shell, ctx);
    else if (data.images.length) startImageMode(shell, { ...ctx, profileId: pickProfile(study.modality, data) });
    else startDocumentMode(shell, ctx);
    if (hasImages) addDocumentsTab(shell, data.documents);
    if (data.warnings.length) {
      setTimeout(() => shell.toast(data.warnings.length === 1 ? data.warnings[0] : `${data.warnings.length} archivo(s) no se pudieron abrir.`), 900);
    }
  } catch (err) {
    if (closed) return;
    console.error(err);
    const isNet = err instanceof DownloadError;
    shell.showError({
      title: isNet ? 'No se pudieron descargar las imágenes' : 'No se pudo abrir el estudio',
      message: err.message,
      actions: [
        { label: 'Descargar archivos', onClick: download },
        { label: 'Cerrar', primary: true, onClick: () => shell.close() }
      ]
    });
  }
}

function showDownloads(shell, list) {
  const layer = document.createElement('div');
  layer.className = 'dv-dialog';
  layer.innerHTML = `<div class="dv-dialog-card">
    <div class="dv-dialog-head"><h3>${icon('download')} Archivos originales</h3><button type="button" class="dv-fbtn" data-x aria-label="Cerrar">${icon('x')}</button></div>
    <p class="dv-muted">Descargue los archivos para abrirlos en el software de planificación de su consultorio.</p>
    <ul class="dv-docs">${list.map((f) => `<li><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" download>${icon('file')}<span>${escapeHtml(f.name)}</span></a></li>`).join('')}</ul>
  </div>`;
  layer.addEventListener('click', (e) => { if (e.target === layer || e.target.closest('[data-x]')) layer.remove(); });
  shell.root.appendChild(layer);
}
