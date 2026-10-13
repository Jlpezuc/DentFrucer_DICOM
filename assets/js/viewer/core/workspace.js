// Espacio de trabajo común a todos los modos de imagen: une los viewports con
// la barra de herramientas, las mediciones, el contraste, la calibración,
// la lectura bajo el cursor y la exportación.
//
// Los modos (modes/*.js) crean los viewports, los registran con addViewport()
// y pueden personalizar el comportamiento con estos ganchos:
//   onActiveChange(vp)      el panel activo cambió (actualizar el control de cortes)
//   onAction(id) -> bool    acción de la barra; true si el modo la resolvió
//   onWindow(vp, wl, invert) la ventana cambió (sincronizar otros paneles)
//   goTo(annotation)        navegar hasta el corte/imagen de una medición
//   onCancel() -> bool      Esc: cancelar algo propio del modo
//
// Exportar e imprimir copian lo que se ve en el escenario (todos los paneles
// visibles, con sus textos); para un solo panel, amplíelo con doble clic.
//
// viewOnly (visor de pacientes): solo herramientas para ver (profiles.VIEW_ONLY),
// sin pestaña de mediciones ni etiquetas DICOM completas.

import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { valueAt } from '../data/frame.js';
import { AnnotationStore, IMPLANT_DIAMETERS, IMPLANT_LENGTHS, measure, normalizeImplant, TYPE_NAMES } from './annotations.js';
import { composeExport, downloadCanvas, printCanvas, snapshotStage } from './export.js';
import { applyPreset, PROFILES, VIEW_ONLY, viewOnlyTools, windowPresets } from './profiles.js';
import { ToolController } from './tools.js';

const TYPE_ICONS = { distance: 'ruler', angle: 'angle', roi: 'roi', probe: 'probe', arrow: 'note', implant: 'implant' };

export class Workspace {
  constructor(shell, { study, profileId, onDownload, viewOnly = false }) {
    this.shell = shell;
    this.study = study;
    this.viewOnly = viewOnly;
    this.profile = PROFILES[profileId];
    this.onDownload = onDownload;
    this.viewports = [];
    this.active = null;
    this.store = new AnnotationStore();
    this.controller = new ToolController({
      store: this.store,
      onActivate: (vp) => this.setActive(vp),
      onCursor: (vp, img) => this.showCursor(vp, img),
      prompt: (opts) => shell.prompt(opts),
      onCalibrate: (vp, a) => this.calibrate(vp, a),
      onEditImplant: (vp, a) => this.editImplant(a),
      toast: (text) => shell.toast(text)
    });
    this.showOverlays = true;
    shell.setWindowSliders((brightness, contrast) => this.setBrightnessContrast(brightness, contrast));

    shell.setModeLabel(this.profile.title);
    if (viewOnly) shell.setTools(viewOnlyTools(this.profile.tools), VIEW_ONLY.actions);
    else shell.setTools(this.profile.tools);
    shell.on('tool', (id) => this.setTool(id));
    shell.on('action', (id) => this.action(id));
    shell.on('header', (a) => this.header(a));
    shell.on('cancel', () => {
      const busy = !!(this.controller.op || this.controller.angleDraft);
      this.controller.cancel();
      return busy || (this.onCancel ? this.onCancel() : false);
    });

    this.measureTab = viewOnly ? null : shell.addTab('measure', 'Mediciones', 'ruler');
    this.infoTab = shell.addTab('info', 'Información', 'info');
    this.store.onChange(() => { this.viewports.forEach((v) => v.render()); this.renderMeasurements(); });
    this.renderMeasurements();
    if (viewOnly) return;
    // Las mediciones no se guardan: avisar antes de cerrar el visor.
    shell.setCloseGuard(() => {
      const n = this.store.items.length;
      if (!n) return '';
      return `Hay ${n === 1 ? '1 medición' : n + ' mediciones'} en este examen. Al cerrar el visor se pierden: si las necesita, use Copiar resumen o Exportar antes de cerrar.`;
    });
  }

  // --- Viewports -------------------------------------------------------------------
  addViewport(vp) {
    vp.controller = this.controller;
    vp.annotations = (v) => (v.frame ? this.store.forKey(v.frame.key) : []);
    vp.isSelected = (a) => a.id === this.store.selectedId;
    vp.onChange = (v) => { if (v === this.active) this.syncWindowUI(); };
    vp.showOverlays = this.showOverlays;
    this.viewports.push(vp);
    if (!this.active) this.setActive(vp);
    return vp;
  }

  setActive(vp) {
    if (this.active === vp) return;
    this.active = vp;
    for (const v of this.viewports) v.el.classList.toggle('active', v === vp);
    if (this.onActiveChange) this.onActiveChange(vp);
    this.refreshPresets();
  }

  setTool(id) {
    this.controller.setTool(id);
    this.shell.setActiveTool(id, this.profile.hints && this.profile.hints[id]);
    if (this.onToolChange) this.onToolChange(id);
  }

  // --- Contraste ---------------------------------------------------------------------
  refreshPresets() {
    const vp = this.active;
    const target = this.windowTarget ? this.windowTarget(vp) : vp && vp.frame;
    if (!target) return;
    this.shell.setPresets(windowPresets(target), 'auto', (p) => {
      const wl = applyPreset(p, target);
      this.applyWindow(vp, wl.c, wl.w);
    });
    this.syncWindowSliders();
  }

  // Rango de valores de la imagen (o del volumen) activa, base de los controles.
  windowRange(vp = this.active) {
    const t = vp && ((this.windowTarget && this.windowTarget(vp)) || vp.frame);
    if (!t || t.min === undefined || t.max === undefined) return null;
    return { min: t.min, range: Math.max(1, t.max - t.min) };
  }

  // Controles de 0 a 100. Brillo: 50 = centro del rango; más brillo baja el
  // centro de la ventana. Contraste: 50 = ventana del ancho del rango; cada
  // extremo multiplica o divide el ancho por 8.
  setBrightnessContrast(brightness, contrast) {
    const vp = this.active;
    const r = this.windowRange(vp);
    if (!r) return;
    const c = r.min + (1 - brightness / 100) * r.range;
    const w = r.range * 2 ** ((50 - contrast) / (50 / 3));
    this.applyWindow(vp, c, w);
    this.shell.clearPresetSelection();
  }

  syncWindowSliders() {
    const vp = this.active;
    const r = this.windowRange(vp);
    if (!r || !vp.wl) return;
    const clamp = (v) => Math.round(Math.max(0, Math.min(100, v)));
    this.shell.setWindowSliderValues(
      clamp(100 * (1 - (vp.wl.c - r.min) / r.range)),
      clamp(50 - Math.log2(vp.wl.w / r.range) * (50 / 3))
    );
  }

  applyWindow(vp, c, w, invert = vp.invert) {
    vp.setWindow(c, w);
    if (invert !== vp.invert) vp.setInvert(invert);
    if (this.onWindow) this.onWindow(vp, vp.wl, vp.invert);
  }

  syncWindowUI() {
    if (this.onWindow && this.active) this.onWindow(this.active, this.active.wl, this.active.invert);
    this.shell.setActionState('invert', this.active && this.active.invert);
    this.syncWindowSliders();
  }

  // --- Acciones de la barra ------------------------------------------------------------
  action(id) {
    if (this.onAction && this.onAction(id)) return;
    const vp = this.active;
    switch (id) {
      case 'undo': if (!this.store.undo()) this.shell.toast('No hay nada que deshacer.'); break;
      case 'delete': {
        const sel = this.store.selected();
        if (sel) this.store.remove(sel.id);
        break;
      }
      case 'rotate': vp && vp.rotate(1); break;
      case 'flipH': vp && vp.flip('h'); break;
      case 'flipV': vp && vp.flip('v'); break;
      case 'invert': if (vp) { vp.setInvert(!vp.invert); this.syncWindowUI(); } break;
      case 'fit': vp && vp.fit(); break;
      case 'overlay':
        this.showOverlays = !this.showOverlays;
        this.viewports.forEach((v) => { v.showOverlays = this.showOverlays; v.render(); });
        this.shell.setActionState('overlay', !this.showOverlays);
        this.shell.toast(this.showOverlays ? 'Datos sobre la imagen visibles.' : 'Datos del paciente ocultos (la orientación y la escala se mantienen).');
        break;
      case 'reset': if (vp) { vp.resetView(); this.syncWindowUI(); this.refreshPresets(); } break;
    }
  }

  // --- Lectura bajo el cursor ------------------------------------------------------
  showCursor(vp, img) {
    if (!img || !vp.frame) { this.shell.setCursorInfo(''); return; }
    const f = vp.frame;
    const v = valueAt(f, img.x, img.y);
    if (v === null) { this.shell.setCursorInfo(''); return; }
    const parts = [`x ${Math.floor(img.x)} · y ${Math.floor(img.y)}`];
    parts.push(f.units ? `${Math.round(v)} ${f.units}` : `Valor ${Math.round(v)}`);
    this.shell.setCursorInfo(parts.join('   '));
  }

  // --- Calibración ----------------------------------------------------------------------
  async calibrate(vp, a) {
    const f = vp.frame;
    const [sx, sy] = f.spacing || [1, 1];
    const ratio = sy / sx; // se conserva la proporción de los píxeles
    const dx = a.points[1][0] - a.points[0][0];
    const dy = (a.points[1][1] - a.points[0][1]) * ratio;
    const lenUnits = Math.hypot(dx, dy); // en "píxeles x"
    const current = Math.hypot(dx * sx, dy * sx);
    const value = await this.shell.prompt({
      title: 'Calibrar medidas',
      label: `La línea mide ${f.spacing ? current.toFixed(1) + ' mm según la imagen' : 'sin calibración'}. Indique su longitud real en milímetros:`,
      type: 'number',
      placeholder: 'Ej.: 10'
    });
    const mm = Number(String(value || '').replace(',', '.'));
    if (!(mm > 0)) return;
    const k = mm / lenUnits;
    f.spacing = [k, k * ratio];
    f.spacingSource = 'calibrated';
    vp.needsFit = true;
    vp.fitIfNeeded();
    vp.render();
    this.store.emit();
    this.shell.toast('Imagen calibrada. Las mediciones se actualizaron.');
    if (this.onCalibrated) this.onCalibrated(vp);
  }

  // --- Implantes ------------------------------------------------------------------------
  async editImplant(a) {
    const v = await this.shell.form({
      title: 'Implante',
      label: 'Medidas del implante simulado. Se conserva la posición de la plataforma.',
      fields: [
        { name: 'diameter', label: 'Diámetro (mm)', value: a.diameter, options: IMPLANT_DIAMETERS, step: 0.05, min: 2, max: 8 },
        { name: 'length', label: 'Longitud (mm)', value: a.length, options: IMPLANT_LENGTHS, step: 0.5, min: 4, max: 25 }
      ],
      okLabel: 'Aplicar'
    });
    if (!v || !(v.diameter > 0) || !(v.length > 0)) return;
    this.store.snapshot();
    a.diameter = v.diameter;
    a.length = v.length;
    normalizeImplant(a, this.frameFor(a), 1);
    this.controller.implantSize = { diameter: v.diameter, length: v.length };
    this.store.emit();
  }

  // --- Panel de mediciones --------------------------------------------------------------
  frameFor(a) {
    const vp = this.viewports.find((v) => v.frame && v.frame.key === a.key);
    return vp ? vp.frame : (this.findFrame ? this.findFrame(a.key) : null);
  }

  measurementText(a) {
    const f = this.frameFor(a);
    const m = f ? measure(a, f) : { value: a._lastValue || '', lines: [] };
    a._lastValue = m.value;
    return { name: TYPE_NAMES[a.type], value: m.value, lines: m.lines };
  }

  renderMeasurements() {
    if (!this.measureTab) return;
    const items = this.store.items;
    this.shell.setTabCount('measure', items.length);
    if (!items.length) {
      this.measureTab.innerHTML = `
        <div class="dv-empty-panel">
          ${icon('ruler')}
          <p><strong>Sin mediciones</strong></p>
          <p>Elija Distancia, Ángulo o Área en la barra de herramientas y trace sobre la imagen.</p>
        </div>`;
      return;
    }
    this.measureTab.innerHTML = `
      <ul class="dv-mlist">${items.map((a, i) => {
        const t = this.measurementText(a);
        return `<li class="${a.id === this.store.selectedId ? 'sel' : ''}" data-id="${a.id}">
          <span class="dv-mico">${icon(TYPE_ICONS[a.type])}</span>
          <span class="dv-mtxt"><strong>${i + 1}. ${escapeHtml(t.name)}</strong><small>${escapeHtml(a.frameLabel || '')}</small></span>
          <span class="dv-mval">${escapeHtml(t.value)}${t.lines.map((l) => `<small>${escapeHtml(l)}</small>`).join('')}</span>
          <span class="dv-mbtns">
            ${a.type === 'implant' ? `<button type="button" class="dv-fbtn" data-edit="${a.id}" aria-label="Cambiar medidas" title="Cambiar medidas">${icon('edit')}</button>` : ''}
            <button type="button" class="dv-fbtn" data-del="${a.id}" aria-label="Borrar" title="Borrar">${icon('trash')}</button>
          </span>
        </li>`;
      }).join('')}</ul>
      <div class="dv-mactions">
        <button type="button" class="dv-btn" data-copy>${icon('list')} Copiar resumen</button>
        <button type="button" class="dv-btn" data-clear>${icon('trash')} Borrar todas</button>
      </div>`;
    this.measureTab.onclick = (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { this.store.remove(del.dataset.del); return; }
      const edit = e.target.closest('[data-edit]');
      if (edit) {
        const a = this.store.items.find((x) => x.id === edit.dataset.edit);
        if (a) { this.store.select(a.id); if (this.goTo) this.goTo(a); this.editImplant(a); }
        return;
      }
      if (e.target.closest('[data-clear]')) {
        this.shell.confirm({ title: 'Borrar todas las mediciones', message: 'Se borrarán todas las mediciones y notas de este examen. Puede deshacerlo con Ctrl+Z.', okLabel: 'Borrar todas' })
          .then((ok) => { if (ok) this.store.clear(); });
        return;
      }
      if (e.target.closest('[data-copy]')) { this.copySummary(); return; }
      const li = e.target.closest('[data-id]');
      if (li) {
        const a = this.store.items.find((x) => x.id === li.dataset.id);
        this.store.select(a.id);
        if (this.goTo) this.goTo(a);
      }
    };
  }

  // keys: conjunto de frames a incluir (todas las mediciones si se omite).
  summaryLines(keys) {
    return this.store.items
      .filter((a) => !keys || keys.has(a.key))
      .map((a) => {
        const t = this.measurementText(a);
        return `${t.name}${a.frameLabel ? ' (' + a.frameLabel + ')' : ''}: ${t.value}${t.lines.length ? ' · ' + t.lines.join(' · ') : ''}`;
      });
  }

  async copySummary() {
    const s = this.study;
    const text = [`${s.patientName || ''} · ${s.description || s.modality || ''} · ${s.date || ''}`, ...this.summaryLines().map((l, i) => `${i + 1}. ${l}`)].join('\n');
    try { await navigator.clipboard.writeText(text); this.shell.toast('Resumen copiado al portapapeles.'); }
    catch (e) { this.shell.toast('No se pudo copiar.'); }
  }

  // --- Encabezado: descargar, exportar, imprimir --------------------------------------
  async header(a) {
    if (a === 'download') { if (this.onDownload) this.onDownload(); return; }
    if (a !== 'export' && a !== 'print') return;
    // Se exporta lo que se ve: todos los paneles visibles del escenario.
    const visible = this.viewports.filter((v) => v.frame && v.el.getBoundingClientRect().width > 0);
    const snap = snapshotStage(this.shell.stage);
    if (!snap) return;
    const label = visible.length === 1 && visible[0].frameLabel ? visible[0].frameLabel() : '';
    const win = a === 'print' ? window.open('', '_blank') : null;
    const s = this.study;
    const canvas = await composeExport(snap.canvas, {
      scale: snap.scale,
      title: s.patientName || 'Paciente',
      lines: [s.patientCode, s.description || this.profile.title, label, s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('es') : ''].filter(Boolean),
      measurements: this.summaryLines(new Set(visible.map((v) => v.frame.key))),
      note: this.profile.densityNote && this.store.items.some((m) => m.type === 'roi' || m.type === 'probe') ? 'Valores de gris de CBCT: no son unidades Hounsfield calibradas.' : ''
    });
    if (a === 'export') {
      const name = ['DentFrucer', s.patientCode || s.patientName, label || this.profile.title].filter(Boolean).join('_').replace(/[^\w.-]+/g, '_');
      downloadCanvas(canvas, name + '.png');
      this.shell.toast('Imagen exportada.');
    } else if (!printCanvas(canvas, 'DentFrucer · ' + (s.patientName || ''), win)) {
      this.shell.toast('Permita las ventanas emergentes para imprimir.');
    }
  }
}
