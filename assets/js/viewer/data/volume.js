// Volumen 3D (CBCT) y reconstrucciones: cortes axial/coronal/sagital,
// panorámica sobre una curva dibujada y cortes transversales a esa curva.
//
// Convención de ejes (sistema del paciente DICOM, LPS):
//   x: columnas  -> hacia la izquierda del paciente
//   y: filas     -> hacia posterior
//   z: cortes    -> hacia superior (el corte 0 es el más inferior)
//
// {
//   key, nx, ny, nz,
//   data:    Int16Array con valores reales (p. ej. HU), índice = z*nx*ny + y*nx + x
//   spacing: [sx, sy, sz] en mm
//   min, max, wl, units, invert, meta
// }

import { createFrame, nextKey } from './frame.js';

export const AXES = ['axial', 'coronal', 'sagital'];

export function createVolume(props) {
  const vol = { key: nextKey('v'), units: '', invert: false, meta: {}, ...props };
  if (vol.min === undefined) {
    let min = Infinity;
    let max = -Infinity;
    const d = vol.data;
    for (let i = 0; i < d.length; i += 7) { const v = d[i]; if (v < min) min = v; if (v > max) max = v; }
    vol.min = min; vol.max = max;
  }
  if (!vol.wl) vol.wl = autoVolumeWindow(vol);
  return vol;
}

function autoVolumeWindow(vol) {
  const d = vol.data;
  const step = Math.max(1, Math.floor(d.length / 300000));
  const s = [];
  for (let i = 0; i < d.length; i += step) s.push(d[i]);
  s.sort((a, b) => a - b);
  const lo = s[Math.floor(s.length * 0.01)];
  const hi = s[Math.floor(s.length * 0.999)];
  return { c: (lo + hi) / 2, w: Math.max(1, hi - lo) };
}

// Número de cortes en cada eje.
export function sliceCount(vol, axis) {
  return axis === 'axial' ? vol.nz : axis === 'coronal' ? vol.ny : vol.nx;
}

// --- Conversión entre coordenadas de un corte (u, v) y del volumen (x, y, z) ---
export function viewToVoxel(vol, axis, index, u, v) {
  if (axis === 'axial') return [u, v, index];
  if (axis === 'coronal') return [u, index, vol.nz - 1 - v];
  return [index, u, vol.nz - 1 - v];
}

export function voxelToView(vol, axis, x, y, z) {
  if (axis === 'axial') return { index: z, u: x, v: y };
  if (axis === 'coronal') return { index: y, u: x, v: vol.nz - 1 - z };
  return { index: x, u: y, v: vol.nz - 1 - z };
}

// Corte 2D. slab = número de cortes a combinar (MIP) para dar espesor.
export function getSlice(vol, axis, index, slab = 1, slabMode = 'mip') {
  const { nx, ny, nz, data } = vol;
  const n = sliceCount(vol, axis);
  index = Math.max(0, Math.min(n - 1, Math.round(index)));
  const half = Math.floor(Math.max(1, slab) / 2);
  const i0 = Math.max(0, index - half);
  const i1 = Math.min(n - 1, index + half);
  let w, h, spacing, out;

  if (axis === 'axial') {
    w = nx; h = ny; spacing = [vol.spacing[0], vol.spacing[1]];
    if (i0 === i1) out = data.subarray(index * nx * ny, (index + 1) * nx * ny);
    else {
      out = new Int16Array(nx * ny);
      combine(out, i1 - i0 + 1, slabMode, (k, i) => data[(i0 + k) * nx * ny + i]);
    }
  } else if (axis === 'coronal') {
    w = nx; h = nz; spacing = [vol.spacing[0], vol.spacing[2]];
    out = new Int16Array(w * h);
    combine(out, i1 - i0 + 1, slabMode, (k, i) => {
      const x = i % w;
      const z = nz - 1 - ((i / w) | 0);
      return data[z * nx * ny + (i0 + k) * nx + x];
    });
  } else {
    w = ny; h = nz; spacing = [vol.spacing[1], vol.spacing[2]];
    out = new Int16Array(w * h);
    combine(out, i1 - i0 + 1, slabMode, (k, i) => {
      const y = i % w;
      const z = nz - 1 - ((i / w) | 0);
      return data[z * nx * ny + y * nx + (i0 + k)];
    });
  }

  return createFrame({
    key: vol.key + ':' + axis + ':' + index,
    width: w,
    height: h,
    data: out,
    min: vol.min,
    max: vol.max,
    wl: vol.wl,
    invert: vol.invert,
    spacing,
    spacingSource: 'dicom',
    units: vol.units,
    meta: vol.meta
  });
}

function combine(out, count, mode, read) {
  const len = out.length;
  if (count === 1) { for (let i = 0; i < len; i++) out[i] = read(0, i); return; }
  if (mode === 'avg') {
    for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < count; k++) s += read(k, i); out[i] = s / count; }
  } else {
    for (let i = 0; i < len; i++) { let m = -32768; for (let k = 0; k < count; k++) { const v = read(k, i); if (v > m) m = v; } out[i] = m; }
  }
}

// ---------------------------------------------------------------------------
// Panorámica reconstruida
// ---------------------------------------------------------------------------

// Curva suave (Catmull-Rom) por los puntos, re-muestreada cada "step" mm.
export function samplePath(pointsMM, step) {
  const dense = [];
  const P = pointsMM;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.05) {
      const t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push(P[P.length - 1]);
  // Re-muestreo por longitud de arco.
  const out = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const [ax, ay] = dense[i - 1];
    const [bx, by] = dense[i];
    let seg = Math.hypot(bx - ax, by - ay);
    let pos = step - carry;
    while (pos <= seg) {
      const t = pos / seg;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      pos += step;
    }
    carry = seg - (pos - step);
  }
  const normals = out.map((p, i) => {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    return [-ty / l, tx / l];
  });
  return { points: out, normals, step };
}

function sampleXY(vol, xmm, ymm, z) {
  const x = Math.round(xmm / vol.spacing[0]);
  const y = Math.round(ymm / vol.spacing[1]);
  if (x < 0 || y < 0 || x >= vol.nx || y >= vol.ny) return null;
  return vol.data[z * vol.nx * vol.ny + y * vol.nx + x];
}

// pointsVoxel: puntos [x, y] en coordenadas del corte axial.
// thickness: grosor de la "capa focal" en mm. mode: 'avg' (como una radiografía) o 'mip'.
// key: identificador estable del frame (las mediciones se asocian a él y deben
// sobrevivir a un cambio de grosor o de modo).
export function reconstructPanoramic(vol, pointsVoxel, { thickness = 12, mode = 'avg', key = nextKey('pano') } = {}) {
  const [sx, sy, sz] = vol.spacing;
  const step = Math.min(sx, sy);
  // Convención de panorámica: el lado derecho del paciente (x menor) a la izquierda.
  const pts = pointsVoxel[0][0] > pointsVoxel[pointsVoxel.length - 1][0] ? pointsVoxel.slice().reverse() : pointsVoxel;
  const path = samplePath(pts.map(([x, y]) => [x * sx, y * sy]), step);
  // Normales hacia el interior del arco (lingual/palatino).
  const cx = path.points.reduce((a, p) => a + p[0], 0) / path.points.length;
  const cy = path.points.reduce((a, p) => a + p[1], 0) / path.points.length;
  const inward = path.points.reduce((a, p, i) => a + path.normals[i][0] * (cx - p[0]) + path.normals[i][1] * (cy - p[1]), 0);
  if (inward < 0) path.normals = path.normals.map(([a, b]) => [-a, -b]);
  const w = path.points.length;
  const h = vol.nz;
  const out = new Int16Array(w * h);
  const half = thickness / 2;
  const offsets = [];
  for (let o = -half; o <= half + 1e-6; o += step) offsets.push(o);
  if (!offsets.length) offsets.push(0);

  for (let c = 0; c < w; c++) {
    const [px, py] = path.points[c];
    const [nxv, nyv] = path.normals[c];
    for (let r = 0; r < h; r++) {
      const z = h - 1 - r;
      let acc = mode === 'mip' ? -32768 : 0;
      let count = 0;
      for (const o of offsets) {
        const v = sampleXY(vol, px + nxv * o, py + nyv * o, z);
        if (v === null) continue;
        if (mode === 'mip') { if (v > acc) acc = v; } else acc += v;
        count++;
      }
      out[r * w + c] = count ? (mode === 'mip' ? acc : acc / count) : vol.min;
    }
  }
  const frame = createFrame({
    key,
    width: w,
    height: h,
    data: out,
    min: vol.min,
    max: vol.max,
    wl: vol.wl,
    invert: vol.invert,
    spacing: [step, sz],
    spacingSource: 'dicom',
    units: vol.units,
    meta: vol.meta
  });
  return { frame, path };
}

// Corte transversal (perpendicular a la curva) en la posición "index" de la ruta.
// keyPrefix distingue los cortes de curvas distintas.
export function crossSection(vol, path, index, { halfWidth = 15, keyPrefix = 'cross' } = {}) {
  const sz = vol.spacing[2];
  const step = path.step;
  index = Math.max(0, Math.min(path.points.length - 1, Math.round(index)));
  const [px, py] = path.points[index];
  const [nxv, nyv] = path.normals[index];
  const w = Math.round((2 * halfWidth) / step) + 1;
  const h = vol.nz;
  const out = new Int16Array(w * h);
  for (let c = 0; c < w; c++) {
    // Columna 0 = lado vestibular (exterior del arco); las normales apuntan hacia lingual.
    const o = -halfWidth + c * step;
    for (let r = 0; r < h; r++) {
      const v = sampleXY(vol, px + nxv * o, py + nyv * o, h - 1 - r);
      out[r * w + c] = v === null ? vol.min : v;
    }
  }
  return createFrame({
    key: keyPrefix + ':' + index,
    width: w,
    height: h,
    data: out,
    min: vol.min,
    max: vol.max,
    wl: vol.wl,
    invert: vol.invert,
    spacing: [step, sz],
    spacingSource: 'dicom',
    units: vol.units,
    meta: vol.meta
  });
}
