// Lector de archivos DICOM (Parte 10).
//
// Soporta: Explicit/Implicit VR Little Endian, Explicit VR Big Endian,
// Deflated, secuencias (SQ) con longitud definida o indefinida y datos de
// píxel encapsulados (comprimidos). La decodificación de píxeles está en
// dicom-pixels.js.

import { tagName, tagVR } from './dicom-dictionary.js';

const UNDEFINED = 0xffffffff;
// VR cuyo campo de longitud ocupa 4 bytes en Explicit VR.
const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'SV', 'UC', 'UN', 'UR', 'UT', 'UV']);
const BINARY_VR = { US: 2, SS: 2, UL: 4, SL: 4, FL: 4, FD: 8, AT: 4 };

export const TS = {
  IMPLICIT_LE: '1.2.840.10008.1.2',
  EXPLICIT_LE: '1.2.840.10008.1.2.1',
  DEFLATED: '1.2.840.10008.1.2.1.99',
  EXPLICIT_BE: '1.2.840.10008.1.2.2',
  JPEG_BASELINE: '1.2.840.10008.1.2.4.50',
  RLE: '1.2.840.10008.1.2.5'
};

const hex4 = (n) => n.toString(16).padStart(4, '0');

// ---------------------------------------------------------------------------
// Dataset: acceso a los valores de los elementos
// ---------------------------------------------------------------------------
export class DicomDataset {
  constructor(elements, opts) {
    this.elements = elements; // Map tag -> elemento
    this.littleEndian = opts.littleEndian;
    this.transferSyntax = opts.transferSyntax;
    this.charset = opts.charset || 'latin1';
  }

  has(tag) { return this.elements.has(tag); }
  element(tag) { return this.elements.get(tag); }

  bytes(tag) {
    const e = this.elements.get(tag);
    return e ? new Uint8Array(e.view.buffer, e.view.byteOffset + e.offset, e.length) : null;
  }

  string(tag) {
    const e = this.elements.get(tag);
    if (!e || BINARY_VR[e.vr]) return e ? String(this.number(tag)) : '';
    const decoder = new TextDecoder(this.charset === 'utf-8' ? 'utf-8' : 'latin1');
    return decoder.decode(this.bytes(tag)).replace(/[\0\s]+$/, '').replace(/^\s+/, '');
  }

  strings(tag) {
    const s = this.string(tag);
    return s ? s.split('\\').map((x) => x.trim()) : [];
  }

  numbers(tag) {
    const e = this.elements.get(tag);
    if (!e) return [];
    const size = BINARY_VR[e.vr];
    if (!size) return this.strings(tag).map(Number).filter((n) => !Number.isNaN(n));
    const out = [];
    const v = e.view;
    for (let i = 0; i + size <= e.length; i += size) {
      const o = e.offset + i;
      const le = this.littleEndian;
      switch (e.vr) {
        case 'US': out.push(v.getUint16(o, le)); break;
        case 'SS': out.push(v.getInt16(o, le)); break;
        case 'UL': out.push(v.getUint32(o, le)); break;
        case 'SL': out.push(v.getInt32(o, le)); break;
        case 'FL': out.push(v.getFloat32(o, le)); break;
        case 'FD': out.push(v.getFloat64(o, le)); break;
        default: out.push(v.getUint32(o, le));
      }
    }
    return out;
  }

  number(tag, index = 0, fallback = undefined) {
    const n = this.numbers(tag)[index];
    return n === undefined ? fallback : n;
  }

  // Ítems de una secuencia como datasets.
  sequence(tag) {
    const e = this.elements.get(tag);
    if (!e || !e.items) return [];
    return e.items.map((m) => new DicomDataset(m, this));
  }

  // Busca una etiqueta dentro de una secuencia anidada: path = [sq, sq, ..., tag]
  nested(path, index = 0) {
    let ds = this;
    for (let i = 0; i < path.length - 1; i++) {
      const items = ds.sequence(path[i]);
      if (!items.length) return null;
      ds = items[i === 0 ? Math.min(index, items.length - 1) : 0];
    }
    return ds.has(path[path.length - 1]) ? ds : null;
  }

  // Lista legible de todas las etiquetas de primer nivel (panel de información).
  describe() {
    const out = [];
    for (const [tag, e] of this.elements) {
      let value;
      if (tag === '7fe00010') value = e.fragments ? e.fragments.length + ' fragmento(s) comprimidos' : (e.length / 1024).toFixed(0) + ' KB';
      else if (e.items) value = e.items.length + ' elemento(s)';
      else if (BINARY_VR[e.vr]) value = this.numbers(tag).slice(0, 8).map((n) => +n.toFixed(4)).join(' \\ ');
      else if (['OB', 'OW', 'OF', 'OD', 'UN'].includes(e.vr) && e.length > 64) value = e.length + ' bytes';
      else value = this.string(tag);
      if (value.length > 120) value = value.slice(0, 117) + '…';
      out.push({ tag: '(' + tag.slice(0, 4) + ',' + tag.slice(4) + ')', name: tagName(tag), vr: e.vr, value });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Lectura de elementos
// ---------------------------------------------------------------------------
function readTag(view, pos, le) {
  return hex4(view.getUint16(pos, le)) + hex4(view.getUint16(pos + 2, le));
}

function isVR(view, pos) {
  const a = view.getUint8(pos);
  const b = view.getUint8(pos + 1);
  return a >= 65 && a <= 90 && b >= 65 && b <= 90;
}

// Lee elementos desde start hasta end (o hasta un delimitador de ítem).
// Devuelve la posición final.
// stopBefore(tag): si devuelve true, se detiene antes de ese elemento.
function parseElements(view, start, end, opts, elements, untilItemDelimiter = false, stopBefore = null) {
  const { explicit, le } = opts;
  let pos = start;
  while (pos + 8 <= end) {
    const tag = readTag(view, pos, le);
    if (stopBefore && stopBefore(tag)) return pos;
    if (tag === 'fffee00d') return pos + 8; // fin de ítem de longitud indefinida
    if (tag === 'fffee0dd') return pos + 8;

    let vr;
    let length;
    let header;
    if (explicit && isVR(view, pos + 4)) {
      vr = String.fromCharCode(view.getUint8(pos + 4), view.getUint8(pos + 5));
      if (LONG_VR.has(vr)) { length = view.getUint32(pos + 8, le); header = 12; }
      else { length = view.getUint16(pos + 6, le); header = 8; }
    } else {
      vr = tagVR(tag);
      length = view.getUint32(pos + 4, le);
      header = 8;
    }
    const valueStart = pos + header;

    if (tag === '7fe00010' && length === UNDEFINED) {
      const el = { tag, vr, view, offset: valueStart, length: 0, fragments: [] };
      pos = parseFragments(view, valueStart, end, le, el);
      elements.set(tag, el);
      continue;
    }

    const isSequence = vr === 'SQ' || (length === UNDEFINED && vr !== 'SQ');
    if (isSequence) {
      const el = { tag, vr: 'SQ', view, offset: valueStart, length, items: [] };
      // Un "UN" de longitud indefinida se codifica como Implicit VR LE.
      const itemOpts = vr === 'UN' ? { explicit: false, le: true } : opts;
      const seqEnd = length === UNDEFINED ? end : Math.min(end, valueStart + length);
      pos = parseSequence(view, valueStart, seqEnd, itemOpts, el, length === UNDEFINED);
      elements.set(tag, el);
      continue;
    }

    if (length === UNDEFINED || valueStart + length > end) {
      // Archivo truncado o corrupto: se guarda lo que haya y se termina.
      elements.set(tag, { tag, vr, view, offset: valueStart, length: Math.max(0, end - valueStart) });
      return end;
    }
    elements.set(tag, { tag, vr, view, offset: valueStart, length });
    pos = valueStart + length;
  }
  return untilItemDelimiter ? pos : Math.min(pos, end);
}

function parseSequence(view, start, end, opts, el, undefinedLength) {
  let pos = start;
  while (pos + 8 <= end) {
    const tag = readTag(view, pos, opts.le);
    const len = view.getUint32(pos + 4, opts.le);
    if (tag === 'fffee0dd') return pos + 8; // fin de secuencia
    if (tag !== 'fffee000') {
      // No es un ítem: secuencia mal formada, se abandona.
      return undefinedLength ? end : end;
    }
    const itemStart = pos + 8;
    const items = new Map();
    if (len === UNDEFINED) {
      pos = parseElements(view, itemStart, end, opts, items, true);
    } else {
      parseElements(view, itemStart, Math.min(end, itemStart + len), opts, items);
      pos = itemStart + len;
    }
    el.items.push(items);
  }
  return undefinedLength ? pos : end;
}

function parseFragments(view, start, end, le, el) {
  let pos = start;
  let first = true;
  while (pos + 8 <= end) {
    const tag = readTag(view, pos, le);
    const len = view.getUint32(pos + 4, le);
    if (tag === 'fffee0dd') return pos + 8;
    if (tag !== 'fffee000') return end;
    const fragStart = pos + 8;
    const fragLen = Math.min(len, end - fragStart);
    if (first) {
      // Tabla de desplazamientos básica (puede estar vacía).
      el.offsetTable = [];
      for (let i = 0; i + 4 <= fragLen; i += 4) el.offsetTable.push(view.getUint32(fragStart + i, le));
      el.firstFragmentPos = fragStart + fragLen;
      first = false;
    } else {
      el.fragments.push({ offset: fragStart, length: fragLen, position: pos - el.firstFragmentPos });
    }
    pos = fragStart + len;
  }
  return end;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir archivos DICOM "deflated".');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

// ¿Parece un archivo DICOM? (con preámbulo "DICM" o empezando por un grupo típico)
export function looksLikeDicom(buffer) {
  const u8 = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 140));
  if (u8.length >= 132 && u8[128] === 0x44 && u8[129] === 0x49 && u8[130] === 0x43 && u8[131] === 0x4d) return true;
  if (u8.length < 8) return false;
  const group = u8[0] | (u8[1] << 8);
  return group === 0x0002 || group === 0x0008;
}

export async function parseDicom(buffer) {
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  let pos = 0;
  const meta = new Map();
  if (buffer.byteLength >= 132 && u8[128] === 0x44 && u8[129] === 0x49 && u8[130] === 0x43 && u8[131] === 0x4d) {
    pos = 132;
  }

  // Grupo 0002 (siempre Explicit VR Little Endian)
  if (pos + 8 <= buffer.byteLength && view.getUint16(pos, true) === 0x0002) {
    pos = parseElements(view, pos, buffer.byteLength, { explicit: true, le: true }, meta, false, (tag) => !tag.startsWith('0002'));
  }

  const metaDs = new DicomDataset(meta, { littleEndian: true });
  let ts = metaDs.string('00020010');
  if (!ts) {
    // Sin meta: se deduce si es explícito mirando si hay un VR válido.
    ts = pos + 6 <= buffer.byteLength && isVR(view, pos + 4) ? TS.EXPLICIT_LE : TS.IMPLICIT_LE;
  }

  let dataView = view;
  let dataStart = pos;
  if (ts === TS.DEFLATED) {
    const inflated = await inflateRaw(u8.subarray(pos));
    dataView = new DataView(inflated.buffer);
    dataStart = 0;
  }

  const opts = {
    explicit: ts !== TS.IMPLICIT_LE,
    le: ts !== TS.EXPLICIT_BE
  };
  const elements = new Map(meta);
  parseElements(dataView, dataStart, dataView.byteLength, opts, elements);

  const ds = new DicomDataset(elements, { littleEndian: opts.le, transferSyntax: ts });
  // Las etiquetas de meta son siempre LE; si el resto es BE, se releen bien igualmente
  // porque las cadenas no dependen del orden de bytes.
  const charset = ds.string('00080005');
  if (/ISO_IR 192/i.test(charset)) ds.charset = 'utf-8';
  return ds;
}

// Formatea nombres DICOM ("APELLIDO^NOMBRE") y fechas (YYYYMMDD).
export function formatPersonName(pn) {
  if (!pn) return '';
  const [family, given] = pn.split('=')[0].split('^');
  return [given, family].filter(Boolean).join(' ').trim();
}

export function formatDicomDate(da) {
  if (!da || da.length < 8) return da || '';
  return da.slice(6, 8) + '/' + da.slice(4, 6) + '/' + da.slice(0, 4);
}
