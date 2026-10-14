// Cobros: lo que se cobró en cada atención (servicios, medio de pago y el
// documento entregado). La página no emite boletas ni facturas: aquí solo se
// registra el número del documento emitido fuera (voucher, portal del SII…).
//
//  payments/{id}  { date: 'AAAA-MM-DD', patientId, patientName, appointmentId,
//                   items: [{ serviceId, label, price }], discount, total,
//                   method, docType, docNumber, note, createdAt, createdBy }

export const PAYMENT_METHODS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Convenio', 'Otro'];
export const DOC_TYPES = ['Boleta', 'Voucher (boleta)', 'Factura', 'Sin documento'];

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
export const fmtCLP = (n) => clp.format(Math.round(Number(n) || 0));

const amount = (v) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d-]/g, '')) || 0);
  return Math.max(0, n);
};

export const itemsTotal = (items) => items.reduce((n, it) => n + amount(it.price), 0);

// Valida y normaliza un cobro. Devuelve { data } o { error }.
export function normalizePayment(input) {
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
  if (!PAYMENT_METHODS.includes(input.method)) return { error: 'Elija el medio de pago.' };
  const docType = DOC_TYPES.includes(input.docType) ? input.docType : 'Sin documento';
  return {
    data: {
      date,
      patientId: String(input.patientId),
      patientName: String(input.patientName || '').slice(0, 121),
      appointmentId: input.appointmentId || null,
      items,
      discount,
      total: subtotal - discount,
      method: input.method,
      docType,
      docNumber: docType === 'Sin documento' ? '' : String(input.docNumber || '').trim().slice(0, 30),
      note: String(input.note || '').trim().slice(0, 300)
    }
  };
}
