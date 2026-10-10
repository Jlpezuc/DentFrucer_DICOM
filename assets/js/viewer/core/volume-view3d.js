// Panel 3D interactivo: arrastrar para rotar, rueda para acercar,
// doble clic para volver a la vista frontal.

import { VolumeRenderer } from './volume-render.js';

const HQ = 320; // resolución en reposo
const LQ = 150; // resolución mientras se arrastra

export class Volume3DView {
  constructor(container, vol) {
    this.el = container;
    this.vol = vol;
    this.renderer = null; // se crea al mostrarse por primera vez
    this.state = { yaw: -0.55, pitch: 0.22, zoom: 1.3, mode: 'bone', threshold: undefined };
    this.el.classList.add('dv-pane', 'dv-pane-3d');
    this.el.innerHTML = '<canvas class="dv-canvas"></canvas><div class="dv-3d-busy" hidden>Calculando…</div>';
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.busyEl = this.el.querySelector('.dv-3d-busy');
    this.buffers = {};
    this.onChange = () => {};
    this.bind();
    this.ro = new ResizeObserver(() => this.render(false));
    this.ro.observe(this.el);
  }

  destroy() { this.ro.disconnect(); }

  ensureRenderer() {
    if (!this.renderer) {
      this.renderer = new VolumeRenderer(this.vol);
      if (this.state.threshold === undefined) this.state.threshold = this.renderer.defaultThreshold(this.state.mode);
    }
    return this.renderer;
  }

  setMode(mode) {
    this.state.mode = mode;
    this.state.threshold = this.ensureRenderer().defaultThreshold(mode);
    this.render(false);
    this.onChange(this.state);
  }

  setThreshold(v) { this.state.threshold = v; this.render(true); this.settle(); }

  setView(name) {
    const views = { front: [0, 0], oblique: [-0.55, 0.22], left: [Math.PI / 2, 0], right: [-Math.PI / 2, 0], top: [0, Math.PI / 2], back: [Math.PI, 0] };
    [this.state.yaw, this.state.pitch] = views[name] || [0, 0];
    this.render(false);
  }

  bind() {
    const c = this.canvas;
    let last = null;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); last = { x: e.clientX, y: e.clientY }; c.style.cursor = 'grabbing'; });
    c.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.state.yaw += (e.clientX - last.x) * 0.01;
      this.state.pitch = Math.max(-1.5, Math.min(1.5, this.state.pitch + (e.clientY - last.y) * 0.01));
      last = { x: e.clientX, y: e.clientY };
      this.render(true);
    });
    const up = () => { if (last) { last = null; c.style.cursor = ''; this.render(false); } };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.state.zoom = Math.max(0.5, Math.min(6, this.state.zoom * Math.exp(-e.deltaY * 0.0015)));
      this.render(true);
      this.settle();
    }, { passive: false });
    c.addEventListener('dblclick', () => this.setView('oblique'));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  settle() {
    clearTimeout(this._settle);
    this._settle = setTimeout(() => this.render(false), 180);
  }

  render(fast) {
    if (this.el.offsetParent === null) return; // oculto
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this.draw(fast);
    });
  }

  draw(fast) {
    const first = !this.renderer;
    if (first) this.busyEl.hidden = false;
    // Primer cálculo: deja que se pinte el aviso antes de bloquear.
    if (first) { setTimeout(() => { this.ensureRenderer(); this.busyEl.hidden = true; this.draw(fast); }, 30); return; }
    const S = fast ? LQ : HQ;
    if (!this.buffers[S]) {
      const off = document.createElement('canvas');
      off.width = off.height = S;
      this.buffers[S] = { canvas: off, ctx: off.getContext('2d'), img: off.getContext('2d').createImageData(S, S) };
    }
    const b = this.buffers[S];
    this.renderer.render(b.img, { ...this.state, wl: this.wl || this.vol.wl });
    b.ctx.putImageData(b.img, 0, 0);

    const dpr = window.devicePixelRatio || 1;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createRadialGradient(this.canvas.width / 2, this.canvas.height * 0.45, 10, this.canvas.width / 2, this.canvas.height / 2, Math.max(this.canvas.width, this.canvas.height) * 0.7);
    g.addColorStop(0, '#1d2833');
    g.addColorStop(1, '#06090c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const size = Math.min(this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(b.canvas, (this.canvas.width - size) / 2, (this.canvas.height - size) / 2, size, size);
  }
}
