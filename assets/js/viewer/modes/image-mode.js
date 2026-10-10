// Modo de imágenes 2D: panorámicas, cefalometrías, intraorales y fotografías.
// Uno, dos o cuatro paneles; miniaturas en el panel lateral; la rueda acerca.

import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { renderFrame } from '../data/frame.js';
import { formatDicomDate, formatPersonName } from '../data/dicom-parser.js';
import { renderInfo } from '../core/info-panel.js';
import { Viewport } from '../core/viewport.js';
import { Workspace } from '../core/workspace.js';

const SPACING_TEXT = {
  dicom: 'Escala: calibrada (DICOM)',
  detector: 'Escala: detector (aprox.)',
  calibrated: 'Escala: calibrada manualmente'
};

export function startImageMode(shell, { study, data, profileId, onDownload }) {
  const images = data.images;
  const ws = new Workspace(shell, { study, profileId, onDownload });
  const grid = document.createElement('div');
  grid.className = 'dv-grid';
  shell.stage.appendChild(grid);

  const panes = [];
  let layout = 1;
  let maximized = null;
  const shown = new Map(); // viewport -> índice de imagen

  function createPane() {
    const el = document.createElement('div');
    grid.appendChild(el);
    const vp = new Viewport(el);
    vp.frameLabel = () => (vp.frame ? vp.frame.label || 'Imagen ' + (shown.get(vp) + 1) : '');
    vp.onDoubleClick = () => toggleMaximize(vp);
    ws.addViewport(vp);
    panes.push(vp);
    return vp;
  }

  function overlayInfo(vp, idx) {
    const f = images[idx];
    const ds = f.meta.dataset;
    const name = ds ? formatPersonName(ds.string('00100010')) : '';
    vp.info.tl = [escapeHtml(name || study.patientName || ''), escapeHtml(f.label || '')];
    vp.info.tr = [escapeHtml(ws.profile.title), ds ? formatDicomDate(ds.string('00080020')) : ''];
    vp.info.br = [
      images.length > 1 ? `Imagen ${idx + 1} de ${images.length}` : '',
      `${f.width} × ${f.height}`,
      f.spacing ? SPACING_TEXT[f.spacingSource] || '' : '<span class="dv-warn">Sin escala: medidas en píxeles</span>'
    ];
  }

  function show(vp, idx) {
    idx = Math.max(0, Math.min(images.length - 1, idx));
    shown.set(vp, idx);
    overlayInfo(vp, idx);
    vp.setFrame(images[idx], { resetView: true });
    if (vp === ws.active) syncSlider();
    markThumbs();
  }

  function setLayout(n) {
    layout = Math.min(n, Math.max(1, images.length));
    maximized = null;
    while (panes.length < layout) {
      const vp = createPane();
      // Cada panel nuevo muestra la siguiente imagen aún no visible.
      const used = new Set(shown.values());
      let next = 0;
      while (used.has(next) && next < images.length - 1) next++;
      show(vp, next);
    }
    panes.forEach((vp, i) => { vp.el.hidden = i >= layout; });
    grid.dataset.layout = layout;
    if (!panes.slice(0, layout).includes(ws.active)) ws.setActive(panes[0]);
    layoutButtons.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('active', Number(b.dataset.layout) === layout));
    requestAnimationFrame(() => panes.forEach((vp) => { vp.needsFit = true; vp.fitIfNeeded(); vp.render(); }));
  }

  function toggleMaximize(vp) {
    if (layout === 1) return;
    maximized = maximized === vp ? null : vp;
    panes.slice(0, layout).forEach((p) => { p.el.hidden = maximized && p !== maximized; });
    grid.dataset.layout = maximized ? 1 : layout;
    requestAnimationFrame(() => panes.forEach((p) => { p.needsFit = true; p.fitIfNeeded(); p.render(); }));
  }

  // --- Control de imágenes (pie) ---------------------------------------------------------
  function syncSlider() {
    const vp = ws.active;
    if (images.length < 2 || !vp) { shell.setSlider(null); return; }
    const idx = shown.get(vp) || 0;
    shell.setSlider({
      value: idx,
      max: images.length - 1,
      label: `Imagen ${idx + 1} / ${images.length}`,
      onInput: (v) => show(ws.active, v)
    });
  }

  const layoutButtons = document.createElement('div');
  layoutButtons.className = 'dv-seg';
  if (images.length > 1) {
    layoutButtons.innerHTML = [[1, 'layout1', 'Una imagen'], [2, 'layout2', 'Dos imágenes'], [4, 'layout4', 'Cuatro imágenes']]
      .filter(([n]) => n === 1 || images.length >= n)
      .map(([n, ic, t]) => `<button type="button" class="dv-fbtn" data-layout="${n}" title="${t}">${icon(ic)}</button>`).join('');
    layoutButtons.addEventListener('click', (e) => { const b = e.target.closest('[data-layout]'); if (b) setLayout(Number(b.dataset.layout)); });
    shell.setExtraControls(layoutButtons);
  }

  // --- Miniaturas --------------------------------------------------------------------------
  let thumbsTab = null;
  function markThumbs() {
    if (!thumbsTab) return;
    const active = shown.get(ws.active);
    thumbsTab.querySelectorAll('[data-img]').forEach((el) => {
      const i = Number(el.dataset.img);
      el.classList.toggle('active', i === active);
      el.classList.toggle('visible', [...shown.entries()].some(([vp, k]) => k === i && !vp.el.hidden));
    });
  }
  if (images.length > 1) {
    thumbsTab = shell.addTab('images', 'Imágenes', 'image');
    thumbsTab.innerHTML = `<div class="dv-thumbs">${images.map((f, i) => `
      <button type="button" class="dv-thumb" data-img="${i}"><canvas></canvas><span>${i + 1}. ${escapeHtml(f.label || 'Imagen')}</span></button>`).join('')}</div>`;
    thumbsTab.querySelectorAll('[data-img]').forEach((el) => {
      const f = images[Number(el.dataset.img)];
      const c = el.querySelector('canvas');
      const k = Math.min(1, 220 / Math.max(f.width, f.height));
      const tmp = document.createElement('canvas');
      tmp.width = f.width; tmp.height = f.height;
      const tctx = tmp.getContext('2d');
      tctx.putImageData(renderFrame(f, f.wl, f.invert, tctx.createImageData(f.width, f.height)), 0, 0);
      c.width = Math.max(1, Math.round(f.width * k));
      c.height = Math.max(1, Math.round(f.height * k));
      c.getContext('2d').drawImage(tmp, 0, 0, c.width, c.height);
    });
    thumbsTab.addEventListener('click', (e) => { const b = e.target.closest('[data-img]'); if (b) show(ws.active, Number(b.dataset.img)); });
    shell.showTab('images');
  }

  // --- Ganchos del espacio de trabajo -------------------------------------------------
  ws.onActiveChange = () => { syncSlider(); markThumbs(); };
  ws.findFrame = (key) => images.find((f) => f.key === key);
  ws.goTo = (a) => {
    const idx = images.findIndex((f) => f.key === a.key);
    if (idx < 0) return;
    const vp = panes.find((p) => shown.get(p) === idx && !p.el.hidden) || ws.active;
    ws.setActive(vp);
    if (shown.get(vp) !== idx) show(vp, idx);
  };
  ws.onCalibrated = (vp) => overlayInfo(vp, shown.get(vp));

  const first = images[0];
  renderInfo(ws.infoTab, {
    study,
    dataset: first.meta.dataset,
    extra: [
      ['Imágenes', images.length],
      ['Tamaño', `${first.width} × ${first.height} px`],
      ['Píxel', first.spacing ? `${first.spacing[0].toFixed(3)} × ${first.spacing[1].toFixed(3)} mm` : 'Sin calibrar'],
      ['Escala', { dicom: 'Calibrada (DICOM)', detector: 'Del detector (aproximada)', calibrated: 'Calibrada manualmente' }[first.spacingSource] || 'Sin calibrar: use Calibrar para medir en mm']
    ]
  });

  const defaultLayout = profileId === 'intraoral' && images.length >= 4 ? 4 : profileId === 'intraoral' && images.length >= 2 ? 2 : 1;
  setLayout(defaultLayout);
  ws.setTool(ws.profile.defaultTool);
  ws.refreshPresets();
  if (ws.profile.note) setTimeout(() => shell.toast(ws.profile.note), 600);
  return ws;
}
