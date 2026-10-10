// Herramientas del visor y su interacción con el puntero (ratón, trackpad y táctil).
//
// Gestos que funcionan siempre, con cualquier herramienta:
//   clic derecho + arrastrar  -> ventana/nivel (contraste y brillo)
//   clic central + arrastrar  -> mover
//   rueda                     -> cambiar de corte (volúmenes) o zoom (imágenes)
//   Ctrl/⌘ + rueda, pellizco   -> zoom
//   arrastrar un punto de una medición -> editarla

import { hitTest } from './annotations.js';

// Catálogo de herramientas. El modo decide cuáles se muestran.
export const TOOLS = {
  pan:       { label: 'Mover', icon: 'move', key: 'M', group: 'nav', hint: 'Arrastre para mover la imagen. Rueda o pellizco para acercar.' },
  zoom:      { label: 'Zoom', icon: 'zoom', key: 'Z', group: 'nav', hint: 'Arrastre hacia arriba para acercar y hacia abajo para alejar.' },
  wl:        { label: 'Contraste', icon: 'contrast', key: 'W', group: 'nav', hint: 'Arrastre: horizontal ajusta el contraste, vertical el brillo. También funciona con clic derecho.' },
  crosshair: { label: 'Navegar', icon: 'crosshair', key: 'N', group: 'nav', hint: 'Haga clic o arrastre para ubicar los otros planos en ese punto. Rueda: cambiar de corte.' },
  magnify:   { label: 'Lupa', icon: 'lens', key: 'L', group: 'nav', hint: 'Mantenga presionado sobre la imagen para ampliar una zona.' },
  distance:  { label: 'Distancia', icon: 'ruler', key: 'D', group: 'measure', hint: 'Arrastre de un punto a otro para medir. Puede mover los extremos después.' },
  angle:     { label: 'Ángulo', icon: 'angle', key: 'A', group: 'measure', hint: 'Arrastre el primer brazo hasta el vértice y luego haga clic en el extremo del segundo brazo.' },
  roi:       { label: 'Área y densidad', icon: 'roi', key: 'R', group: 'measure', hint: 'Arrastre para dibujar una elipse: muestra el área y la densidad media.' },
  probe:     { label: 'Densidad puntual', icon: 'probe', key: 'H', group: 'measure', hint: 'Haga clic para fijar el valor de densidad en un punto.' },
  arrow:     { label: 'Nota', icon: 'arrow', key: 'T', group: 'measure', hint: 'Arrastre desde el punto a señalar y escriba una nota.' },
  calibrate: { label: 'Calibrar', icon: 'calibrate', key: 'K', group: 'measure', hint: 'Trace una línea sobre un objeto de tamaño conocido e indique su medida real en mm.' },
  curve:     { label: 'Curva panorámica', icon: 'curve', key: 'U', group: 'measure', hint: 'En la vista axial, haga clic a lo largo del arco dental de un extremo al otro. Doble clic o Enter para terminar.' }
};

const DRAW_TOOLS = new Set(['distance', 'roi', 'arrow', 'calibrate']);

export class ToolController {
  // hooks: { store, onActivate(vp), onCursor(vp, img|null), prompt(opts), onCalibrate(vp, ann), onToolUsed() }
  constructor(hooks) {
    this.h = hooks;
    this.store = hooks.store;
    this.tool = 'pan';
    this.op = null;
    this.pointers = new Map();
    this.angleDraft = null;
  }

  setTool(name) {
    this.cancel();
    this.tool = name;
  }

  cancel() {
    if (this.angleDraft) { this.angleDraft.vp.preview = null; this.angleDraft.vp.render(); this.angleDraft = null; }
    if (this.op && this.op.vp) { this.op.vp.preview = null; this.op.vp.lens = null; this.op.vp.render(); }
    this.op = null;
  }

  // --- Puntero ----------------------------------------------------------------
  pointerDown(vp, e, p) {
    this.h.onActivate(vp);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.cancel();
      this.op = { type: 'pinch', vp, d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    if (!vp.frame) return;
    const img = vp.screenToImage(p.x, p.y);
    const pt = [img.x, img.y];

    if (e.button === 2) { this.op = { type: 'wl', vp, last: p }; return; }
    if (e.button === 1) { this.op = { type: 'pan', vp, last: p }; return; }
    if (e.button !== 0) return;

    // Ángulo en curso: clics para el vértice y el segundo extremo.
    if (this.angleDraft && this.angleDraft.vp === vp) {
      const prev = vp.preview;
      if (this.angleDraft.stage === 1) { prev.points[1] = pt; prev.points[2] = pt.slice(); this.angleDraft.stage = 2; }
      else { prev.points[2] = pt; this.commit(vp, prev); this.angleDraft = null; vp.preview = null; }
      vp.render();
      return;
    }

    if (this.tool === 'curve') { if (vp.onCurvePoint) vp.onCurvePoint(img); return; }

    // ¿Se tocó una medición existente?
    const list = vp.annotations(vp);
    for (let i = list.length - 1; i >= 0; i--) {
      const hit = hitTest(list[i], vp, p.x, p.y);
      if (!hit) continue;
      this.store.selectedId = list[i].id;
      if (hit.handle !== undefined) this.op = { type: 'handle', vp, a: list[i], i: hit.handle };
      else this.op = { type: 'move', vp, a: list[i], start: pt, orig: list[i].points.map((q) => q.slice()) };
      this.store.emit();
      return;
    }
    if (this.store.selectedId) this.store.select(null);

    const key = vp.frame.key;
    switch (this.tool) {
      case 'pan': this.op = { type: 'pan', vp, last: p }; vp.canvas.style.cursor = 'grabbing'; break;
      case 'zoom': this.op = { type: 'zoom', vp, last: p }; break;
      case 'wl': this.op = { type: 'wl', vp, last: p }; break;
      case 'crosshair': if (vp.onCrosshair) vp.onCrosshair(img); this.op = { type: 'crosshair', vp }; break;
      case 'magnify': vp.lens = p; vp.render(); this.op = { type: 'lens', vp }; break;
      case 'probe': this.commit(vp, { type: 'probe', key, points: [pt] }); break;
      case 'angle':
        vp.preview = { type: 'angle', key, points: [pt, pt.slice(), pt.slice()] };
        this.op = { type: 'draw-angle', vp, start: p };
        break;
      default:
        if (DRAW_TOOLS.has(this.tool)) {
          vp.preview = { type: this.tool === 'calibrate' ? 'distance' : this.tool, key, points: [pt, pt.slice()] };
          this.op = { type: 'draw', vp, start: p, tool: this.tool };
        }
    }
  }

  pointerMove(vp, e, p) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    const op = this.op;
    if (op && op.type === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      op.vp.panBy(mid.x - op.mid.x, mid.y - op.mid.y);
      if (op.d > 0) op.vp.zoomAt(d / op.d, mid.x, mid.y);
      op.d = d; op.mid = mid;
      return;
    }
    if (!vp.frame) return;
    const img = vp.screenToImage(p.x, p.y);
    const pt = [img.x, img.y];

    if (!op || op.vp !== vp) {
      this.h.onCursor(vp, img);
      if (this.angleDraft && this.angleDraft.vp === vp) {
        const prev = vp.preview;
        if (this.angleDraft.stage === 1) { prev.points[1] = pt; prev.points[2] = pt.slice(); }
        else prev.points[2] = pt;
        vp.render();
      }
      this.updateCursor(vp, p);
      return;
    }

    const dx = p.x - (op.last ? op.last.x : p.x);
    const dy = p.y - (op.last ? op.last.y : p.y);
    op.last = p;
    switch (op.type) {
      case 'pan': vp.panBy(dx, dy); break;
      case 'zoom': vp.zoomAt(Math.exp(-dy * 0.01)); break;
      case 'wl': {
        const f = vp.frame;
        const range = Math.max(1, f.max - f.min);
        const k = range / Math.max(200, vp.cssHeight) / 1.5;
        vp.setWindow(vp.wl.c - dy * k, vp.wl.w + dx * k);
        break;
      }
      case 'crosshair': if (vp.onCrosshair) vp.onCrosshair(img); break;
      case 'lens': vp.lens = p; vp.render(); break;
      case 'draw': vp.preview.points[1] = pt; vp.render(); break;
      case 'draw-angle': vp.preview.points[1] = pt; vp.preview.points[2] = pt.slice(); vp.render(); break;
      case 'handle':
        if (!op.snapped) { this.store.snapshot(); op.snapped = true; }
        op.a.points[op.i] = pt; vp.render(); break;
      case 'move': {
        if (!op.snapped) { this.store.snapshot(); op.snapped = true; }
        const ox = pt[0] - op.start[0], oy = pt[1] - op.start[1];
        op.a.points = op.orig.map(([u, v]) => [u + ox, v + oy]);
        vp.render();
        break;
      }
    }
    this.h.onCursor(vp, img);
  }

  async pointerUp(vp, e, p) {
    this.pointers.delete(e.pointerId);
    const op = this.op;
    if (!op) return;
    if (op.type === 'pinch') { if (this.pointers.size < 2) this.op = null; return; }
    this.op = null;
    vp.canvas.style.cursor = '';
    const moved = op.start ? Math.hypot(p.x - op.start.x, p.y - op.start.y) > 4 : true;

    switch (op.type) {
      case 'lens': vp.lens = null; vp.render(); break;
      case 'handle':
      case 'move': this.store.emit(); break;
      case 'draw-angle':
        this.angleDraft = { vp, stage: moved ? 2 : 1 };
        break;
      case 'draw': {
        const a = vp.preview;
        vp.preview = null;
        if (!moved) { vp.render(); break; }
        if (op.tool === 'calibrate') { await this.h.onCalibrate(vp, a); vp.render(); break; }
        if (op.tool === 'arrow') {
          const end = vp.imageToScreen(a.points[1][0], a.points[1][1]);
          const text = await this.h.prompt({ title: 'Nota', placeholder: 'Escriba la nota…', x: end.x, y: end.y, vp });
          if (!text) { vp.render(); break; }
          a.text = text;
        }
        this.commit(vp, a);
        break;
      }
    }
  }

  pointerLeave(vp) {
    this.h.onCursor(vp, null);
  }

  wheel(vp, e, p) {
    const zoom = e.ctrlKey || e.metaKey || !vp.onScroll;
    if (zoom) vp.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
    else {
      vp._wheelAcc = (vp._wheelAcc || 0) + e.deltaY;
      const step = Math.abs(e.deltaMode === 1 ? 1 : 40);
      while (Math.abs(vp._wheelAcc) >= step) {
        vp.onScroll(Math.sign(vp._wheelAcc));
        vp._wheelAcc -= Math.sign(vp._wheelAcc) * step;
      }
    }
  }

  doubleClick(vp) {
    if (this.tool === 'curve') { if (vp.onCurveFinish) vp.onCurveFinish(); return; }
    if (vp.onDoubleClick) vp.onDoubleClick();
  }

  commit(vp, a) {
    this.store.add({ type: a.type, key: a.key, points: a.points.map((q) => q.slice()), text: a.text, frameLabel: vp.frameLabel ? vp.frameLabel() : '' });
    vp.render();
    this.h.onToolUsed && this.h.onToolUsed(a.type);
  }

  updateCursor(vp, p) {
    let over = false;
    for (const a of vp.annotations(vp)) if (hitTest(a, vp, p.x, p.y)) { over = true; break; }
    const cursors = { pan: 'grab', zoom: 'zoom-in', wl: 'ns-resize', crosshair: 'crosshair', magnify: 'none' };
    vp.canvas.style.cursor = over ? 'move' : (cursors[this.tool] || 'crosshair');
  }
}
