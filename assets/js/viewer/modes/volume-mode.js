// Modo tomografía (CBCT). Dos distribuciones:
//
//   MPR        tres planos enlazados por una cruz de navegación (axial, coronal,
//              sagital) y un cuarto panel con tres vistas:
//                3D           superficie ósea, piel o proyección tipo radiografía
//                Panorámica   reconstruida a partir de una curva trazada sobre el arco
//                Transversal  un corte perpendicular a esa curva
//   Implantes  la distribución clásica de planificación: axial con la curva,
//              panorámica reconstruida y una tira de cortes transversales
//              consecutivos (separación elegible) alrededor de la zona elegida.

import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { formatDicomDate, formatPersonName } from '../data/dicom-parser.js';
import { crossSection, getSlice, reconstructPanoramic, samplePath, sliceCount, viewToVoxel, voxelToView } from '../data/volume.js';
import { renderInfo } from '../core/info-panel.js';
import { Viewport } from '../core/viewport.js';
import { Volume3DView } from '../core/volume-view3d.js';
import { Workspace } from '../core/workspace.js';

// Colores de cada plano (la línea de un plano tiene su color en los otros paneles).
const PLANE = {
  axial: { label: 'Axial', color: '#3fb4e3', orientation: { top: 'A', bottom: 'P', left: 'R', right: 'L' } },
  coronal: { label: 'Coronal', color: '#a6d45f', orientation: { top: 'S', bottom: 'I', left: 'R', right: 'L' } },
  sagital: { label: 'Sagital', color: '#e9b04f', orientation: { top: 'S', bottom: 'I', left: 'A', right: 'P' } }
};
const CROSS_ORIENTATION = { top: 'S', bottom: 'I', left: 'Vest', right: 'Ling' };
const CROSS_COLOR = '#c9a0f0';
const STRIP_COUNT = 5;                 // cortes transversales en la tira (impar: el central es el elegido)
const STRIP_GAPS = [0.5, 1, 2, 3];     // separación entre cortes de la tira (mm)
const isWide = () => window.matchMedia('(min-width: 821px)').matches;

export function startVolumeMode(shell, { study, data, onDownload, viewOnly }) {
  const vol = data.volumes[0];
  const ws = new Workspace(shell, { study, profileId: 'cbct', onDownload, viewOnly });
  const grid = document.createElement('div');
  grid.className = 'dv-grid dv-grid-mpr';
  grid.dataset.layout = 4;
  shell.stage.appendChild(grid);

  const pos = { x: Math.floor(vol.nx / 2), y: Math.floor(vol.ny / 2), z: Math.floor(vol.nz / 2) };
  const index = { axial: pos.z, coronal: pos.y, sagital: pos.x };
  let slabMM = 0;
  let wl = { ...vol.wl };
  let invert = vol.invert;
  let showCross = true;
  let maximized = null;
  let focus3D = false;
  let layout = 'mpr';          // 'mpr' | 'implant'
  let quadBeforeImplant = '3d';

  // --- Paneles MPR -----------------------------------------------------------------------
  const mpr = {};
  for (const axis of ['axial', 'coronal', 'sagital']) {
    const el = document.createElement('div');
    el.dataset.plane = axis;
    grid.appendChild(el);
    const p = PLANE[axis];
    const vp = new Viewport(el, { name: axis, label: p.label, accent: p.color, orientation: p.orientation });
    vp.axis = axis;
    vp.frameLabel = () => `${p.label} ${index[axis] + 1}`;
    vp.onScroll = (d) => setIndex(axis, index[axis] + d);
    vp.onCrosshair = (img) => {
      const [x, y, z] = viewToVoxel(vol, axis, index[axis], img.x, img.y);
      setPos(x, y, z, axis);
    };
    vp.onDoubleClick = () => toggleMaximize(el);
    vp.decorators.push(drawCrosshair);
    if (axis === 'axial') { vp.onCurvePoint = addCurvePoint; vp.onCurveFinish = finishCurve; vp.decorators.push(drawCurve); }
    ws.addViewport(vp);
    mpr[axis] = vp;
  }

  // --- Cuarto panel con pestañas ---------------------------------------------------------
  const quad = document.createElement('div');
  quad.className = 'dv-quad';
  quad.innerHTML = `
    <div class="dv-quad-tabs" role="tablist">
      <button type="button" data-q="3d" aria-selected="true">${icon('cube')} 3D</button>
      <button type="button" data-q="pano">${icon('curve')} Panorámica</button>
      <button type="button" data-q="cross">${icon('layers')} Transversal</button>
    </div>
    <div class="dv-quad-body">
      <div class="dv-q" data-q="3d"></div>
      <div class="dv-q" data-q="pano" hidden></div>
      <div class="dv-q" data-q="cross" hidden></div>
      <div class="dv-q-empty" hidden>
        ${icon('curve')}
        <p><strong>Panorámica reconstruida</strong></p>
        <p>Elija <em>Curva panorámica</em> y haga clic a lo largo del arco dental en la vista axial, de un extremo al otro. Termine con doble clic o Enter.</p>
        <button type="button" class="dv-btn primary" data-start-curve>${icon('curve')} Trazar curva</button>
      </div>
    </div>
    <div class="dv-quad-controls"></div>`;
  grid.appendChild(quad);
  const quadControls = quad.querySelector('.dv-quad-controls');
  const emptyCurve = quad.querySelector('.dv-q-empty');
  let quadView = '3d';

  const view3d = new Volume3DView(quad.querySelector('.dv-q[data-q="3d"]'), vol);
  view3d.wl = wl;
  quad.querySelector('.dv-q[data-q="3d"]').addEventListener('pointerdown', () => setFocus3D(true));
  // Un clic en cualquier otro panel devuelve el foco a las imágenes 2D.
  grid.addEventListener('pointerdown', (e) => { if (focus3D && !e.target.closest('.dv-q[data-q="3d"]') && e.target.closest('.dv-pane')) setFocus3D(false); }, true);

  const panoVp = new Viewport(quad.querySelector('.dv-q[data-q="pano"]'), { name: 'pano' });
  panoVp.frameLabel = () => 'Panorámica';
  panoVp.onCrosshair = (img) => setCrossIndex(img.x, img.y);
  panoVp.decorators.push(drawPanoMarker, drawAxialLevel);
  panoVp.onDoubleClick = () => toggleMaximize(quad);
  ws.addViewport(panoVp);

  const crossVp = new Viewport(quad.querySelector('.dv-q[data-q="cross"]'), { name: 'cross', orientation: CROSS_ORIENTATION });
  crossVp.frameLabel = () => `Transversal ${mmAt(crossIndex)}`;
  crossVp.onScroll = (d) => setCrossIndex(crossIndex + d * crossStep());
  crossVp.onCrosshair = (img) => setCrossIndex(crossIndex, img.y);
  crossVp.onDoubleClick = () => toggleMaximize(quad);
  crossVp.decorators.push(drawAxialLevel);
  ws.addViewport(crossVp);

  // --- Tira de cortes transversales (distribución Implantes) ---------------------------
  const strip = document.createElement('div');
  strip.className = 'dv-strip';
  strip.innerHTML = `<div class="dv-strip-empty">${icon('layers')}<p>Los cortes transversales aparecerán aquí al trazar la curva panorámica.</p></div>`;
  grid.appendChild(strip);
  const stripVps = [];
  // Zoom y desplazamiento iguales en todos los cortes de la tira.
  const syncStripView = (src) => {
    for (const v of stripVps) if (v !== src && v.frame) { v.view = { ...src.view }; v.render(); }
  };
  for (let k = 0; k < STRIP_COUNT; k++) {
    const el = document.createElement('div');
    strip.appendChild(el);
    const vp = new Viewport(el, { name: 'strip' + k, orientation: CROSS_ORIENTATION });
    vp.stripOffset = k - (STRIP_COUNT >> 1);
    vp.crossIdx = null;
    vp.showWindowInfo = false;
    vp.frameLabel = () => (vp.crossIdx === null ? '' : `Transversal ${mmAt(vp.crossIdx)}`);
    vp.onScroll = (d) => setCrossIndex(crossIndex + d * gapStep());
    // Clic con Navegar: un corte lateral pasa a ser el central; arrastrar mueve el nivel axial.
    vp.onCrosshair = (img, first) => {
      if (vp.crossIdx === null) return;
      setCrossIndex(first ? vp.crossIdx : crossIndex, img.y);
    };
    vp.onDoubleClick = () => toggleMaximize(strip);
    vp.decorators.push(drawAxialLevel);
    for (const fn of ['zoomAt', 'panBy', 'flip', 'rotate']) {
      const orig = vp[fn].bind(vp);
      vp[fn] = (...args) => { orig(...args); syncStripView(vp); };
    }
    ws.addViewport(vp);
    stripVps.push(vp);
  }

  quad.querySelector('.dv-quad-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) setQuadView(b.dataset.q);
  });
  quad.querySelector('[data-start-curve]').addEventListener('click', () => { ws.setTool('curve'); ws.setActive(mpr.axial); });

  function setQuadView(q) {
    if (layout === 'implant') q = 'pano';
    quadView = q;
    quad.querySelectorAll('.dv-quad-tabs [data-q]').forEach((b) => b.setAttribute('aria-selected', b.dataset.q === q ? 'true' : 'false'));
    const needsCurve = (q === 'pano' || q === 'cross') && !curve.pano;
    quad.querySelectorAll('.dv-q').forEach((el) => { el.hidden = el.dataset.q !== q || needsCurve; });
    emptyCurve.hidden = !needsCurve;
    renderQuadControls();
    if (q === '3d') { view3d.render(false); setFocus3D(true); }
    else if (!needsCurve) {
      const vp = q === 'pano' ? panoVp : crossVp;
      requestAnimationFrame(() => { vp.needsFit = vp.needsFit || !vp._shown; vp._shown = true; vp.fitIfNeeded(); vp.render(); });
      ws.setActive(vp);
      setFocus3D(false);
    }
  }

  function setFocus3D(on) {
    focus3D = on;
    quad.classList.toggle('active', on);
    if (on) ws.viewports.forEach((v) => v.el.classList.remove('active'));
    else if (ws.active) ws.active.el.classList.add('active');
  }

  function renderQuadControls() {
    if (quadView === '3d') {
      const s = view3d.state;
      const thr = view3d.renderer ? view3d.state.threshold : null;
      quadControls.innerHTML = `
        <div class="dv-seg">${[['bone', 'Hueso'], ['skin', 'Piel'], ['mip', 'Rayos X']].map(([m, l]) => `<button type="button" class="dv-chipbtn ${s.mode === m ? 'active' : ''}" data-mode3d="${m}">${l}</button>`).join('')}</div>
        <div class="dv-seg">${[['front', 'Frente'], ['left', 'Lateral'], ['top', 'Superior']].map(([v, l]) => `<button type="button" class="dv-chipbtn" data-view3d="${v}">${l}</button>`).join('')}</div>
        ${s.mode !== 'mip' ? `<label class="dv-mini-range" title="Umbral de la superficie">Umbral <input type="range" min="${vol.min}" max="${vol.max}" value="${thr ?? 0}" data-thr></label>` : ''}`;
    } else if (quadView === 'pano' && curve.pano) {
      quadControls.innerHTML = `
        <label class="dv-mini-range" title="Grosor de la capa reconstruida">Grosor <input type="range" min="2" max="30" step="1" value="${curve.thickness}" data-thick><output>${curve.thickness} mm</output></label>
        <div class="dv-seg">${[['avg', 'Radiografía'], ['mip', 'MIP']].map(([m, l]) => `<button type="button" class="dv-chipbtn ${curve.mode === m ? 'active' : ''}" data-pmode="${m}">${l}</button>`).join('')}</div>
        ${layout === 'implant' ? `<label class="dv-select dv-select-sm" title="Separación entre los cortes transversales de la tira">Cortes cada
          <select data-gap>${STRIP_GAPS.map((g) => `<option value="${g}" ${g === curve.gap ? 'selected' : ''}>${String(g).replace('.', ',')} mm</option>`).join('')}</select></label>` : ''}
        <button type="button" class="dv-chipbtn" data-newcurve>${icon('curve')} Nueva curva</button>`;
    } else if (quadView === 'cross' && curve.pano) {
      quadControls.innerHTML = `
        <button type="button" class="dv-chipbtn" data-cstep="-1">${icon('chevronLeft')} 1 mm</button>
        <span class="dv-cross-pos">${(crossIndex * curve.path.step).toFixed(1)} / ${((curve.path.points.length - 1) * curve.path.step).toFixed(1)} mm</span>
        <button type="button" class="dv-chipbtn" data-cstep="1">1 mm ${icon('chevronRight')}</button>`;
    } else quadControls.innerHTML = '';
  }

  quadControls.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.mode3d) { view3d.setMode(t.dataset.mode3d); renderQuadControls(); }
    if (t.dataset.view3d) view3d.setView(t.dataset.view3d);
    if (t.dataset.pmode) { curve.mode = t.dataset.pmode; rebuildPano(); renderQuadControls(); }
    if (t.dataset.newcurve) { ws.setTool('curve'); ws.setActive(mpr.axial); }
    if (t.dataset.cstep) setCrossIndex(crossIndex + Number(t.dataset.cstep) * crossStep());
  });
  quadControls.addEventListener('change', (e) => {
    if (e.target.dataset.gap === undefined) return;
    curve.gap = Number(e.target.value);
    updateStrip();
    panoVp.render();
    mpr.axial.render();
  });
  quadControls.addEventListener('input', (e) => {
    if (e.target.dataset.thr !== undefined) view3d.setThreshold(Number(e.target.value));
    if (e.target.dataset.thick !== undefined) {
      curve.thickness = Number(e.target.value);
      e.target.nextElementSibling.textContent = curve.thickness + ' mm';
      clearTimeout(curve._t);
      curve._t = setTimeout(rebuildPano, 120);
    }
  });

  // --- Cortes y cruz ------------------------------------------------------------------
  function slabSlices(axis) {
    if (!slabMM) return 1;
    const sp = axis === 'axial' ? vol.spacing[2] : axis === 'coronal' ? vol.spacing[1] : vol.spacing[0];
    return Math.max(1, Math.round(slabMM / sp));
  }

  function updatePlane(axis) {
    const vp = mpr[axis];
    const frame = getSlice(vol, axis, index[axis], slabSlices(axis), 'mip');
    vp.setFrame(frame, { keepWindow: true });
    vp.wl = { ...wl };
    vp.invert = invert;
    vp.imageDirty = true;
    const ds = vol.meta.dataset;
    vp.info.tl = axis === 'axial' ? [escapeHtml(formatPersonName(ds && ds.string('00100010')) || study.patientName || '')] : [];
    vp.info.tr = axis === 'axial' && ds ? [formatDicomDate(ds.string('00080020'))] : [];
    vp.info.br = [`${PLANE[axis].label} ${index[axis] + 1} / ${sliceCount(vol, axis)}`, slabMM ? `Espesor ${slabMM} mm (MIP)` : ''];
    vp.render();
  }

  function setIndex(axis, i) {
    const n = sliceCount(vol, axis);
    i = Math.max(0, Math.min(n - 1, Math.round(i)));
    if (i === index[axis]) return;
    index[axis] = i;
    if (axis === 'axial') pos.z = i;
    else if (axis === 'coronal') pos.y = i;
    else pos.x = i;
    updatePlane(axis);
    Object.values(mpr).forEach((v) => v.render());
    if (axis === 'axial') renderPlanning();
    if (ws.active === mpr[axis]) syncSlider();
  }

  function setPos(x, y, z, from) {
    x = Math.max(0, Math.min(vol.nx - 1, Math.round(x)));
    y = Math.max(0, Math.min(vol.ny - 1, Math.round(y)));
    z = Math.max(0, Math.min(vol.nz - 1, Math.round(z)));
    Object.assign(pos, { x, y, z });
    const next = { axial: z, coronal: y, sagital: x };
    for (const axis of Object.keys(mpr)) {
      if (axis !== from && next[axis] !== index[axis]) { index[axis] = next[axis]; updatePlane(axis); }
    }
    Object.values(mpr).forEach((v) => v.render());
    renderPlanning();
    syncSlider();
  }

  // Paneles que muestran el nivel del corte axial (panorámica y transversales).
  function renderPlanning() {
    if (!curve.pano) return;
    panoVp.render();
    crossVp.render();
    stripVps.forEach((v) => v.render());
  }

  // Dibuja en cada plano las líneas de los otros dos planos.
  function drawCrosshair(ctx, vp) {
    if (!showCross || !vp.axis) return;
    const { u, v } = voxelToView(vol, vp.axis, pos.x, pos.y, pos.z);
    const others = { axial: ['sagital', 'coronal'], coronal: ['sagital', 'axial'], sagital: ['coronal', 'axial'] }[vp.axis];
    const f = vp.frame;
    const line = (a, b, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();
    };
    // Línea vertical (u constante) = primer plano; horizontal (v constante) = segundo.
    line(vp.imageToScreen(u + 0.5, 0), vp.imageToScreen(u + 0.5, f.height), PLANE[others[0]].color);
    line(vp.imageToScreen(0, v + 0.5), vp.imageToScreen(f.width, v + 0.5), PLANE[others[1]].color);
    const c = vp.imageToScreen(u + 0.5, v + 0.5);
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // --- Curva panorámica ----------------------------------------------------------------
  // id: aumenta con cada curva nueva; forma parte de la clave de la panorámica y de
  // los cortes, para que las mediciones no pasen de una curva a otra.
  const curve = { id: 0, draft: [], points: null, path: null, pano: null, thickness: 14, mode: 'avg', gap: 1 };
  let crossIndex = 0;
  const crossStep = () => (curve.path ? Math.max(1, Math.round(1 / curve.path.step)) : 1);
  const gapStep = () => (curve.path ? Math.max(1, Math.round(curve.gap / curve.path.step)) : 1);
  const mmAt = (i) => (curve.path ? (i * curve.path.step).toFixed(1) : '0.0') + ' mm';

  function addCurvePoint(img) {
    curve.draft.push([img.x, img.y]);
    shell.setHint(`Punto ${curve.draft.length}. Siga el arco dental; doble clic o Enter para terminar (mínimo 3 puntos). Esc cancela.`);
    mpr.axial.render();
  }

  function finishCurve() {
    // El doble clic agrega dos puntos casi iguales: se quitan los duplicados.
    const pts = curve.draft.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 2);
    if (pts.length < 3) { shell.toast('Marque al menos 3 puntos sobre el arco dental.'); return; }
    curve.id++;
    curve.points = pts;
    curve.draft = [];
    rebuildPano();
    crossIndex = Math.floor(curve.path.points.length / 2);
    updateCross();
    ws.setTool('crosshair');
    // En pantallas amplias se pasa a la distribución de implantes.
    if (layout !== 'implant' && isWide()) setLayout('implant');
    else { setQuadView('pano'); updateStrip(); }
    shell.toast('Panorámica reconstruida. Haga clic en ella para elegir la zona de los cortes transversales.');
  }

  function rebuildPano() {
    if (!curve.points) return;
    const { frame, path } = reconstructPanoramic(vol, curve.points, { thickness: curve.thickness, mode: curve.mode, key: 'pano' + curve.id });
    curve.pano = frame;
    curve.path = path;
    const first = !panoVp.frame;
    panoVp.setFrame(frame, { keepWindow: !first, resetView: first });
    panoVp.wl = { ...wl };
    panoVp.invert = invert;
    panoVp.imageDirty = true;
    panoVp.info.tl = ['Panorámica reconstruida'];
    panoVp.info.br = [`Capa ${curve.thickness} mm · ${curve.mode === 'mip' ? 'MIP' : 'Promedio'}`];
    panoVp.render();
    mpr.axial.render();
  }

  function setCrossIndex(i, row) {
    if (!curve.path) return;
    crossIndex = Math.max(0, Math.min(curve.path.points.length - 1, Math.round(i)));
    if (row !== undefined) setPos(pos.x, pos.y, vol.nz - 1 - row);
    updateCross();
    updateStrip();
    if (quadView === 'cross') renderQuadControls();
    if (ws.active === crossVp || stripVps.includes(ws.active)) syncSlider();
  }

  const crossFrame = (i) => crossSection(vol, curve.path, i, { halfWidth: 15, keyPrefix: 'cross' + curve.id });

  function updateCross() {
    const frame = crossFrame(crossIndex);
    const first = !crossVp.frame;
    crossVp.setFrame(frame, { keepWindow: !first, resetView: first });
    crossVp.wl = { ...wl };
    crossVp.invert = invert;
    crossVp.imageDirty = true;
    crossVp.info.tl = ['Corte transversal'];
    crossVp.info.br = [`Posición ${mmAt(crossIndex)}`, 'Ancho 30 mm'];
    crossVp.render();
    panoVp.render();
    mpr.axial.render();
  }

  // Cortes de la tira: el central es crossIndex; los demás, cada curve.gap mm.
  function updateStrip() {
    strip.querySelector('.dv-strip-empty').hidden = !!curve.path;
    if (layout !== 'implant' || !curve.path) return;
    const n = curve.path.points.length;
    for (const vp of stripVps) {
      const i = crossIndex + vp.stripOffset * gapStep();
      if (i < 0 || i >= n) {
        vp.crossIdx = null;
        vp.setLabel('—', '#55606b');
        vp.setFrame(null);
        continue;
      }
      vp.crossIdx = i;
      const first = !vp.frame;
      vp.setFrame(crossFrame(i), { keepWindow: !first, resetView: first });
      if (first) { const ref = stripVps.find((v) => v !== vp && v.frame && v._shown); if (ref) vp.view = { ...ref.view }; }
      vp._shown = true;
      vp.wl = { ...wl };
      vp.invert = invert;
      vp.imageDirty = true;
      vp.setLabel(mmAt(i), vp.stripOffset === 0 ? '#ffffff' : CROSS_COLOR);
      vp.el.classList.toggle('dv-strip-center', vp.stripOffset === 0);
      vp.render();
    }
  }

  // Posiciones de la tira (o solo la del corte activo) sobre la curva.
  function crossMarks() {
    if (!curve.path) return [];
    if (layout !== 'implant') return [{ i: crossIndex, center: true }];
    return stripVps.filter((v) => v.crossIdx !== null).map((v) => ({ i: v.crossIdx, center: v.stripOffset === 0 }));
  }

  // Línea del nivel del corte axial sobre la panorámica y los transversales.
  function drawAxialLevel(ctx, vp) {
    if (!showCross || !vp.frame) return;
    const row = vol.nz - 1 - pos.z + 0.5;
    const a = vp.imageToScreen(0, row);
    const b = vp.imageToScreen(vp.frame.width, row);
    ctx.save();
    ctx.strokeStyle = PLANE.axial.color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }

  function drawCurve(ctx, vp) {
    const pts = curve.draft.length ? curve.draft : curve.points;
    if (!pts || !pts.length) return;
    const [sx, sy] = vol.spacing;
    ctx.save();
    // Trazo suavizado
    if (pts.length > 1) {
      const path = samplePath(pts.map(([x, y]) => [x * sx, y * sy]), Math.min(sx, sy) * 2);
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 4;
      const trace = () => { ctx.beginPath(); path.points.forEach(([x, y], i) => { const s = vp.imageToScreen(x / sx, y / sy); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }); };
      trace(); ctx.stroke();
      ctx.strokeStyle = '#e9b04f';
      ctx.lineWidth = 2;
      trace(); ctx.stroke();
    }
    for (const [x, y] of pts) {
      const s = vp.imageToScreen(x, y);
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#0f1419'; ctx.fill();
      ctx.strokeStyle = '#e9b04f'; ctx.lineWidth = 2; ctx.stroke();
    }
    // Posición de los cortes transversales
    if (!curve.draft.length && curve.path) {
      for (const { i, center } of crossMarks()) {
        const [px, py] = curve.path.points[i];
        const [nx, ny] = curve.path.normals[i];
        const a = vp.imageToScreen((px - nx * 15) / sx, (py - ny * 15) / sy);
        const b = vp.imageToScreen((px + nx * 15) / sx, (py + ny * 15) / sy);
        ctx.strokeStyle = center ? '#ffffff' : CROSS_COLOR;
        ctx.globalAlpha = center ? 1 : 0.8;
        ctx.setLineDash(center ? [5, 4] : [3, 4]);
        ctx.lineWidth = center ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Cada columna de la panorámica es un punto de la curva: columna = índice del corte.
  function drawPanoMarker(ctx, vp) {
    if (!curve.path || !vp.frame) return;
    ctx.save();
    for (const { i, center } of crossMarks()) {
      const a = vp.imageToScreen(i + 0.5, 0);
      const b = vp.imageToScreen(i + 0.5, vp.frame.height);
      ctx.strokeStyle = center ? 'rgba(255,255,255,.9)' : CROSS_COLOR;
      ctx.globalAlpha = center ? 1 : 0.75;
      ctx.setLineDash(center ? [6, 5] : [3, 5]);
      ctx.lineWidth = center ? 1.25 : 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  // --- Ventana compartida -------------------------------------------------------------
  ws.windowTarget = () => vol;
  ws.onWindow = (src, w, inv) => {
    wl = { ...w };
    invert = inv;
    for (const vp of ws.viewports) {
      if (vp === src || !vp.frame) continue;
      vp.wl = { ...wl };
      vp.invert = invert;
      vp.imageDirty = true;
      vp.render();
    }
    view3d.wl = wl;
    if (view3d.state.mode === 'mip') view3d.render(false);
  };

  // --- Pie: espesor y vista móvil ------------------------------------------------------
  const extra = document.createElement('div');
  extra.className = 'dv-extra-group';
  extra.innerHTML = `
    <div class="dv-seg dv-layout-seg" role="group" aria-label="Distribución">
      <button type="button" class="dv-chipbtn active" data-layout="mpr" title="Axial, coronal, sagital y 3D">${icon('layout4')} MPR</button>
      <button type="button" class="dv-chipbtn" data-layout="implant" title="Panorámica y cortes transversales para planificar implantes">${icon('implant')} Implantes</button>
    </div>
    <label class="dv-select" title="Espesor de corte (proyección de máxima intensidad)">
      ${icon('layers')}
      <select data-slab>
        <option value="0">Corte fino</option>
        <option value="2">Espesor 2 mm</option>
        <option value="5">Espesor 5 mm</option>
        <option value="10">Espesor 10 mm</option>
        <option value="20">Espesor 20 mm</option>
      </select>
    </label>
    <button type="button" class="dv-fbtn on" data-cross title="Mostrar u ocultar la cruz de navegación">${icon('crosshair')}</button>
    <div class="dv-seg dv-mobile-views">${['axial', 'coronal', 'sagital', 'quad'].map((v) => `<button type="button" class="dv-chipbtn" data-mview="${v}">${v === 'quad' ? '3D' : PLANE[v].label}</button>`).join('')}</div>`;
  extra.querySelector('[data-slab]').addEventListener('change', (e) => {
    slabMM = Number(e.target.value);
    Object.keys(mpr).forEach(updatePlane);
  });
  extra.querySelector('[data-cross]').addEventListener('click', (e) => {
    showCross = !showCross;
    e.currentTarget.classList.toggle('on', showCross);
    Object.values(mpr).forEach((v) => v.render());
    renderPlanning();
  });
  extra.querySelector('.dv-layout-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-layout]');
    if (b) setLayout(b.dataset.layout);
  });
  extra.querySelector('.dv-mobile-views').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mview]');
    if (!b) return;
    toggleMaximize(b.dataset.mview === 'quad' ? quad : mpr[b.dataset.mview].el, true);
  });
  shell.setExtraControls(extra);

  function toggleMaximize(el, force) {
    maximized = force ? el : (maximized === el ? null : el);
    grid.classList.toggle('dv-has-max', !!maximized);
    [...grid.children].forEach((c) => c.classList.toggle('dv-max', c === maximized));
    extra.querySelectorAll('[data-mview]').forEach((b) => {
      const target = b.dataset.mview === 'quad' ? quad : mpr[b.dataset.mview].el;
      b.classList.toggle('active', target === maximized);
    });
    requestAnimationFrame(() => {
      ws.viewports.forEach((v) => { v.needsFit = true; v.fitIfNeeded(); v.render(); });
      view3d.render(false);
    });
  }
  // En pantallas angostas se muestra un panel a la vez.
  if (!isWide()) toggleMaximize(mpr.axial.el, true);

  function setLayout(next) {
    if (next === layout) return;
    if (maximized) toggleMaximize(maximized);
    layout = next;
    grid.dataset.layout = next === 'implant' ? 'implant' : 4;
    extra.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('active', b.dataset.layout === next));
    if (next === 'implant') {
      quadBeforeImplant = quadView;
      setQuadView('pano');
      updateStrip();
      if (!curve.pano) {
        ws.setTool('curve');
        shell.toast('Trace la curva del arco en la vista axial: clic a lo largo del arco y doble clic o Enter para terminar.');
      } else ws.setActive(stripVps[STRIP_COUNT >> 1]);
    } else {
      if (stripVps.includes(ws.active)) ws.setActive(mpr.axial);
      setQuadView(quadBeforeImplant);
    }
    mpr.axial.render();
    requestAnimationFrame(() => {
      ws.viewports.forEach((v) => { v.needsFit = true; v.fitIfNeeded(); v.render(); });
      view3d.render(false);
    });
  }

  // --- Control de cortes (pie) -------------------------------------------------------
  function syncSlider() {
    const vp = ws.active;
    if (vp && vp.axis) {
      const n = sliceCount(vol, vp.axis);
      shell.setSlider({ value: index[vp.axis], max: n - 1, label: `${PLANE[vp.axis].label} ${index[vp.axis] + 1} / ${n}`, onInput: (v) => setIndex(vp.axis, v) });
    } else if ((vp === crossVp || stripVps.includes(vp)) && curve.path) {
      shell.setSlider({ value: crossIndex, max: curve.path.points.length - 1, label: `Transversal ${mmAt(crossIndex)}`, onInput: (v) => setCrossIndex(v) });
    } else shell.setSlider(null);
  }

  // --- Ganchos ----------------------------------------------------------------------------
  ws.onActiveChange = () => { setFocus3D(false); syncSlider(); };
  ws.onToolChange = (id) => {
    if (id === 'curve') {
      curve.draft = [];
      ws.setActive(mpr.axial);
      if (maximized && maximized !== mpr.axial.el) toggleMaximize(mpr.axial.el, true);
    } else if (curve.draft.length) { curve.draft = []; mpr.axial.render(); }
  };
  ws.onCancel = () => {
    if (curve.draft.length) { curve.draft = []; mpr.axial.render(); shell.setHint('Curva cancelada.'); return true; }
    if (maximized) { toggleMaximize(maximized); return true; }
    return false;
  };
  ws.onAction = (id) => {
    if (id === 'enter' && curve.draft.length) { finishCurve(); return true; }
    if (id === 'invert') {
      invert = !invert;
      ws.onWindow(null, wl, invert);
      ws.viewports.forEach((v) => { v.invert = invert; v.imageDirty = true; v.render(); });
      shell.setActionState('invert', invert);
      return true;
    }
    if (id === 'reset' && ws.active) {
      wl = { ...vol.wl };
      invert = vol.invert;
      ws.viewports.forEach((v) => { if (v.frame) { v.view = { scale: 1, tx: 0, ty: 0, rot: 0, flipH: false, flipV: false }; v.needsFit = true; v.fitIfNeeded(); } });
      ws.onWindow(null, wl, invert);
      ws.viewports.forEach((v) => { v.wl = { ...wl }; v.invert = invert; v.imageDirty = true; v.render(); });
      shell.setActionState('invert', invert);
      ws.refreshPresets();
      return true;
    }
    return false;
  };
  // Claves de frame: '<volumen>:<plano>:<corte>', 'cross<curva>:<posición>' o 'pano<curva>'.
  ws.goTo = (a) => {
    const parts = a.key.split(':');
    if (mpr[parts[1]]) { setIndex(parts[1], Number(parts[2])); ws.setActive(mpr[parts[1]]); return; }
    const m = /^(cross|pano)(\d+)$/.exec(parts[0]);
    if (!m) return;
    if (Number(m[2]) !== curve.id) { shell.toast('Esa medición se hizo sobre una curva panorámica anterior.'); return; }
    if (m[1] === 'pano') { setQuadView('pano'); ws.setActive(panoVp); return; }
    if (layout === 'implant') { setCrossIndex(Number(parts[1])); ws.setActive(stripVps[STRIP_COUNT >> 1]); }
    else { setQuadView('cross'); setCrossIndex(Number(parts[1])); }
  };

  // --- Información ------------------------------------------------------------------------
  const [sx, sy, sz] = vol.spacing;
  // Solo lectura: sin panorámica por curva ni distribución de implantes (son de planificación).
  if (viewOnly) {
    quad.querySelector('.dv-quad-tabs').hidden = true;
    extra.querySelector('.dv-layout-seg').hidden = true;
  }

  renderInfo(ws.infoTab, {
    study,
    allTags: !viewOnly,
    dataset: vol.meta.dataset,
    extra: [
      ['Matriz', `${vol.nx} × ${vol.ny} × ${vol.nz}`],
      ['Vóxel', `${sx.toFixed(3)} × ${sy.toFixed(3)} × ${sz.toFixed(3)} mm`],
      ['Campo de visión', `${(vol.nx * sx).toFixed(0)} × ${(vol.ny * sy).toFixed(0)} × ${(vol.nz * sz).toFixed(0)} mm`],
      ['Unidades', vol.units === 'HU' ? 'Hounsfield (HU) · aproximadas en CBCT' : 'Valores del equipo'],
      vol.meta.downsampled ? ['Nota', 'Resolución reducida para caber en memoria'] : ['', '']
    ]
  });

  // --- Inicio -------------------------------------------------------------------------------
  Object.keys(mpr).forEach(updatePlane);
  ws.setActive(mpr.axial);
  ws.setTool('crosshair');
  syncSlider();
  setQuadView('3d');
  setFocus3D(false);
  ws.setActive(mpr.axial);
  mpr.axial.el.classList.add('active');
  ws.refreshPresets();
  return ws;
}
