import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signFor, validSignature } from '../src/signature.js';

const secret = 'clave-secreta';
const ts = '1704908010';

test('firma válida (id alfanumérico en minúsculas)', () => {
  const xSignature = signFor({ secret, dataId: 'ORD01ABC', xRequestId: 'req-1', ts });
  assert.equal(validSignature({ secret, xSignature, xRequestId: 'req-1', dataId: 'ORD01ABC' }), true);
});

test('firma con otra clave, otro id u otro request-id: inválida', () => {
  const xSignature = signFor({ secret, dataId: 'ORD01ABC', xRequestId: 'req-1', ts });
  assert.equal(validSignature({ secret: 'otra', xSignature, xRequestId: 'req-1', dataId: 'ORD01ABC' }), false);
  assert.equal(validSignature({ secret, xSignature, xRequestId: 'req-1', dataId: 'ORD02' }), false);
  assert.equal(validSignature({ secret, xSignature, xRequestId: 'req-2', dataId: 'ORD01ABC' }), false);
});

test('sin cabecera, sin clave o con formato malo: inválida', () => {
  assert.equal(validSignature({ secret, xSignature: '', xRequestId: 'r', dataId: 'x' }), false);
  assert.equal(validSignature({ secret: '', xSignature: signFor({ secret, dataId: 'x', xRequestId: 'r', ts }), xRequestId: 'r', dataId: 'x' }), false);
  assert.equal(validSignature({ secret, xSignature: 'v1=abc', xRequestId: 'r', dataId: 'x' }), false);
});

test('tolerancia de tiempo', () => {
  const xSignature = signFor({ secret, dataId: 'x', xRequestId: 'r', ts });
  assert.equal(validSignature({ secret, xSignature, xRequestId: 'r', dataId: 'x', toleranceSeconds: 300, now: (Number(ts) + 100) * 1000 }), true);
  assert.equal(validSignature({ secret, xSignature, xRequestId: 'r', dataId: 'x', toleranceSeconds: 300, now: (Number(ts) + 1000) * 1000 }), false);
});
