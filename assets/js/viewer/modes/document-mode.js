// Informes PDF del estudio. Si el estudio solo tiene documentos, ocupan el
// escenario; si además tiene imágenes, aparecen en la pestaña "Informes".

import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';

function docList(docs) {
  return `<ul class="dv-docs">${docs.map((d, i) => `
    <li><button type="button" data-doc="${i}">${icon('file')}<span>${escapeHtml(d.name)}</span></button>
    <a class="dv-fbtn" href="${d.url}" download="${escapeHtml(d.name)}" title="Descargar">${icon('download')}</a></li>`).join('')}</ul>`;
}

function viewerFrame(doc) {
  return `<iframe class="dv-pdf" src="${doc.url}#view=FitH" title="${escapeHtml(doc.name)}"></iframe>`;
}

// Estudio con solo informes.
export function startDocumentMode(shell, { study, data }) {
  const docs = data.documents;
  shell.setModeLabel('Informe');
  shell.setTools([]);
  // Sin barra de herramientas ni exportación de imagen: el PDF tiene sus propios controles.
  shell.root.classList.add('dv-no-tools');
  shell.root.querySelectorAll('[data-action="export"], [data-action="print"]').forEach((b) => { b.hidden = true; });
  const wrap = document.createElement('div');
  wrap.className = 'dv-docwrap';
  wrap.innerHTML = viewerFrame(docs[0]);
  shell.stage.appendChild(wrap);
  const tab = shell.addTab('docs', 'Informes', 'file');
  tab.innerHTML = docList(docs);
  tab.addEventListener('click', (e) => {
    const b = e.target.closest('[data-doc]');
    if (b) wrap.innerHTML = viewerFrame(docs[Number(b.dataset.doc)]);
  });
  shell.setHint(study.description || '');
}

// Pestaña de informes junto a las imágenes.
export function addDocumentsTab(shell, docs) {
  if (!docs.length) return;
  const tab = shell.addTab('docs', 'Informes', 'file');
  shell.setTabCount('docs', docs.length);
  tab.innerHTML = docList(docs) + '<p class="dv-muted">Se abren en una ventana sobre el visor.</p>';
  tab.addEventListener('click', (e) => {
    const b = e.target.closest('[data-doc]');
    if (!b) return;
    const doc = docs[Number(b.dataset.doc)];
    const layer = document.createElement('div');
    layer.className = 'dv-doclayer';
    layer.innerHTML = `<div class="dv-doclayer-head"><strong>${escapeHtml(doc.name)}</strong><button type="button" class="dv-fbtn" aria-label="Cerrar">${icon('x')}</button></div>${viewerFrame(doc)}`;
    layer.querySelector('button').addEventListener('click', () => layer.remove());
    shell.root.appendChild(layer);
  });
}
