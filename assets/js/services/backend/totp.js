// Códigos de un solo uso (TOTP, RFC 6238), como los de Google Authenticator:
// 6 dígitos que cambian cada 30 segundos. Lo usa el modo demostración para
// simular la verificación en dos pasos (en Firebase la verifica el servidor).

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function randomSecret(bytes = 20) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = '';
  data.forEach((b) => { bits += b.toString(2).padStart(8, '0'); });
  return bits.match(/.{1,5}/g).map((c) => BASE32[parseInt(c.padEnd(5, '0'), 2)]).join('');
}

function decode(secret) {
  let bits = '';
  for (const c of secret.toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += BASE32.indexOf(c).toString(2).padStart(5, '0');
  return new Uint8Array((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
}

export async function totpCode(secret, time = Date.now()) {
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(Math.floor(time / 30000)));
  const key = await crypto.subtle.importKey('raw', decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer));
  const o = h[h.length - 1] & 15;
  const n = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6;
  return String(n).padStart(6, '0');
}

// Acepta el código actual y el de 30 s antes o después (relojes desfasados).
export async function verifyTotp(secret, code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  for (const step of [-1, 0, 1]) if ((await totpCode(secret, Date.now() + step * 30000)) === c) return true;
  return false;
}

export const otpauthUri = (secret, account, issuer = 'DentFrucer') =>
  'otpauth://totp/' + encodeURIComponent(issuer + ':' + account) + '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) + '&algorithm=SHA1&digits=6&period=30';
