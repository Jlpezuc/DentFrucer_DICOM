// Viewport: un lienzo que muestra un frame con zoom, desplazamiento, rotación,
// volteo, ventana/nivel, mediciones y textos superpuestos.
//
// Coordenadas:
//   imagen   (u, v)  píxeles del frame
//   mundo    (mm)    u * sx, v * sy  (respeta píxeles no cuadrados)
//   pantalla (px CSS) relativo al lienzo
//
// Los eventos del puntero se delegan en el ToolController (core/tools.js).
// Los modos pueden añadir "decoradores" (p. ej. la cruz del MPR) que se dibujan
// sobre la imagen: vp.decorators.push((ctx, vp) => { ... }).

import { renderFrame } from '../data/frame.js';
import { drawAnnotation } from './annotations.js';

export class Viewport {
  constructor(container, { name = '', label = '', accent = null, orientation = null } = {}) {
    this.name = name;
    this.el = container;
    this.el.classList.add('dv-pane');
    this.el.innerHTML = `
      <canvas class="dv-canvas"></canvas>
      <div class="dv-ov dv-ov-tl"></div><div class="dv-ov dv-ov-tr"></div>
      <div class="dv-ov dv-ov-bl"></div><div class="dv-ov dv-ov-br"></div>
      <div class="dv-orient dv-orient-t"></div><div class="dv-orient dv-orient-b"></div>
      <div class="dv-orient dv-orient-l"></div><div class="dv-orient dv-orient-r"></div>
      <div class="dv-empty" hidden></div>`;
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ov = {
      tl: this.el.querySelector('.dv-ov-tl'), tr: this.el.querySelector('.dv-ov-tr'),
      bl: this.el.querySelector('.dv-ov-bl'), br: this.el.querySelector('.dv-ov-br')
    };
    if (label) this.setLabel(label, accent);
    this.orientation = orientation; // { top, bottom, left, right }

    this.frame = null;
    this.wl = { c: 0, w: 1 };
    this.invert = false;
    this.view = { scale: 1, tx: 0, ty: 0, rot: 0, flipH: false, flipV: false };
    this.info = { tl: [], tr: [], bl: [], br: [] };
    this.decorators = [];
    this.annotations = () => [];   // lo asigna el modo: (vp) => anotaciones visibles
    this.isSelected = () => false;
    this.preview = null;           // anotación en construcción
    this.lens = null;              // lupa { x, y }
    this.showOverlays = true;
    this.controller = null;
    this.onChange = () => {};      // zoom/ventana cambió (para actualizar la interfaz)

    this.imgCanvas = document.createElement('canvas');
    this.imgCtx = this.imgCanvas.getContext('2d');
    this.imageDirty = true;
    this.pending = false;

    this.resizeObserver = new ResizeObserver(() => { this.fitIfNeeded(); this.render(); });
    this.resizeObserver.observe(this.el);
    this.bindEvents();
  }

  destroy() { this.resizeObserver.disconnect(); }

  setLabel(text, accent) {
    let chip = this.el.querySelector('.dv-pane-label');
    if (!chip) { chip = document.createElement('div'); chip.className = 'dv-pane-label'; this.el.appendChild(chip); }
    chip.textContent = text;
    if (accent) chip.style.setProperty('--accent', accent);
  }

  setEmpty(text) {
    const e = this.el.querySelector('.dv-empty');
    e.hidden = !text;
    e.textContent = text || '';
  }

  // --- Contenido ---------------------------------------------------------------
  setFrame(frame, { resetView = false, keepWindow = false } = {}) {
    const prev = this.frame;
    this.frame = frame;
    if (!frame) { this.render(); return; }
    if (!keepWindow || !prev) { this.wl = { ...frame.wl }; this.invert = !!frame.invert; }
    const sameSize = prev && this.worldSize(prev).w === this.worldSize(frame).w && this.worldSize(prev).h === this.worldSize(frame).h;
    if (resetView || !sameSize) this.needsFit = true;
    this.imageDirty = true;
    this.fitIfNeeded();
    this.render();
  }

  spacing(frame = this.frame) { return (frame && frame.spacing) || [1, 1]; }

  worldSize(frame = this.frame) {
    const [sx, sy] = this.spacing(frame);
    return { w: frame.width * sx, h: frame.height * sy };
  }

  setWindow(c, w) {
    this.wl = { c, w: Math.max(1, w) };
    this.imageDirty = true;
    this.render();
    this.onChange(this);
  }

  setInvert(on) { this.invert = on; this.imageDirty = true; this.render(); this.onChange(this); }

  // --- Transformaciones -----------------------------------------------------
  matrix() {
    const { w, h } = this.worldSize();
    const v = this.view;
    return new DOMMatrix()
      .translate(this.cssWidth / 2 + v.tx, this.cssHeight / 2 + v.ty)
      .rotate(v.rot * 90)
      .scale(v.flipH ? -v.scale : v.scale, v.flipV ? -v.scale : v.scale)
      .translate(-w / 2, -h / 2);
  }

  imageToScreen(u, v) {
    const [sx, sy] = this.spacing();
    const p = this.matrix().transformPoint(new DOMPoint(u * sx, v * sy));
    return { x: p.x, y: p.y };
  }

  screenToImage(x, y) {
    const [sx, sy] = this.spacing();
    const p = this.matrix().inverse().transformPoint(new DOMPoint(x, y));
    return { x: p.x / sx, y: p.y / sy };
  }

  // Píxeles de pantalla por mm.
  pixelsPerMM() { return this.view.scale; }

  fitIfNeeded() {
    this.cssWidth = this.el.clientWidth;
    this.cssHeight = this.el.clientHeight;
    if (this.needsFit && this.frame && this.cssWidth > 0) { this.fit(); this.needsFit = false; }
  }

  fit() {
    if (!this.frame) return;
    const { w, h } = this.worldSize();
    const odd = this.view.rot % 2 === 1;
    const ww = odd ? h : w;
    const hh = odd ? w : h;
    this.view.scale = Math.min(this.cssWidth / ww, this.cssHeight / hh) * 0.94;
    this.view.tx = 0;
    this.view.ty = 0;
    this.render();
    this.onChange(this);
  }

  zoomAt(factor, x = this.cssWidth / 2, y = this.cssHeight / 2) {
    const p = this.screenToImage(x, y);
    this.view.scale = Math.max(0.02, Math.min(400, this.view.scale * factor));
    const q = this.imageToScreen(p.x, p.y);
    this.view.tx += x - q.x;
    this.view.ty += y - q.y;
    this.render();
    this.onChange(this);
  }

  // Zoom a una escala fija: 1 = 1 píxel de la imagen por píxel de pantalla.
  zoomToActualSize() {
    const [sx] = this.spacing();
    this.zoomAt((1 / sx) / this.view.scale);
  }

  panBy(dx, dy) { this.view.tx += dx; this.view.ty += dy; this.render(); }

  rotate(dir = 1) { this.view.rot = (this.view.rot + dir + 4) % 4; this.fit(); }

  flip(axis) {
    if (axis === 'h') this.view.flipH = !this.view.flipH;
    else this.view.flipV = !this.view.flipV;
    this.render();
    this.onChange(this);
  }

  resetView() {
    this.view = { scale: 1, tx: 0, ty: 0, rot: 0, flipH: false, flipV: false };
    if (this.frame) { this.wl = { ...this.frame.wl }; this.invert = !!this.frame.invert; }
    this.imageDirty = true;
    this.fit();
  }

  // --- Dibujo -------------------------------------------------------------------
  render() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.draw(); });
  }

  updateImage() {
    const f = this.frame;
    if (this.imgCanvas.width !== f.width || this.imgCanvas.height !== f.height) {
      this.imgCanvas.width = f.width;
      this.imgCanvas.height = f.height;
      this.imageData = this.imgCtx.createImageData(f.width, f.height);
    }
    renderFrame(f, this.wl, this.invert, this.imageData);
    this.imgCtx.putImageData(this.imageData, 0, 0);
    this.imageDirty = false;
  }

  draw() {
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = this.el.clientWidth;
    this.cssHeight = this.el.clientHeight;
    const W = Math.max(1, Math.round(this.cssWidth * dpr));
    const H = Math.max(1, Math.round(this.cssHeight * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (!this.frame) { this.updateOverlays(); return; }
    if (this.imageDirty) this.updateImage();

    const { w, h } = this.worldSize();
    const m = this.matrix();
    ctx.setTransform(new DOMMatrix().scale(dpr).multiply(m));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.imgCanvas, 0, 0, w, h);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const d of this.decorators) d(ctx, this);
    for (const a of this.annotations(this)) drawAnnotation(ctx, a, this, { selected: this.isSelected(a) });
    if (this.preview) drawAnnotation(ctx, this.preview, this, { selected: true, preview: true });
    if (this.lens) this.drawLens(ctx, dpr);
    if (this.showOverlays) this.drawScaleBar(ctx);
    this.updateOverlays();
  }

  drawLens(ctx, dpr) {
    const { x, y } = this.lens;
    const r = Math.min(110, Math.min(this.cssWidth, this.cssHeight) / 4);
    const zoom = 3;
    const { w, h } = this.worldSize();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    const m = new DOMMatrix().scale(dpr).translate(x, y).scale(zoom).translate(-x, -y).multiply(this.matrix());
    ctx.setTransform(m);
    ctx.drawImage(this.imgCanvas, 0, 0, w, h);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(166, 212, 95, .9)';
    ctx.stroke();
  }

  drawScaleBar(ctx) {
    if (!this.frame.spacing) return;
    const ppm = this.pixelsPerMM();
    const options = [0.5, 1, 2, 5, 10, 20, 50, 100];
    let mm = options.find((o) => o * ppm >= 50) || 100;
    const len = mm * ppm;
    if (len > this.cssWidth * 0.4) return;
    // Abajo a la derecha, por encima de las líneas de texto de esa esquina.
    const brLines = this.showOverlays ? this.info.br.filter(Boolean).length : 0;
    const x = this.cssWidth - 12 - len;
    const y = this.cssHeight - 12 - brLines * 16.7 - 6;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mm + ' mm', x + len / 2, y - 7);
    ctx.restore();
  }

  updateOverlays() {
    const show = this.showOverlays && this.frame;
    const zoomPct = this.frame ? Math.round(this.view.scale * this.spacing()[0] * 100) : 0;
    const dyn = this.frame ? [`V ${Math.round(this.wl.w)} · N ${Math.round(this.wl.c)}${this.invert ? ' · Inv.' : ''}`, `Zoom ${zoomPct}%`] : [];
    const set = (k, lines) => {
      const html = show ? lines.filter(Boolean).map((l) => `<div>${l}</div>`).join('') : '';
      if (this.ov[k]._html !== html) { this.ov[k].innerHTML = html; this.ov[k]._html = html; }
    };
    set('tl', this.info.tl);
    set('tr', this.info.tr);
    set('bl', [...this.info.bl, ...dyn]);
    set('br', this.info.br);

    const o = show && this.orientation ? this.rotatedOrientation() : {};
    for (const side of ['t', 'b', 'l', 'r']) {
      const el = this.el.querySelector('.dv-orient-' + side);
      const txt = o[side] || '';
      if (el.textContent !== txt) el.textContent = txt;
    }
  }

  // Marcadores de orientación teniendo en cuenta rotación y volteo.
  rotatedOrientation() {
    let { top: t, bottom: b, left: l, right: r } = this.orientation;
    if (this.view.flipH) [l, r] = [r, l];
    if (this.view.flipV) [t, b] = [b, t];
    for (let i = 0; i < this.view.rot; i++) [t, r, b, l] = [l, t, r, b];
    return { t, b, l, r };
  }

  // --- Eventos ----------------------------------------------------------------
  bindEvents() {
    const c = this.canvas;
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); this.controller && this.controller.pointerDown(this, e, pos(e)); });
    c.addEventListener('pointermove', (e) => this.controller && this.controller.pointerMove(this, e, pos(e)));
    c.addEventListener('pointerup', (e) => this.controller && this.controller.pointerUp(this, e, pos(e)));
    c.addEventListener('pointercancel', (e) => this.controller && this.controller.pointerUp(this, e, pos(e)));
    c.addEventListener('pointerleave', () => this.controller && this.controller.pointerLeave(this));
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.controller && this.controller.wheel(this, e, pos(e)); }, { passive: false });
    c.addEventListener('dblclick', (e) => this.controller && this.controller.doubleClick(this, e, pos(e)));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
