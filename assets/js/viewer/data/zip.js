// Lector mínimo de archivos ZIP (sin compresión o "deflate"), suficiente para
// abrir las exportaciones de exámenes que entregan los equipos de imagen.

export function isZip(buffer) {
  const u8 = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer();
}

// Devuelve [{ name, buffer }] con los archivos del ZIP.
export async function unzip(buffer) {
  const view = new DataView(buffer);
  const len = buffer.byteLength;
  let eocd = -1;
  for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo ZIP está dañado.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count && p + 46 <= len; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/') || name.includes('__MACOSX') || /(^|\/)\./.test(name)) continue;
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const bytes = new Uint8Array(buffer, dataStart, compSize);
    if (method === 0) out.push({ name, buffer: bytes.slice().buffer });
    else if (method === 8) out.push({ name, buffer: await inflate(bytes) });
    // Otros métodos de compresión se ignoran.
  }
  return out;
}
