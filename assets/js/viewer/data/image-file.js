// Imágenes comunes (PNG, JPG, BMP, WEBP) convertidas a frames del visor.

import { createFrame } from './frame.js';

const SIGNATURES = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/bmp', bytes: [0x42, 0x4d] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }
];

export function sniffType(buffer) {
  const u8 = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const hit = SIGNATURES.find((s) => s.bytes.every((b, i) => u8[i] === b));
  return hit ? hit.type : null;
}

export async function decodeImageFile(buffer, type, name) {
  const bitmap = await createImageBitmap(new Blob([buffer], { type }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Si todos los canales son iguales, se trata como imagen en escala de grises.
  const d = img.data;
  let gray = true;
  for (let i = 0; i < d.length; i += 4 * 37) {
    if (d[i] !== d[i + 1] || d[i] !== d[i + 2]) { gray = false; break; }
  }
  let data = d;
  if (gray) {
    data = new Uint8Array(img.width * img.height);
    for (let i = 0; i < data.length; i++) data[i] = d[i * 4];
  }
  return createFrame({
    width: img.width,
    height: img.height,
    kind: gray ? 'gray' : 'rgb',
    data,
    wl: { c: 127.5, w: 255 },
    label: name,
    meta: { fileName: name }
  });
}
