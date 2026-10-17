// Cliente mínimo de la API de Mercado Pago para la maquinita (Point), con la
// API de Órdenes (Orders API), la que Mercado Pago recomienda para Point.
//
//   GET   /terminals/v1/list          maquinitas de la cuenta
//   PATCH /terminals/v1/setup         modo de la maquinita: PDV (integrada) o STANDALONE
//   POST  /v1/orders                  crea la orden: se carga sola en la maquinita
//   GET   /v1/orders/{id}             estado de la orden y de su pago
//   POST  /v1/orders/{id}/cancel      cancela (solo mientras la maquinita no la tomó)
//
// Estados de una orden: created → at_terminal → processed (pagada), o
// canceled | expired | failed | refunded | action_required.

const DEFAULT_BASE = 'https://api.mercadopago.com';

export class MercadoPagoError extends Error {
  constructor(status, body) {
    const first = (body && Array.isArray(body.errors) && body.errors[0]) || body || {};
    super(first.message || first.code || 'Mercado Pago respondió ' + status);
    this.name = 'MercadoPagoError';
    this.status = status;
    this.code = first.code || '';
    this.body = body;
  }
}

export function createMercadoPago({ accessToken, baseUrl = DEFAULT_BASE, fetchImpl = fetch }) {
  async function call(method, path, { body, idempotencyKey, headers = {} } = {}) {
    const res = await fetchImpl(baseUrl + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) throw new MercadoPagoError(res.status, data);
    return data;
  }

  return {
    async listTerminals() {
      const data = await call('GET', '/terminals/v1/list?limit=50');
      return ((data && data.data && data.data.terminals) || []).map((t) => ({
        id: t.id, operatingMode: t.operating_mode || '', posId: t.pos_id ?? null, storeId: t.store_id ?? null, externalPosId: t.external_pos_id || ''
      }));
    },

    // Deja la maquinita en modo integrado (PDV) para que reciba las órdenes de la página.
    setIntegratedMode: (terminalId) =>
      call('PATCH', '/terminals/v1/setup', { body: { terminals: [{ id: terminalId, operating_mode: 'PDV' }] } }),

    // amount: pesos chilenos enteros (el CLP no tiene decimales).
    createPointOrder({ terminalId, amount, reference, description, idempotencyKey, expiration = 'PT15M' }) {
      return call('POST', '/v1/orders', {
        idempotencyKey,
        body: {
          type: 'point',
          external_reference: reference,
          expiration_time: expiration,
          description: String(description || '').slice(0, 150),
          transactions: { payments: [{ amount: String(Math.round(amount)) }] },
          config: { point: { terminal_id: terminalId } }
        }
      });
    },

    getOrder: (orderId) => call('GET', '/v1/orders/' + encodeURIComponent(orderId)),

    cancelOrder: (orderId, idempotencyKey) =>
      call('POST', '/v1/orders/' + encodeURIComponent(orderId) + '/cancel', { idempotencyKey })
  };
}
