import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMercadoPago, MercadoPagoError } from '../src/mercadopago.js';

function fakeFetch(reply) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = reply(url, init);
    return { ok: status < 300, status, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}

test('crea la orden Point con el monto en pesos enteros y la clave de idempotencia', async () => {
  const f = fakeFetch(() => [201, { id: 'ORD1', status: 'created' }]);
  const mp = createMercadoPago({ accessToken: 'TOKEN', baseUrl: 'https://mp.test', fetchImpl: f });
  const order = await mp.createPointOrder({ terminalId: 'NEWLAND_N950__X1', amount: 45000.4, reference: 'pay1-1', description: 'DentFrucer · CBCT', idempotencyKey: 'pay1-1' });
  assert.equal(order.id, 'ORD1');
  const c = f.calls[0];
  assert.equal(c.url, 'https://mp.test/v1/orders');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers.Authorization, 'Bearer TOKEN');
  assert.equal(c.init.headers['X-Idempotency-Key'], 'pay1-1');
  assert.deepEqual(c.body.transactions, { payments: [{ amount: '45000' }] });
  assert.deepEqual(c.body.config, { point: { terminal_id: 'NEWLAND_N950__X1' } });
  assert.equal(c.body.type, 'point');
  assert.equal(c.body.external_reference, 'pay1-1');
});

test('lista maquinitas y activa el modo PDV', async () => {
  const f = fakeFetch((url, init) => (init.method === 'GET'
    ? [200, { data: { terminals: [{ id: 'T1', operating_mode: 'STANDALONE', pos_id: 3, store_id: '9' }] } }]
    : [200, { terminals: [{ id: 'T1', operating_mode: 'PDV' }] }]));
  const mp = createMercadoPago({ accessToken: 'T', baseUrl: 'https://mp.test', fetchImpl: f });
  assert.deepEqual(await mp.listTerminals(), [{ id: 'T1', operatingMode: 'STANDALONE', posId: 3, storeId: '9', externalPosId: '' }]);
  await mp.setIntegratedMode('T1');
  assert.equal(f.calls[1].url, 'https://mp.test/terminals/v1/setup');
  assert.equal(f.calls[1].init.method, 'PATCH');
  assert.deepEqual(f.calls[1].body, { terminals: [{ id: 'T1', operating_mode: 'PDV' }] });
});

test('los errores traen el código de Mercado Pago', async () => {
  const f = fakeFetch(() => [409, { errors: [{ code: 'already_queued_order_on_terminal', message: 'queued' }] }]);
  const mp = createMercadoPago({ accessToken: 'T', baseUrl: 'https://mp.test', fetchImpl: f });
  await assert.rejects(mp.createPointOrder({ terminalId: 'T1', amount: 1, reference: 'r', idempotencyKey: 'r' }), (e) => e instanceof MercadoPagoError && e.status === 409 && e.code === 'already_queued_order_on_terminal');
});
