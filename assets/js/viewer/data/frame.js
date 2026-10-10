// "Frame": la imagen 2D que entiende el visor, venga de un DICOM, un PNG/JPG
// o de un corte de un volumen.
//
// {
//   key:        identificador único (para asociar mediciones)
//   width, height
//   kind:       'gray' | 'rgb'
//   data:       gris -> TypedArray (valores crudos); rgb -> Uint8ClampedArray RGBA
//   slope, intercept: valor real = crudo * slope + intercept (p. ej. unidades Hounsfield)
//   min, max:   rango de valores reales
//   wl:         { c, w } ventana inicial
//   invert:     true si se muestra invertida por defecto (MONOCHROME1)
//   spacing:    [mm por píxel en x, mm por píxel en y] o null si no está calibrada
//   spacingSource: 'dicom' | 'detector' | 'calibrated' | null
//   units:      'HU' o '' (unidad de los valores)
//   label:      nombre corto para mostrar
//   meta:       { dataset, fileName, ... } datos extra para el panel de información
// }

let counter = 0;
export const nextKey = (prefix = 'f') => prefix + (++counter);

export function createFrame(props) {
  const frame = {
    key: nextKey(),
    kind: 'gray',
    slope: 1,
    intercept: 0,
    invert: false,
    spacing: null,
    spacingSource: null,
    units: '',
    label: '',
    meta: {},
    ...props
  };
  if (frame.min === undefined || frame.max === undefined) computeRange(frame);
  if (!frame.wl) frame.wl = autoWindow(frame);
  return frame;
}

export function computeRange(frame) {
  if (frame.kind === 'rgb') { frame.min = 0; frame.max = 255; return; }
  const d = frame.data;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === Infinity) { min = 0; max = 1; }
  const a = min * frame.slope + frame.intercept;
  const b = max * frame.slope + frame.intercept;
  frame.min = Math.min(a, b);
  frame.max = Math.max(a, b);
}

// Ventana automática: percentiles 0,5 % y 99,5 % de una muestra de píxeles.
export function autoWindow(frame, lowP = 0.005, highP = 0.995) {
  if (frame.kind === 'rgb') return { c: 127.5, w: 255 };
  const d = frame.data;
  const step = Math.max(1, Math.floor(d.length / 200000));
  const sample = new Float32Array(Math.ceil(d.length / step));
  let n = 0;
  for (let i = 0; i < d.length; i += step) sample[n++] = d[i] * frame.slope + frame.intercept;
  const s = sample.subarray(0, n).sort();
  const lo = s[Math.floor(lowP * (n - 1))];
  const hi = s[Math.floor(highP * (n - 1))];
  const w = Math.max(1, hi - lo);
  return { c: lo + w / 2, w };
}

// Valor real en un píxel (o null fuera de la imagen).
export function valueAt(frame, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= frame.width || yi >= frame.height) return null;
  const i = yi * frame.width + xi;
  if (frame.kind === 'rgb') {
    const d = frame.data;
    return Math.round((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3);
  }
  return frame.data[i] * frame.slope + frame.intercept;
}

// Pinta el frame en un ImageData aplicando ventana/nivel e inversión.
export function renderFrame(frame, wl, invert, imageData) {
  const out = imageData.data;
  const n = frame.width * frame.height;
  const lo = wl.c - wl.w / 2;
  const scale = 255 / Math.max(1e-6, wl.w);
  if (frame.kind === 'rgb') {
    const d = frame.data;
    for (let i = 0; i < n * 4; i += 4) {
      for (let k = 0; k < 3; k++) {
        let v = (d[i + k] - lo) * scale;
        v = v < 0 ? 0 : v > 255 ? 255 : v;
        out[i + k] = invert ? 255 - v : v;
      }
      out[i + 3] = 255;
    }
    return imageData;
  }
  const d = frame.data;
  const m = frame.slope;
  const b = frame.intercept;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    let v = ((d[i] * m + b) - lo) * scale;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (invert) v = 255 - v;
    out[j] = out[j + 1] = out[j + 2] = v;
    out[j + 3] = 255;
  }
  return imageData;
}
