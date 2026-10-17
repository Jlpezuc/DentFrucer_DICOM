// Firma de las notificaciones (webhooks) de Mercado Pago.
//
// Mercado Pago firma cada aviso con la clave secreta de la aplicación
// (Tus integraciones → Webhooks). Cabeceras:
//   x-signature:  "ts=1704908010,v1=618c8534…"
//   x-request-id: id del aviso
// Se calcula HMAC-SHA256 (hex) de "id:{data.id};request-id:{x-request-id};ts:{ts};"
// (se omite cada par que no venga) y se compara con v1. El data.id va en la
// dirección (?data.id=…); si es alfanumérico, Mercado Pago lo firma en minúsculas.

import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';

function parse(header) {
  const out = {};
  String(header || '').split(',').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  });
  return out;
}

const manifest = (dataId, requestId, ts) =>
  (dataId ? 'id:' + dataId + ';' : '') + (requestId ? 'request-id:' + requestId + ';' : '') + 'ts:' + ts + ';';

const sameHex = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// true si la firma es válida. toleranceSeconds limita la antigüedad del aviso.
export function validSignature({ secret, xSignature, xRequestId, dataId, toleranceSeconds = 0, now = Date.now() }) {
  const { ts, v1 } = parse(xSignature);
  if (!secret || !ts || !v1 || !/^\d+$/.test(ts)) return false;
  if (toleranceSeconds && Math.abs(now / 1000 - Number(ts)) > toleranceSeconds) return false;
  const ids = [...new Set([String(dataId || '').toLowerCase(), String(dataId || '')])];
  return ids.some((id) => sameHex(createHmac('sha256', secret).update(manifest(id, xRequestId, ts)).digest('hex'), v1));
}

// Para pruebas: firma un aviso como lo haría Mercado Pago.
export const signFor = ({ secret, dataId, xRequestId, ts }) =>
  'ts=' + ts + ',v1=' + createHmac('sha256', secret).update(manifest(String(dataId).toLowerCase(), xRequestId, ts)).digest('hex');
