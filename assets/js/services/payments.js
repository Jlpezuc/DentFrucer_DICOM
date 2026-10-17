// Cobros: lo que se cobró en cada atención (servicios, medio de pago y el
// documento entregado). La página no emite boletas ni facturas: aquí solo se
// registra el número del documento emitido fuera (voucher, portal del SII…).
//
//  payments/{id}  { date: 'AAAA-MM-DD', patientId, patientName, appointmentId,
//                   studyIds: [exámenes de la visita cobrada; vacío = servicio suelto],
//                   items: [{ serviceId, label, price }], discount, total,
//                   method, docType, docNumber, note, createdAt, createdBy,
//                   channel: 'point' si se cobró con la maquinita de Mercado Pago,
//                   status, mp: { orderId, terminalId, status, statusDetail,
//                                 paymentId, paymentMethod, paymentType, error } }
//
// status (solo los cobros con la maquinita; los demás no lo tienen y cuentan
// como pagados): 'pending' mientras se espera la maquinita, 'paid' cuando
// Mercado Pago aprueba el pago, o 'canceled' | 'expired' | 'failed' |
// 'refunded'. Solo los pagados suman en el Resumen, en Cobros y en la agenda.
// El estado lo escribe el servidor (functions/), nunca la página.

export const PAYMENT_METHODS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Convenio', 'Otro'];
export const DOC_TYPES = ['Boleta', 'Voucher (boleta)', 'Factura', 'Sin documento'];

export const isPaid = (p) => !p.status || p.status === 'paid';
export const isPoint = (p) => p.channel === 'point';
export const POINT_STATUS = {
  pending: 'Esperando la maquinita', paid: 'Pagado', canceled: 'Cancelado', expired: 'Expiró',
  failed: 'Rechazado', refunded: 'Devuelto'
};
// Lo que muestra la maquinita según el estado de la orden en Mercado Pago.
export const ORDER_STEP = {
  created: 'Enviado a la maquinita. Pida al paciente que acerque o inserte su tarjeta.',
  at_terminal: 'El paciente está pagando en la maquinita…',
  action_required: 'La maquinita pide una acción (por ejemplo, la clave de la tarjeta).'
};

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
export const fmtCLP = (n) => clp.format(Math.round(Number(n) || 0));

const amount = (v) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d-]/g, '')) || 0);
  return Math.max(0, n);
};

export const itemsTotal = (items) => items.reduce((n, it) => n + amount(it.price), 0);

// Valida y normaliza un cobro. Devuelve { data } o { error }.
// Con { terminal: true } es un cobro para la maquinita: el medio de pago lo
// informa Mercado Pago al aprobarse (débito o crédito).
export function normalizePayment(input, { terminal = false } = {}) {
  const date = String(input.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Elija la fecha del cobro.' };
  if (!input.patientId) return { error: 'Elija el paciente.' };
  const items = (input.items || [])
    .map((it) => ({ serviceId: String(it.serviceId || ''), label: String(it.label || '').trim().slice(0, 80), price: amount(it.price) }))
    .filter((it) => it.label || it.price);
  if (!items.length) return { error: 'Agregue al menos un servicio cobrado.' };
  if (items.some((it) => !it.label)) return { error: 'Cada servicio necesita un nombre.' };
  const subtotal = itemsTotal(items);
  const discount = Math.min(amount(input.discount), subtotal);
  if (terminal && subtotal - discount <= 0) return { error: 'El total a cobrar con la maquinita debe ser mayor que $0.' };
  if (!terminal && !PAYMENT_METHODS.includes(input.method)) return { error: 'Elija el medio de pago.' };
  const docType = DOC_TYPES.includes(input.docType) ? input.docType : 'Sin documento';
  return {
    data: {
      date,
      patientId: String(input.patientId),
      patientName: String(input.patientName || '').slice(0, 121),
      appointmentId: input.appointmentId || null,
      studyIds: [...new Set((input.studyIds || []).filter((x) => typeof x === 'string' && x))].slice(0, 50),
      items,
      discount,
      total: subtotal - discount,
      method: terminal ? '' : input.method,
      docType,
      docNumber: docType === 'Sin documento' ? '' : String(input.docNumber || '').trim().slice(0, 30),
      note: String(input.note || '').trim().slice(0, 300)
    }
  };
}
