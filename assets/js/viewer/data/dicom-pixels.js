// Decodificación de los datos de píxel de un DicomDataset a frames del visor.
//
// Formatos soportados: sin compresión (8/16/32 bits, gris o color), RLE Lossless
// y JPEG Baseline (lo decodifica el navegador). Otros formatos comprimidos
// (JPEG Lossless, JPEG-LS, JPEG 2000) lanzan UnsupportedFormatError con un mensaje claro.

import { TS } from './dicom-parser.js';
import { UID_NAMES } from './dicom-dictionary.js';
import { createFrame } from './frame.js';

export class UnsupportedFormatError extends Error {}

// Información de imagen común a todos los cuadros.
export function imageInfo(ds) {
  const rows = ds.number('00280010', 0, 0);
  const cols = ds.number('00280011', 0, 0);
  const shared = (tag, sq) => ds.nested(['52009229', sq, tag]);
  const perFrame = (i, sq, tag) => ds.nested(['52009230', sq, tag], i);

  // Reescala (también dentro de grupos funcionales en imágenes "enhanced").
  const rescaleDs = ds.has('00281053') ? ds : shared('00281053', '00289145');
  let slope = rescaleDs ? rescaleDs.number('00281053', 0, 1) : 1;
  let intercept = rescaleDs ? rescaleDs.number('00281052', 0, 0) : 0;
  if (!slope) slope = 1;

  // Espaciado de píxel: calibrado > detector (corrigiendo magnificación si se conoce).
  let spacing = null;
  let spacingSource = null;
  const ps = ds.has('00280030') ? ds : shared('00280030', '00289110');
  if (ps) {
    const [row, col] = ps.numbers('00280030');
    if (row > 0 && col > 0) { spacing = [col, row]; spacingSource = 'dicom'; }
  }
  if (!spacing && ds.has('00181164')) {
    const [row, col] = ds.numbers('00181164');
    const mag = ds.number('00181114', 0, 1) || 1;
    if (row > 0 && col > 0) { spacing = [col / mag, row / mag]; spacingSource = 'detector'; }
  }

  const wlDs = ds.has('00281050') ? ds : shared('00281050', '00289132');
  const wc = wlDs ? wlDs.number('00281050') : undefined;
  const ww = wlDs ? wlDs.number('00281051') : undefined;

  const modality = ds.string('00080060');
  return {
    rows,
    cols,
    frames: Math.max(1, ds.number('00280008', 0, 1)),
    bitsAllocated: ds.number('00280100', 0, 16),
    bitsStored: ds.number('00280101', 0, ds.number('00280100', 0, 16)),
    pixelRepresentation: ds.number('00280103', 0, 0),
    samplesPerPixel: ds.number('00280002', 0, 1),
    photometric: ds.string('00280004') || 'MONOCHROME2',
    planar: ds.number('00280006', 0, 0),
    slope,
    intercept,
    wl: ww > 1 ? { c: wc, w: ww } : null,
    spacing,
    spacingSource,
    modality,
    units: modality === 'CT' ? 'HU' : '',
    perFrame
  };
}

export function hasPixelData(ds) {
  return ds.has('7fe00010') && ds.number('00280010', 0, 0) > 0;
}

// Bytes comprimidos del cuadro "index" en datos encapsulados.
function frameFragments(el, index, frames) {
  const frags = el.fragments;
  if (!frags.length) return null;
  const join = (list) => {
    if (list.length === 1) return new Uint8Array(el.view.buffer, el.view.byteOffset + list[0].offset, list[0].length);
    const total = list.reduce((n, f) => n + f.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const f of list) { out.set(new Uint8Array(el.view.buffer, el.view.byteOffset + f.offset, f.length), o); o += f.length; }
    return out;
  };
  if (frames === 1) return join(frags);
  if (frags.length === frames) return join([frags[index]]);
  const table = el.offsetTable || [];
  if (table.length === frames) {
    const start = table[index];
    const end = index + 1 < frames ? table[index + 1] : Infinity;
    return join(frags.filter((f) => f.position >= start && f.position < end));
  }
  // Sin tabla: cada cuadro JPEG empieza con el marcador FFD8.
  const groups = [];
  for (const f of frags) {
    const b = new Uint8Array(el.view.buffer, el.view.byteOffset + f.offset, 2);
    if (!groups.length || (b[0] === 0xff && b[1] === 0xd8)) groups.push([]);
    groups[groups.length - 1].push(f);
  }
  return groups[index] ? join(groups[index]) : null;
}

function decodeRle(bytes, info) {
  const { rows, cols, bitsAllocated, samplesPerPixel } = info;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segments = view.getUint32(0, true);
  const offsets = [];
  for (let i = 0; i < segments; i++) offsets.push(view.getUint32(4 + i * 4, true));
  const pixels = rows * cols;
  const bytesPerSample = bitsAllocated / 8;
  const out = new Uint8Array(pixels * samplesPerPixel * bytesPerSample);
  for (let s = 0; s < segments; s++) {
    const start = offsets[s];
    const end = s + 1 < segments ? offsets[s + 1] : bytes.length;
    // Segmento s: muestra = floor(s / bytesPerSample); byte = más significativo primero.
    const sample = Math.floor(s / bytesPerSample);
    const byteIndex = bytesPerSample - 1 - (s % bytesPerSample); // little endian en la salida
    let p = start;
    let px = 0;
    const stride = samplesPerPixel * bytesPerSample;
    const base = sample * bytesPerSample + byteIndex;
    while (p < end && px < pixels) {
      const n = (bytes[p] << 24) >> 24; // con signo
      p++;
      if (n >= 0) {
        for (let k = 0; k <= n && px < pixels; k++) out[base + (px++) * stride] = bytes[p++];
      } else if (n !== -128) {
        const v = bytes[p++];
        for (let k = 0; k < 1 - n && px < pixels; k++) out[base + (px++) * stride] = v;
      }
    }
  }
  return out;
}

async function decodeJpegInBrowser(bytes) {
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Convierte bytes crudos (little endian) al TypedArray adecuado.
function typedPixels(bytes, info, littleEndian) {
  const { bitsAllocated, pixelRepresentation, bitsStored } = info;
  const signed = pixelRepresentation === 1;
  if (bitsAllocated === 8) return signed ? new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length) : bytes;
  const size = bitsAllocated / 8;
  let src = bytes;
  if (src.byteOffset % size !== 0 || !littleEndian) {
    src = new Uint8Array(bytes); // copia alineada
    if (!littleEndian) {
      for (let i = 0; i < src.length; i += size) {
        for (let a = i, b = i + size - 1; a < b; a++, b--) { const t = src[a]; src[a] = src[b]; src[b] = t; }
      }
    }
  }
  let arr;
  if (bitsAllocated === 16) arr = signed ? new Int16Array(src.buffer, src.byteOffset, src.length / 2) : new Uint16Array(src.buffer, src.byteOffset, src.length / 2);
  else if (bitsAllocated === 32) arr = signed ? new Int32Array(src.buffer, src.byteOffset, src.length / 4) : new Uint32Array(src.buffer, src.byteOffset, src.length / 4);
  else throw new UnsupportedFormatError('Imágenes de ' + bitsAllocated + ' bits no soportadas.');

  // Bits almacenados menores que asignados: limpiar bits altos y extender signo.
  if (bitsStored < bitsAllocated && bitsStored > 0) {
    const mask = (1 << bitsStored) - 1;
    if (!signed) {
      let dirty = false;
      for (let i = 0; i < arr.length; i += 97) if (arr[i] > mask) { dirty = true; break; }
      if (dirty) { arr = arr.slice(); for (let i = 0; i < arr.length; i++) arr[i] &= mask; }
    } else {
      const shift = 32 - bitsStored;
      let dirty = false;
      for (let i = 0; i < arr.length; i += 97) if (((arr[i] << shift) >> shift) !== arr[i]) { dirty = true; break; }
      if (dirty) { arr = arr.slice(); for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] << shift) >> shift; }
    }
  }
  return arr;
}

function toRgba(bytes, info) {
  const { rows, cols, planar, photometric } = info;
  const n = rows * cols;
  const out = new Uint8ClampedArray(n * 4);
  const ybr = photometric.startsWith('YBR');
  for (let i = 0; i < n; i++) {
    let r, g, b;
    if (planar === 1) { r = bytes[i]; g = bytes[n + i]; b = bytes[2 * n + i]; }
    else { r = bytes[i * 3]; g = bytes[i * 3 + 1]; b = bytes[i * 3 + 2]; }
    if (ybr) {
      const y = r, cb = g - 128, cr = b - 128;
      r = y + 1.402 * cr; g = y - 0.344136 * cb - 0.714136 * cr; b = y + 1.772 * cb;
    }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return out;
}

// Decodifica el cuadro "index" y devuelve un frame del visor.
export async function decodeFrame(ds, index = 0, extra = {}) {
  const info = imageInfo(ds);
  const { rows, cols, frames, samplesPerPixel, bitsAllocated } = info;
  const el = ds.element('7fe00010');
  if (!el) throw new Error('El archivo no contiene imagen.');
  const ts = ds.transferSyntax;
  const isColor = samplesPerPixel === 3;
  let data;
  let kind = 'gray';

  if (el.fragments) {
    const bytes = frameFragments(el, index, frames);
    if (!bytes) throw new Error('No se encontró el cuadro ' + (index + 1) + '.');
    if (ts === TS.RLE) {
      const raw = decodeRle(bytes, info);
      if (isColor) { data = toRgba(raw, { ...info, planar: 0 }); kind = 'rgb'; }
      else data = typedPixels(raw, info, true);
    } else if (ts === TS.JPEG_BASELINE || ts === '1.2.840.10008.1.2.4.51') {
      const img = await decodeJpegInBrowser(bytes).catch(() => { throw new UnsupportedFormatError('No se pudo decodificar la imagen JPEG.'); });
      if (isColor) { data = img.data; kind = 'rgb'; }
      else {
        data = new Uint8Array(rows * cols);
        for (let i = 0; i < data.length; i++) data[i] = img.data[i * 4];
      }
      info.slope = info.slope || 1;
    } else {
      throw new UnsupportedFormatError('Formato comprimido no soportado en el navegador: ' + (UID_NAMES[ts] || ts) + '. Descargue el archivo para abrirlo con el software del equipo.');
    }
  } else {
    const bytesPerFrame = rows * cols * samplesPerPixel * (bitsAllocated / 8);
    const start = el.offset + index * bytesPerFrame;
    if (start + bytesPerFrame > el.offset + el.length + 1) throw new Error('Datos de imagen incompletos.');
    const bytes = new Uint8Array(el.view.buffer, el.view.byteOffset + start, Math.min(bytesPerFrame, el.length - index * bytesPerFrame));
    if (isColor) { data = toRgba(bytes, info); kind = 'rgb'; }
    else data = typedPixels(bytes, info, ds.littleEndian);
  }

  // Posición del cuadro (para reconstruir volúmenes).
  let position = ds.numbers('00200032');
  const pf = info.perFrame(index, '00209113', '00200032');
  if (pf) position = pf.numbers('00200032');

  return createFrame({
    width: cols,
    height: rows,
    kind,
    data,
    slope: kind === 'rgb' ? 1 : info.slope,
    intercept: kind === 'rgb' ? 0 : info.intercept,
    wl: kind === 'rgb' ? undefined : info.wl || undefined,
    invert: info.photometric === 'MONOCHROME1',
    spacing: info.spacing,
    spacingSource: info.spacingSource,
    units: kind === 'rgb' ? '' : info.units,
    meta: { dataset: ds, frameIndex: index, position, ...extra }
  });
}
