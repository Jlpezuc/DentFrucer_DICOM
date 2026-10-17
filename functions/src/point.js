// Cobros con la maquinita (Mercado Pago Point): lo que hacen las funciones con
// Firestore. No depende de firebase-functions, así se puede probar solo.
//
// Flujo:
//  1. La página crea el cobro en payments/{id} con channel: 'point' y status:
//     'pending' (las reglas no le permiten crearlo pagado) y llama a charge().
//  2. charge() crea la orden en Mercado Pago, que aparece sola en la maquinita,
//     y guarda mp.orderId en el cobro.
//  3. Cuando el paciente paga (o se cancela, expira o es rechazado), Mercado
//     Pago avisa al webhook; la página además consulta con refresh() cada pocos
//     segundos por si el aviso no llega. Ambos terminan en applyOrder(), que
//     lee la orden desde Mercado Pago (nunca confía en el aviso) y actualiza el
//     cobro: si quedó pagada, status: 'paid', el medio de pago (débito o
//     crédito) y la visita queda pagada (studies.paid).
//  4. La página escucha el cobro en vivo y muestra el resultado.

import { FieldValue } from 'firebase-admin/firestore';
import { MercadoPagoError } from './mercadopago.js';

// Estado del cobro según el estado de la orden en Mercado Pago.
export const ORDER_TO_STATUS = {
  created: 'pending', at_terminal: 'pending', action_required: 'pending',
  processed: 'paid', canceled: 'canceled', expired: 'expired', failed: 'failed', refunded: 'refunded'
};
const RETRYABLE = ['canceled', 'expired', 'failed'];
const METHOD_FOR_TYPE = { debit_card: 'Débito', prepaid_card: 'Débito', credit_card: 'Crédito' };

// Error con un código de HttpsError (lo traduce index.js).
export class PointError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ¿La cuenta es administrador con ese permiso? (igual que can() en firestore.rules)
export async function adminCan(db, uid, permission) {
  if (!uid) return false;
  const snap = await db.doc('users/' + uid).get();
  const u = snap.exists ? snap.data() : null;
  if (!u || u.role !== 'admin' || u.disabled === true) return false;
  if (u.superadmin === true || !('permissions' in u)) return true;
  return !!(u.permissions && u.permissions[permission] === true);
}

// El id del cobro va en external_reference como "{id}-{intento}".
const reference = (paymentId, attempt) => paymentId + '-' + attempt;
const paymentIdOf = (ref) => String(ref || '').replace(/-\d+$/, '');

function friendly(e) {
  if (!(e instanceof MercadoPagoError)) return 'No se pudo conectar con Mercado Pago. Intente de nuevo.';
  if (e.code === 'already_queued_order_on_terminal') return 'La maquinita ya tiene otro cobro pendiente. Termínelo o cancélelo en la maquinita e intente de nuevo.';
  if (e.status === 401) return 'Mercado Pago rechazó el token de acceso. Revise MP_ACCESS_TOKEN (ver FIREBASE.md).';
  if (e.status === 403) return 'La maquinita no pertenece a esta cuenta de Mercado Pago.';
  if (e.status === 404) return 'Mercado Pago no encuentra la maquinita. Vuelva a elegirla en Cobros → Maquinita.';
  return 'Mercado Pago: ' + e.message;
}

export async function listTerminals(db, mp) {
  const [terminals, settings] = await Promise.all([mp.listTerminals(), db.doc('settings/mercadopago').get()]);
  return { terminals, current: settings.exists ? settings.data().terminalId || '' : '' };
}

// Elige la maquinita de la clínica y la deja en modo integrado (PDV).
export async function useTerminal(db, mp, terminalId, uid) {
  const id = String(terminalId || '').trim();
  if (!id) throw new PointError('invalid-argument', 'Elija una maquinita.');
  try { await mp.setIntegratedMode(id); } catch (e) { throw new PointError('failed-precondition', friendly(e)); }
  await db.doc('settings/mercadopago').set({ terminalId: id, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid || null });
  return { terminalId: id };
}

// Envía el cobro a la maquinita (o lo reintenta si fue cancelado, expiró o se rechazó).
export async function charge(db, mp, paymentId) {
  const settings = await db.doc('settings/mercadopago').get();
  const terminalId = settings.exists ? settings.data().terminalId : '';
  if (!terminalId) throw new PointError('failed-precondition', 'Primero elija la maquinita en Cobros → Maquinita.');
  const ref = db.doc('payments/' + paymentId);

  // Reserva el intento en una transacción: dos clics no crean dos órdenes.
  const { p, attempt } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new PointError('not-found', 'El cobro ya no existe.');
    const p = snap.data();
    if (p.channel !== 'point') throw new PointError('failed-precondition', 'Este cobro no es con la maquinita.');
    if (p.status === 'paid') throw new PointError('failed-precondition', 'Este cobro ya está pagado.');
    if (!(p.status === 'pending' && !p.mp) && !RETRYABLE.includes(p.status)) throw new PointError('failed-precondition', 'Este cobro ya está en la maquinita.');
    if (!(Number(p.total) > 0)) throw new PointError('invalid-argument', 'El total a cobrar debe ser mayor que $0.');
    const attempt = ((p.mp && p.mp.attempt) || 0) + 1;
    tx.update(ref, {
      status: 'pending',
      mp: { attempt, terminalId, orderId: null, status: 'sending', statusDetail: '', paymentId: null, paymentMethod: '', paymentType: '', error: '', updatedAt: FieldValue.serverTimestamp() }
    });
    return { p, attempt };
  });

  try {
    const order = await mp.createPointOrder({
      terminalId,
      amount: Number(p.total),
      reference: reference(paymentId, attempt),
      idempotencyKey: reference(paymentId, attempt),
      description: 'DentFrucer · ' + (p.items || []).map((it) => it.label).join(', ')
    });
    await ref.update({ 'mp.orderId': order.id, 'mp.status': order.status || 'created', 'mp.statusDetail': order.status_detail || '', 'mp.updatedAt': FieldValue.serverTimestamp() });
    return { status: 'pending', orderId: order.id };
  } catch (e) {
    const message = friendly(e);
    await ref.update({ status: 'failed', 'mp.status': 'error', 'mp.error': message, 'mp.updatedAt': FieldValue.serverTimestamp() });
    throw new PointError('failed-precondition', message);
  }
}

// Consulta la orden en Mercado Pago y actualiza el cobro.
export async function refresh(db, mp, paymentId) {
  const snap = await db.doc('payments/' + paymentId).get();
  if (!snap.exists) throw new PointError('not-found', 'El cobro ya no existe.');
  const p = snap.data();
  if (p.channel !== 'point' || !p.mp || !p.mp.orderId) return { status: p.status || 'paid' };
  return { status: await applyOrder(db, await mp.getOrder(p.mp.orderId)) };
}

// Cancela el cobro. Si la maquinita ya lo tomó, hay que cancelarlo en la maquinita.
export async function cancel(db, mp, paymentId) {
  const ref = db.doc('payments/' + paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new PointError('not-found', 'El cobro ya no existe.');
  const p = snap.data();
  if (p.channel !== 'point' || p.status !== 'pending') return { status: p.status };
  if (!p.mp || !p.mp.orderId) {
    await ref.update({ status: 'canceled', 'mp.status': 'canceled', 'mp.updatedAt': FieldValue.serverTimestamp() });
    return { status: 'canceled' };
  }
  try {
    const order = await mp.cancelOrder(p.mp.orderId, reference(paymentId, p.mp.attempt) + '-cancel');
    return { status: await applyOrder(db, order && order.id ? order : await mp.getOrder(p.mp.orderId)) };
  } catch (e) {
    if (e instanceof MercadoPagoError && (e.status === 409 || e.status === 400)) {
      await applyOrder(db, await mp.getOrder(p.mp.orderId)).catch(() => {});
      throw new PointError('failed-precondition', 'La maquinita ya tomó el cobro: cancélelo en la maquinita.');
    }
    throw new PointError('unavailable', friendly(e));
  }
}

// Aplica al cobro el estado de una orden leída desde Mercado Pago. Devuelve el estado del cobro.
export async function applyOrder(db, order) {
  if (!order || !order.id) return null;
  let ref = db.doc('payments/' + paymentIdOf(order.external_reference));
  if (!order.external_reference) {
    const found = await db.collection('payments').where('mp.orderId', '==', order.id).limit(1).get();
    if (found.empty) return null;
    ref = found.docs[0].ref;
  }
  return db.runTransaction(async (tx) => {
    // En una transacción, todas las lecturas van antes de las escrituras.
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const p = snap.data();
    // Orden de un intento anterior (se reintentó): no cambia nada.
    if (p.channel !== 'point' || !p.mp || p.mp.orderId !== order.id) return p.status || null;

    const pay = (order.transactions && order.transactions.payments && order.transactions.payments[0]) || {};
    const pm = pay.payment_method || {};
    let status = ORDER_TO_STATUS[order.status] || 'pending';
    if (p.status === 'paid' && status !== 'refunded') status = 'paid'; // un pago aprobado no vuelve atrás
    if (p.status === 'refunded') status = 'refunded';

    const studyIds = p.studyIds || [];
    const nowPaid = status === 'paid' && p.status !== 'paid';
    const nowRefunded = status === 'refunded' && p.status === 'paid';
    const studies = (nowPaid || nowRefunded) && studyIds.length ? await tx.getAll(...studyIds.map((id) => db.doc('studies/' + id))) : [];
    let covered = new Set();
    if (nowRefunded && studyIds.length) {
      const others = await tx.get(db.collection('payments').where('studyIds', 'array-contains-any', studyIds.slice(0, 30)));
      covered = new Set(others.docs.filter((d) => d.id !== ref.id && (!d.data().status || d.data().status === 'paid')).flatMap((d) => d.data().studyIds || []));
    }

    const update = {
      status,
      'mp.status': order.status || '',
      'mp.statusDetail': order.status_detail || pay.status_detail || '',
      'mp.paymentId': pay.id || null,
      'mp.paymentMethod': pm.id || '',
      'mp.paymentType': pm.type || '',
      'mp.updatedAt': FieldValue.serverTimestamp()
    };
    if (nowPaid) {
      update.method = METHOD_FOR_TYPE[pm.type] || 'Otro';
      update.paidAt = FieldValue.serverTimestamp();
      studies.filter((s) => s.exists).forEach((s) => tx.update(s.ref, { paid: true }));
    }
    if (nowRefunded) studies.filter((s) => s.exists && !covered.has(s.id)).forEach((s) => tx.update(s.ref, { paid: false }));
    tx.update(ref, update);
    return status;
  });
}

// Aviso (webhook) de Mercado Pago. Devuelve el código HTTP a responder.
export async function handleNotification(db, mp, { query = {}, body = {}, headers = {}, secret, validSignature }) {
  const type = query.type || query.topic || body.type || '';
  const dataId = query['data.id'] || (body.data && body.data.id) || '';
  if (type !== 'order' || !dataId) return 200; // otros avisos: no se usan
  if (!validSignature({ secret, xSignature: headers['x-signature'], xRequestId: headers['x-request-id'], dataId })) return 401;
  await applyOrder(db, await mp.getOrder(dataId));
  return 200;
}
