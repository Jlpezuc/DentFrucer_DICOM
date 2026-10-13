// Carga de un examen: descarga, descompresión de ZIP y clasificación.
//
// Resultado:
//   {
//     volumes:   [volume]                     (CBCT / tomografías)
//     images:    [frame]                      (panorámicas, cefalometrías, periapicales, fotos)
//     documents: [{ name, url }]              (informes PDF; url = blob:)
//     warnings:  [texto]                      (archivos que no se pudieron abrir)
//   }

import { looksLikeDicom, parseDicom } from './dicom-parser.js';
import { decodeFrame, hasPixelData, imageInfo, UnsupportedFormatError } from './dicom-pixels.js';
import { decodeImageFile, sniffType } from './image-file.js';
import { createVolume } from './volume.js';
import { isZip, unzip } from './zip.js';

const MIN_SLICES_FOR_VOLUME = 8;
const MAX_VOXELS = 200e6; // por encima se reduce la resolución en el plano para no agotar la memoria
const CONCURRENCY = 6;

export class DownloadError extends Error {}

// --- Descarga -----------------------------------------------------------------
async function fetchAll(files, onProgress) {
  const results = new Array(files.length);
  let done = 0;
  let bytes = 0;
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const i = next++;
      const f = files[i];
      let res;
      try {
        res = await fetch(f.url);
      } catch (e) {
        throw new DownloadError('No se pudo descargar "' + f.name + '". Si los archivos están en Firebase, revise la configuración CORS del almacenamiento (ver FIREBASE.md).');
      }
      if (!res.ok) throw new DownloadError('No se pudo descargar "' + f.name + '" (error ' + res.status + ').');
      const reader = res.body ? res.body.getReader() : null;
      if (!reader) { results[i] = { name: f.name, buffer: await res.arrayBuffer() }; }
      else {
        const chunks = [];
        let size = 0;
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          chunks.push(value);
          size += value.length;
          bytes += value.length;
          onProgress({ phase: 'download', done, total: files.length, bytes });
        }
        const buf = new Uint8Array(size);
        let o = 0;
        for (const c of chunks) { buf.set(c, o); o += c.length; }
        results[i] = { name: f.name, buffer: buf.buffer };
      }
      done++;
      onProgress({ phase: 'download', done, total: files.length, bytes });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  return results;
}

// --- Construcción de volúmenes -------------------------------------------------
function sliceDistance(ds) {
  const pos = ds.numbers('00200032');
  const iop = ds.numbers('00200037');
  if (pos.length === 3 && iop.length === 6) {
    const n = [iop[1] * iop[5] - iop[2] * iop[4], iop[2] * iop[3] - iop[0] * iop[5], iop[0] * iop[4] - iop[1] * iop[3]];
    return pos[0] * n[0] + pos[1] * n[1] + pos[2] * n[2];
  }
  if (pos.length === 3) return pos[2];
  return ds.number('00201041', 0, ds.number('00200013', 0, 0));
}

function median(values) {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// getSlice(i) -> frame; positions: distancia de cada corte a lo largo de la normal (o null).
async function buildVolume(count, getSlice, positions, ds, onProgress) {
  const first = await getSlice(0);
  let factor = 1;
  while ((first.width / factor) * (first.height / factor) * count > MAX_VOXELS) factor *= 2;
  const nx = Math.floor(first.width / factor);
  const ny = Math.floor(first.height / factor);
  const nz = count;
  const data = new Int16Array(nx * ny * nz);

  for (let z = 0; z < nz; z++) {
    const f = z === 0 ? first : await getSlice(z);
    if (f.width !== first.width || f.height !== first.height) continue;
    const src = f.data;
    const m = f.slope;
    const b = f.intercept;
    const base = z * nx * ny;
    for (let y = 0; y < ny; y++) {
      const row = y * factor * f.width;
      for (let x = 0; x < nx; x++) {
        let v = Math.round(src[row + x * factor] * m + b);
        data[base + y * nx + x] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
      }
    }
    if (z % 8 === 0) {
      onProgress({ phase: 'process', done: z, total: nz });
      await new Promise((r) => setTimeout(r)); // deja respirar a la interfaz
    }
  }

  const [sx, sy] = first.spacing || [1, 1];
  let sz = 0;
  if (positions && positions.length > 1) {
    const diffs = [];
    for (let i = 1; i < positions.length; i++) diffs.push(Math.abs(positions[i] - positions[i - 1]));
    sz = median(diffs);
  }
  if (!(sz > 0)) sz = ds.number('00180088', 0, 0) || ds.number('00180050', 0, 0) || sx;

  return createVolume({
    nx, ny, nz, data,
    spacing: [sx * factor, sy * factor, sz],
    wl: first.wl && first.wl.w > 1 && ds.has('00281050') ? first.wl : undefined,
    invert: first.invert,
    units: first.units,
    meta: { dataset: ds, downsampled: factor > 1 }
  });
}

async function volumeFromSeries(datasets, onProgress) {
  const sorted = datasets.map((ds) => ({ ds, d: sliceDistance(ds) })).sort((a, b) => a.d - b.d);
  const positions = sorted.map((s) => s.d);
  return buildVolume(sorted.length, (i) => decodeFrame(sorted[i].ds, 0), positions, sorted[0].ds, onProgress);
}

async function volumeFromMultiframe(ds, onProgress) {
  const n = imageInfo(ds).frames;
  // Posiciones por cuadro (si existen) para ordenar y calcular el espaciado.
  const order = [];
  for (let i = 0; i < n; i++) {
    const pf = ds.nested(['52009230', '00209113', '00200032'], i);
    order.push({ i, d: pf ? pf.numbers('00200032')[2] : i });
  }
  const hasPositions = order.some((o, k) => k > 0 && o.d !== order[0].d) && ds.has('52009230');
  if (hasPositions) order.sort((a, b) => a.d - b.d);
  return buildVolume(n, (k) => decodeFrame(ds, order[k].i), hasPositions ? order.map((o) => o.d) : null, ds, onProgress);
}

// --- API -----------------------------------------------------------------------
export async function loadStudy(files, onProgress = () => {}) {
  const result = { volumes: [], images: [], documents: [], warnings: [] };
  const downloaded = await fetchAll(files, onProgress);

  // Expandir ZIP
  const entries = [];
  for (const f of downloaded) {
    if (isZip(f.buffer)) {
      onProgress({ phase: 'unzip', name: f.name });
      try { entries.push(...(await unzip(f.buffer))); } catch (e) { result.warnings.push(f.name + ': ' + e.message); }
    } else entries.push(f);
  }

  // Clasificar
  const series = new Map();
  const loose = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const type = sniffType(e.buffer);
    if (type === 'application/pdf') {
      result.documents.push({ name: e.name.split('/').pop(), url: URL.createObjectURL(new Blob([e.buffer], { type })) });
    } else if (type) {
      loose.push(e);
    } else if (looksLikeDicom(e.buffer) || /\.dcm$/i.test(e.name) || !/\.[a-z0-9]{2,4}$/i.test(e.name)) {
      try {
        const ds = await parseDicom(e.buffer);
        if (!hasPixelData(ds)) continue; // DICOMDIR, informes estructurados, etc.
        const uid = ds.string('0020000e') || 'serie';
        const key = uid + '|' + ds.number('00280010') + 'x' + ds.number('00280011');
        if (!series.has(key)) series.set(key, []);
        series.get(key).push(ds);
        ds.fileName = e.name.split('/').pop();
      } catch (err) {
        result.warnings.push(e.name.split('/').pop() + ': no es un DICOM válido.');
      }
    }
    if (i % 20 === 0) onProgress({ phase: 'parse', done: i, total: entries.length });
  }

  for (const list of series.values()) {
    try {
      const info = imageInfo(list[0]);
      const gray = info.samplesPerPixel === 1;
      if (gray && list.length === 1 && info.frames >= MIN_SLICES_FOR_VOLUME) {
        result.volumes.push(await volumeFromMultiframe(list[0], onProgress));
      } else if (gray && list.length >= MIN_SLICES_FOR_VOLUME) {
        result.volumes.push(await volumeFromSeries(list, onProgress));
      } else {
        for (const ds of list) {
          const frames = Math.min(imageInfo(ds).frames, 64);
          for (let k = 0; k < frames; k++) {
            const f = await decodeFrame(ds, k, { fileName: ds.fileName });
            f.label = ds.fileName + (frames > 1 ? ' · ' + (k + 1) : '');
            result.images.push(f);
          }
        }
      }
    } catch (err) {
      if (err instanceof UnsupportedFormatError) result.warnings.push(err.message);
      else result.warnings.push('No se pudo abrir una serie: ' + err.message);
    }
  }

  for (const e of loose) {
    try { result.images.push(await decodeImageFile(e.buffer, sniffType(e.buffer), e.name.split('/').pop())); }
    catch (err) { result.warnings.push(e.name + ': imagen dañada.'); }
  }

  // Orden natural de las imágenes por nombre de archivo.
  result.images.sort((a, b) => (a.label || '').localeCompare(b.label || '', 'es', { numeric: true }));
  return result;
}
