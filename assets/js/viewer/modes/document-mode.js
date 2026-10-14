// Informes PDF del examen. Si el examen solo tiene documentos, ocupan el
// escenario; si además tiene imágenes, aparecen en la pestaña "Informes" y en
// el botón "Informe" del encabezado, que se muestran siempre: sin informe,
// avisan que el examen aún no lo tiene.

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

// Examen con solo informes.
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
  shell.setHint([study.service, study.description].filter(Boolean).join(' · '));
}

// Informes junto a las imágenes: pestaña "Informes" y botón "Informe" del encabezado.
export function addDocumentsTab(shell, docs) {
  const tab = shell.addTab('docs', 'Informes', 'file');
  const button = shell.root.querySelector('[data-action="report"]');
  button.hidden = false;
  if (docs.length) {
    shell.setTabCount('docs', docs.length);
    tab.innerHTML = docList(docs) + '<p class="dv-muted">Se abren en una ventana sobre el visor.</p>';
  } else {
    button.classList.add('dv-missing');
    button.title = 'Este examen aún no tiene informe';
    tab.innerHTML = `<div class="dv-noreport">${icon('file')}<strong>Sin informe</strong><p>Este examen aún no tiene su informe PDF. Cuando DentFrucer lo suba, aparecerá aquí.</p></div>`;
  }

  function open(doc) {
    shell.root.querySelectorAll('.dv-doclayer').forEach((l) => l.remove());
    const layer = document.createElement('div');
    layer.className = 'dv-doclayer';
    layer.innerHTML = `<div class="dv-doclayer-head"><strong>${escapeHtml(doc.name)}</strong><button type="button" class="dv-fbtn" aria-label="Cerrar">${icon('x')}</button></div>${viewerFrame(doc)}`;
    layer.querySelector('button').addEventListener('click', () => layer.remove());
    shell.root.appendChild(layer);
  }
  tab.addEventListener('click', (e) => {
    const b = e.target.closest('[data-doc]');
    if (b) open(docs[Number(b.dataset.doc)]);
  });
  // Un informe: se abre directamente. Varios o ninguno: la pestaña los lista o avisa.
  shell.on('header', (a) => {
    if (a !== 'report') return;
    if (docs.length === 1) { open(docs[0]); return; }
    shell.openPanel();
    shell.showTab('docs');
    if (!docs.length) shell.toast('Este examen aún no tiene informe.');
  });
}
