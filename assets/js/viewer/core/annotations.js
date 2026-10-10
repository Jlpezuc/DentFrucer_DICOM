// Mediciones y anotaciones: cálculo, dibujo, detección de clics y almacén.
//
// Una anotación:
//   { id, type, key, points: [[u, v], ...] (píxeles del frame), text?, frameLabel? }
// type: 'distance' | 'angle' | 'roi' | 'probe' | 'arrow'
// key:  el frame al que pertenece (frame.key); solo se dibuja sobre ese frame.

import { valueAt } from '../data/frame.js';

export const TYPE_NAMES = {
  distance: 'Distancia',
  angle: 'Ángulo',
  roi: 'Área',
  probe: 'Densidad',
  arrow: 'Nota'
};

const COLOR = '#b5dc6e';
const COLOR_SELECTED = '#5cc2ea';

const fmt = (n, d = 1) => Number(n).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

// --- Cálculo --------------------------------------------------------------------
export function measure(a, frame) {
  if (!frame) return { value: '', lines: [] };
  const [sx, sy] = frame.spacing || [1, 1];
  const unit = frame.spacing ? 'mm' : 'px';
  const p = a.points;
  switch (a.type) {
    case 'distance': {
      const d = Math.hypot((p[1][0] - p[0][0]) * sx, (p[1][1] - p[0][1]) * sy);
      return { value: fmt(d, unit === 'mm' ? 1 : 0) + ' ' + unit, number: d, lines: [] };
    }
    case 'angle': {
      const v1 = [(p[0][0] - p[1][0]) * sx, (p[0][1] - p[1][1]) * sy];
      const v2 = [(p[2][0] - p[1][0]) * sx, (p[2][1] - p[1][1]) * sy];
      const l = Math.hypot(...v1) * Math.hypot(...v2);
      const deg = l ? (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / l))) * 180) / Math.PI : 0;
      return { value: fmt(deg) + '°', number: deg, lines: [] };
    }
    case 'roi': {
      const s = roiStats(a, frame);
      const area = Math.PI * s.rx * s.ry * sx * sy;
      const u = frame.units ? ' ' + frame.units : '';
      return {
        value: fmt(area, unit === 'mm' ? 1 : 0) + ' ' + unit + '²',
        number: area,
        lines: s.n ? ['Media ' + fmt(s.mean, 0) + u + ' ± ' + fmt(s.sd, 0), 'Mín ' + fmt(s.min, 0) + ' · Máx ' + fmt(s.max, 0)] : []
      };
    }
    case 'probe': {
      const v = valueAt(frame, p[0][0], p[0][1]);
      return { value: v === null ? '—' : fmt(v, 0) + (frame.units ? ' ' + frame.units : ''), number: v, lines: [] };
    }
    case 'arrow':
      return { value: a.text || '', lines: [] };
    default:
      return { value: '', lines: [] };
  }
}

function roiStats(a, frame) {
  const [[x0, y0], [x1, y1]] = a.points;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
  let n = 0, sum = 0, sum2 = 0, min = Infinity, max = -Infinity;
  if (rx >= 0.5 && ry >= 0.5) {
    const step = Math.max(1, Math.floor(Math.sqrt((rx * ry * 4) / 40000)));
    for (let y = Math.floor(cy - ry); y <= cy + ry; y += step) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x += step) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const v = valueAt(frame, x, y);
        if (v === null) continue;
        n++; sum += v; sum2 += v * v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  const mean = n ? sum / n : 0;
  return { n, mean, sd: n ? Math.sqrt(Math.max(0, sum2 / n - mean * mean)) : 0, min, max, rx, ry };
}

// --- Dibujo ---------------------------------------------------------------------
function screenPoints(a, vp) { return a.points.map(([u, v]) => vp.imageToScreen(u, v)); }

function stroke(ctx, draw, color, width = 1.75) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.65)';
  ctx.lineWidth = width + 2;
  draw(); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  draw(); ctx.stroke();
  ctx.restore();
}

function handle(ctx, p, color) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#0f1419';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
}

// Etiqueta con fondo. Devuelve su rectángulo (para detectar clics).
function label(ctx, x, y, lines, color) {
  ctx.save();
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  const sub = '500 11px Inter, system-ui, sans-serif';
  const widths = lines.map((l, i) => { ctx.font = i ? sub : '600 12px Inter, system-ui, sans-serif'; return ctx.measureText(l).width; });
  const w = Math.max(...widths) + 14;
  const h = 8 + lines.length * 15;
  const r = { x: x + 10, y: y - h - 6, w, h };
  ctx.fillStyle = 'rgba(12, 17, 22, .82)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 6);
  ctx.fill();
  ctx.stroke();
  lines.forEach((l, i) => {
    ctx.font = i ? sub : '600 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = i ? 'rgba(230,236,241,.82)' : '#fff';
    ctx.fillText(l, r.x + 7, r.y + 16 + i * 15);
  });
  ctx.restore();
  return r;
}

export function drawAnnotation(ctx, a, vp, { selected = false, preview = false } = {}) {
  const color = selected ? COLOR_SELECTED : COLOR;
  const s = screenPoints(a, vp);
  const m = measure(a, vp.frame);
  a._labelRect = null;

  if (a.type === 'distance') {
    stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); ctx.lineTo(s[1].x, s[1].y); }, color);
    for (const p of s) tick(ctx, p, s[0], s[1], color);
    const mid = s[0].x > s[1].x ? s[0] : s[1];
    a._labelRect = label(ctx, mid.x, mid.y, [m.value], color);
  } else if (a.type === 'angle') {
    stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); ctx.lineTo(s[1].x, s[1].y); ctx.lineTo(s[2].x, s[2].y); }, color);
    const a1 = Math.atan2(s[0].y - s[1].y, s[0].x - s[1].x);
    const a2 = Math.atan2(s[2].y - s[1].y, s[2].x - s[1].x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    stroke(ctx, () => { ctx.beginPath(); ctx.arc(s[1].x, s[1].y, 22, a1, a1 + d, d < 0); }, color, 1.25);
    a._labelRect = label(ctx, s[1].x + 8, s[1].y - 8, [m.value], color);
  } else if (a.type === 'roi') {
    const cx = (s[0].x + s[1].x) / 2, cy = (s[0].y + s[1].y) / 2;
    // Elipse en coordenadas de imagen (respeta rotación).
    const c = vp.imageToScreen((a.points[0][0] + a.points[1][0]) / 2, (a.points[0][1] + a.points[1][1]) / 2);
    const ex = vp.imageToScreen(Math.max(a.points[0][0], a.points[1][0]), (a.points[0][1] + a.points[1][1]) / 2);
    const ey = vp.imageToScreen((a.points[0][0] + a.points[1][0]) / 2, Math.max(a.points[0][1], a.points[1][1]));
    const rx = Math.hypot(ex.x - c.x, ex.y - c.y), ry = Math.hypot(ey.x - c.x, ey.y - c.y);
    const rot = Math.atan2(ex.y - c.y, ex.x - c.x);
    stroke(ctx, () => { ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); }, color);
    a._labelRect = label(ctx, cx + rx * 0.7, cy - ry * 0.7, [m.value, ...m.lines], color);
  } else if (a.type === 'probe') {
    const p = s[0];
    stroke(ctx, () => { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.moveTo(p.x - 11, p.y); ctx.lineTo(p.x - 3, p.y); ctx.moveTo(p.x + 3, p.y); ctx.lineTo(p.x + 11, p.y); }, color, 1.5);
    a._labelRect = label(ctx, p.x, p.y, [m.value], color);
  } else if (a.type === 'arrow') {
    const [tip, tail] = s;
    stroke(ctx, () => {
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(tip.x, tip.y);
      const ang = Math.atan2(tip.y - tail.y, tip.x - tail.x);
      for (const k of [-1, 1]) { ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - 12 * Math.cos(ang + k * 0.45), tip.y - 12 * Math.sin(ang + k * 0.45)); }
    }, color, 2);
    if (a.text) a._labelRect = label(ctx, tail.x - 10, tail.y + 26, [a.text], color);
  }

  if (selected && !preview) for (const p of s) handle(ctx, p, color);
  if (preview) for (const p of s) handle(ctx, p, color);
}

function tick(ctx, p, a, b, color) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
  stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(p.x - 5 * Math.cos(ang), p.y - 5 * Math.sin(ang)); ctx.lineTo(p.x + 5 * Math.cos(ang), p.y + 5 * Math.sin(ang)); }, color);
}

// --- Detección de clics -------------------------------------------------------
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// Devuelve { handle: i } si se tocó un punto, { body: true } si se tocó la figura, o null.
export function hitTest(a, vp, x, y) {
  const s = screenPoints(a, vp);
  const p = { x, y };
  for (let i = 0; i < s.length; i++) if (Math.hypot(s[i].x - x, s[i].y - y) <= 9) return { handle: i };
  const r = a._labelRect;
  if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { body: true };
  if ((a.type === 'distance' || a.type === 'arrow') && distToSegment(p, s[0], s[1]) < 6) return { body: true };
  if (a.type === 'angle' && (distToSegment(p, s[0], s[1]) < 6 || distToSegment(p, s[1], s[2]) < 6)) return { body: true };
  if (a.type === 'roi') {
    const minx = Math.min(s[0].x, s[1].x), maxx = Math.max(s[0].x, s[1].x);
    const miny = Math.min(s[0].y, s[1].y), maxy = Math.max(s[0].y, s[1].y);
    if (x >= minx - 4 && x <= maxx + 4 && y >= miny - 4 && y <= maxy + 4) return { body: true };
  }
  if (a.type === 'probe' && Math.hypot(s[0].x - x, s[0].y - y) < 12) return { body: true };
  return null;
}

// --- Almacén ----------------------------------------------------------------------
let ids = 0;

export class AnnotationStore {
  constructor() {
    this.items = [];
    this.selectedId = null;
    this.history = [];
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }

  snapshot() {
    this.history.push(JSON.stringify(this.items.map(({ _labelRect, ...a }) => a)));
    if (this.history.length > 50) this.history.shift();
  }

  undo() {
    const prev = this.history.pop();
    if (prev === undefined) return false;
    this.items = JSON.parse(prev);
    this.selectedId = null;
    this.emit();
    return true;
  }

  add(a) {
    this.snapshot();
    a.id = a.id || 'm' + (++ids);
    this.items.push(a);
    this.selectedId = a.id;
    this.emit();
    return a;
  }

  remove(id) {
    if (!this.items.some((a) => a.id === id)) return;
    this.snapshot();
    this.items = this.items.filter((a) => a.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    this.emit();
  }

  clear() {
    if (!this.items.length) return;
    this.snapshot();
    this.items = [];
    this.selectedId = null;
    this.emit();
  }

  select(id) { this.selectedId = id; this.emit(); }
  selected() { return this.items.find((a) => a.id === this.selectedId) || null; }
  forKey(key) { return this.items.filter((a) => a.key === key); }
}
