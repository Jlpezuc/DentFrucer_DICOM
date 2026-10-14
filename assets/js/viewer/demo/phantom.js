// Datos sintéticos para el modo demostración: un "fantoma" de maxilar y
// mandíbula con dientes, senos maxilares, vía aérea y un implante.
// A partir del volumen se generan también una panorámica, una cefalometría
// lateral y radiografías periapicales, para mostrar cada tipo de visor sin
// usar datos de pacientes reales.

import { createFrame } from '../data/frame.js';
import { createVolume, reconstructPanoramic } from '../data/volume.js';

const SP = 0.5; // mm por vóxel
const NX = 192, NY = 176, NZ = 150;
const OCCLUSAL = 34; // altura del plano oclusal (mm)

let cache = null;

// Arco dental: elipse abierta hacia posterior. θ en grados, 0 = incisivos.
const arch = (deg) => {
  const t = (deg * Math.PI) / 180;
  return [48 + 31 * Math.sin(t), 63 - 46 * Math.cos(t)];
};

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Dientes de una arcada (14). Ancho mesiodistal y vestíbulo-lingual en mm.
function teeth(upper) {
  const widths = [8.5, 6.5, 7.5, 7, 7, 10, 10]; // incisivo central → segundo molar
  const bl = [6.5, 6, 7.5, 8, 8.5, 10.5, 10];
  const list = [];
  for (const side of [-1, 1]) {
    let angle = 0;
    for (let i = 0; i < 7; i++) {
      const dAngle = (widths[i] / 2) / 0.62; // mm → grados aprox. (radio medio ~36 mm)
      angle += dAngle;
      list.push({ theta: side * angle, w: widths[i] * 0.92, bl: bl[i], molar: i >= 5, index: i, side, upper });
      angle += dAngle;
    }
  }
  return list;
}

const mix = (a, b, t) => a + (b - a) * t;
// Transición suave de 0 a 1 según la distancia (mm) al borde, positiva hacia adentro.
const edge = (inside, width = 0.7) => { const t = inside / width + 0.5; return t <= 0 ? 0 : t >= 1 ? 1 : t; };
// Distancia aproximada (mm) al borde de un elipsoide, positiva adentro.
function ellipsoidInside(dx, dy, dz, a, b, c) {
  const s = Math.sqrt((dx / a) ** 2 + (dy / b) ** 2 + (dz / c) ** 2) || 1e-6;
  const g = Math.hypot(dx / (a * a), dy / (b * b), dz / (c * c)) / s || 1e-6;
  return (1 - s) / g;
}

// Desenfoque separable [1 2 1] en los tres ejes.
function blur3(data, nx, ny, nz) {
  const tmp = new Float32Array(data.length);
  const pass = (src, dst, stride, n, len) => {
    for (let i = 0; i < src.length; i++) {
      const k = Math.floor(i / stride) % len;
      const a = k > 0 ? src[i - stride] : src[i];
      const b = k < len - 1 ? src[i + stride] : src[i];
      dst[i] = (a + 2 * src[i] + b) / 4;
    }
  };
  pass(data, tmp, 1, 0, nx);
  const tmp2 = new Float32Array(data.length);
  pass(tmp, tmp2, nx, 0, ny);
  pass(tmp2, tmp, nx * ny, 0, nz);
  for (let i = 0; i < data.length; i++) data[i] = tmp[i];
}

export async function buildPhantom(onProgress = () => {}) {
  if (cache) return cache;
  const data = new Int16Array(NX * NY * NZ);
  const rand = rng(7);

  // Mapas 2D: distancia al arco (con signo: + hacia fuera) y ángulo del punto más cercano.
  const samples = [];
  for (let d = -112; d <= 112; d += 0.5) samples.push([d, ...arch(d)]);
  const dist = new Float32Array(NX * NY);
  const theta = new Float32Array(NX * NY);
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
      const px = x * SP, py = y * SP;
      let best = Infinity, bt = 0, bi = 0;
      for (let i = 0; i < samples.length; i += 4) {
        const dd = (samples[i][1] - px) ** 2 + (samples[i][2] - py) ** 2;
        if (dd < best) { best = dd; bi = i; }
      }
      for (let i = Math.max(0, bi - 4); i < Math.min(samples.length, bi + 5); i++) {
        const dd = (samples[i][1] - px) ** 2 + (samples[i][2] - py) ** 2;
        if (dd <= best) { best = dd; bt = samples[i][0]; bi = i; }
      }
      const [, ax, ay] = samples[bi];
      // Signo: fuera del arco = lejos del centro (48, 63)
      const out = Math.hypot(px - 48, py - 63) > Math.hypot(ax - 48, ay - 63) ? 1 : -1;
      dist[y * NX + x] = Math.sqrt(best) * out;
      theta[y * NX + x] = bt;
    }
  }

  const allTeeth = [...teeth(false), ...teeth(true)];
  const missing = (t) => !t.upper && t.side === 1 && t.index === 5; // primer molar inferior izquierdo ausente
  const implant = (t) => t.upper && t.side === -1 && t.index === 5;  // implante en primer molar superior derecho

  for (let z = 0; z < NZ; z++) {
    const pz = z * SP;
    for (let y = 0; y < NY; y++) {
      const py = y * SP;
      for (let x = 0; x < NX; x++) {
        const px = x * SP;
        const i2 = y * NX + x;
        const d = dist[i2];
        const th = theta[i2];
        let v = -1000;
        const ath = Math.abs(th);

        // Tejidos blandos de la cara
        v = mix(v, 35, edge(ellipsoidInside(px - 48, py - 58, pz - 40, 47, 62, 70)));
        // Vía aérea (faringe)
        v = mix(v, -950, edge(Math.min(7 - Math.hypot(px - 48, (py - 82) * 1.4), 64 - pz)));
        // Lengua
        if (ath < 95) v = mix(v, 55, edge(Math.min(-3 - d, pz - 18, 31 - pz)));

        // Mandíbula (cortical por fuera, esponjosa por dentro)
        const ad = Math.abs(d);
        let half = 3.6 + (27 - pz) * 0.2;
        let t = edge(Math.min(half - ad, pz - 6, 27 - pz)) * edge((104 - ath) * 0.6);
        if (t > 0) {
          let bone = mix(1350, 380, edge(half - 1.3 - ad));
          bone = mix(1350, bone, edge(pz - 8));
          v = mix(v, bone, t);
        }
        // Ramas mandibulares
        t = edge(Math.min(3.5 - ad, pz - 20, 60 - pz)) * edge((ath - 96) * 0.6) * edge((112 - ath) * 0.6);
        if (t > 0) v = mix(v, mix(1300, 420, edge(2.3 - ad)), t);

        // Maxilar y paladar
        half = 3.4 + (pz - 41.5) * 0.25;
        t = edge(Math.min(half - ad, pz - 41.5, 55 - pz)) * edge((102 - ath) * 0.6);
        if (t > 0) v = mix(v, mix(1250, 360, edge(half - 1.2 - ad)), t);
        t = edge(Math.min(-d, pz - 48, 51.5 - pz)) * edge((102 - ath) * 0.6);
        if (t > 0) v = mix(v, mix(1150, 450, edge(Math.min(50.3 - pz, pz - 49.2))), t);

        // Senos maxilares (aire con pared ósea fina)
        for (const sx of [27, 69]) {
          const ins = ellipsoidInside(px - sx, py - 50, pz - 60, 13, 15, 10);
          if (ins > -1) v = mix(mix(v, 380, edge(ins)), -920, edge(ins - 1.4));
        }
        // Cavidad nasal con tabique
        const nasal = edge(Math.min(7 - Math.abs(px - 48), py - 12, 70 - py, pz - 50, 68 - pz));
        if (nasal > 0) v = mix(mix(v, -900, nasal), 300, edge(0.8 - Math.abs(px - 48)) * nasal);

        data[(z * NY + y) * NX + x] = v;
      }
    }
    if (z % 10 === 0) { onProgress(z / NZ * 0.7); await new Promise((r) => setTimeout(r)); }
  }

  // Dientes (se dibujan después para quedar sobre el hueso).
  for (const t of allTeeth) {
    if (missing(t)) continue;
    const [cx, cy] = arch(t.theta);
    const tangent = arch(t.theta + 0.5);
    let tx = tangent[0] - cx, ty = tangent[1] - cy;
    const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const crown = t.upper ? [OCCLUSAL + 0.6, OCCLUSAL + 8.5] : [OCCLUSAL - 8.5, OCCLUSAL - 0.6];
    const rootLen = t.molar ? 12 : t.index === 2 ? 17 : 14;
    const root = t.upper ? [crown[1], crown[1] + rootLen] : [crown[0] - rootLen, crown[0]];
    const zMin = Math.min(crown[0], root[0]), zMax = Math.max(crown[1], root[1]);
    const r = Math.max(t.w, t.bl) / 2 + 1;
    for (let z = Math.floor(zMin / SP); z <= Math.ceil(zMax / SP); z++) {
      const pz = z * SP;
      const inCrown = pz >= crown[0] && pz <= crown[1];
      // Estrechamiento de la raíz hacia el ápice
      const tRoot = inCrown ? 0 : t.upper ? (pz - root[0]) / rootLen : (root[1] - pz) / rootLen;
      const scale = inCrown ? 1 : 0.78 - 0.55 * tRoot;
      if (scale <= 0.05) continue;
      for (let y = Math.floor((cy - r) / SP); y <= Math.ceil((cy + r) / SP); y++) {
        for (let x = Math.floor((cx - r) / SP); x <= Math.ceil((cx + r) / SP); x++) {
          if (x < 0 || y < 0 || x >= NX || y >= NY || z < 0 || z >= NZ) continue;
          const dx = x * SP - cx, dy = y * SP - cy;
          const a = (dx * tx + dy * ty) / ((t.w / 2) * scale);  // mesiodistal
          const b = (dx * nx + dy * ny) / ((t.bl / 2) * scale); // vestíbulo-lingual
          const e = a * a + b * b;
          const inside = (1 - Math.sqrt(e)) * (Math.min(t.w, t.bl) / 2) * scale;
          if (inside < -0.6) continue;
          const idx = (z * NY + y) * NX + x;
          if (implant(t) && !inCrown) {
            // Implante de titanio: cilindro con espiras.
            const rr = Math.hypot(dx, dy);
            const thread = 1.9 + 0.25 * Math.sin(pz * 4);
            if (rr < thread && tRoot < 0.85) data[idx] = 3000;
            else if (rr < 2.6) data[idx] = 1250;
            continue;
          }
          let v;
          if (inCrown) v = e > 0.62 ? 2900 : e < 0.12 && Math.abs(pz - (t.upper ? crown[0] : crown[1])) > 4 ? 60 : 1950;
          else v = e < 0.08 ? 60 : e > 0.8 ? 1500 : 1850;
          // Borde suave en la corona/raíz y en los extremos (oclusal y ápice).
          const tz = edge(Math.min(pz - zMin, zMax - pz) + 0.25, 0.5);
          data[idx] = mix(data[idx], v, edge(inside, 0.5) * tz);
        }
      }
    }
  }
  onProgress(0.9);

  // Suavizado (simula el efecto de volumen parcial de un equipo real).
  blur3(data, NX, NY, NZ);
  await new Promise((r) => setTimeout(r));

  // Ruido de adquisición
  for (let i = 0; i < data.length; i++) data[i] += (rand() + rand() + rand() - 1.5) * 30;

  const vol = createVolume({
    nx: NX, ny: NY, nz: NZ, data,
    spacing: [SP, SP, SP],
    units: 'HU',
    wl: { c: 700, w: 3200 },
    meta: { demo: true }
  });
  // Curva del arco (en vóxeles axiales) para las imágenes 2D derivadas.
  const curve = [];
  for (let d = -100; d <= 100; d += 20) { const [x, y] = arch(d); curve.push([x / SP, y / SP]); }
  cache = { vol, curve };
  onProgress(1);
  return cache;
}

// Normaliza un frame reconstruido a valores "de detector" (sin HU).
function asRadiograph(src, label, spacing) {
  const d = src.data;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < d.length; i++) { if (d[i] < min) min = d[i]; if (d[i] > max) max = d[i]; }
  const out = new Uint16Array(d.length);
  for (let i = 0; i < d.length; i++) out[i] = ((d[i] - min) / (max - min)) * 4095;
  return createFrame({ width: src.width, height: src.height, data: out, spacing, spacingSource: 'detector', label, meta: { demo: true } });
}

function crop(frame, x0, y0, w, h, label) {
  const out = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = frame.data[(y0 + y) * frame.width + x0 + x];
  return createFrame({ width: w, height: h, data: out, spacing: frame.spacing, spacingSource: 'detector', label, meta: { demo: true } });
}

function lateralProjection(vol) {
  const { nx, ny, nz, data } = vol;
  const out = new Float32Array(ny * nz);
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      let s = 0;
      for (let x = 0; x < nx; x++) { const v = data[(z * ny + y) * nx + x] + 1000; s += v > 0 ? v : 0; }
      // Perfil mirando a la derecha: anterior a la derecha
      out[(nz - 1 - z) * ny + (ny - 1 - y)] = s;
    }
  }
  return { width: ny, height: nz, data: out };
}

// Datos de demostración según el tipo de examen (profiles.examKind; mismo
// formato que loadStudy).
export async function demoStudyData(kind, onProgress) {
  const { vol, curve } = await buildPhantom(onProgress);
  const result = { volumes: [], images: [], documents: [], warnings: [] };
  if (kind === 'cbct') { result.volumes.push(vol); return result; }

  const pano = asRadiograph(reconstructPanoramic(vol, curve, { thickness: 18, mode: 'avg' }).frame, 'Panorámica', [SP, SP]);
  if (kind === 'pano') result.images.push(pano);
  else if (kind === 'ceph') result.images.push(asRadiograph(lateralProjection(vol), 'Cefalometría lateral', [SP, SP]));
  else if (kind === 'intraoral') {
    const w = 70, h = 90;
    const cols = [0.2, 0.4, 0.6, 0.8];
    cols.forEach((c, i) => result.images.push(crop(pano, Math.round(pano.width * c - w / 2), Math.round(pano.height / 2 - h / 2), w, h, 'Periapical ' + (i + 1))));
  } else {
    result.images.push(pano, asRadiograph(lateralProjection(vol), 'Cefalometría lateral', [SP, SP]));
  }
  return result;
}
