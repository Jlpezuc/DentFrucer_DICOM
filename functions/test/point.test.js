// Flujo completo contra el emulador de Firestore, con un Mercado Pago simulado.
// Se ejecuta con el emulador (ver FIREBASE.md):
//   npx firebase-tools emulators:exec --only firestore --project demo-dentfrucer "npm test"
import assert from 'node:assert/strict';
import process from 'node:process';
import { after, before, test } from 'node:test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { MercadoPagoError } from '../src/mercadopago.js';
import * as point from '../src/point.js';
import { signFor, validSignature } from '../src/signature.js';

const skip = !process.env.FIRESTORE_EMULATOR_HOST && 'requiere el emulador de Firestore';
let db;
const clone = (o) => JSON.parse(JSON.stringify(o));

// Mercado Pago simulado: guarda las órdenes y permite cambiar su estado.
function fakeMp() {
  const orders = new Map();
  let n = 0;
  return {
    orders,
    created: [],
    async listTerminals() { return [{ id: 'NEWLAND_N950__T1', operatingMode: 'STANDALONE' }]; },
    async setIntegratedMode(id) { this.pdv = id; },
    async createPointOrder(o) {
      if (this.busy) throw new MercadoPagoError(409, { errors: [{ code: 'already_queued_order_on_terminal', message: 'queued' }] });
      this.created.push(o);
      const order = { id: 'ORD' + (++n), status: 'created', external_reference: o.reference, transactions: { payments: [{ id: 'PAY' + n, amount: String(o.amount), status: 'created' }] } };
      orders.set(order.id, order);
      return clone(order);
    },
    async getOrder(id) { return clone(orders.get(id)); },
    async cancelOrder(id) {
      const o = orders.get(id);
      if (o.status !== 'created') throw new MercadoPagoError(409, { errors: [{ code: 'cannot_cancel_order', message: 'no' }] });
      o.status = 'canceled';
      return clone(o);
    },
    pay(id, type = 'debit_card') {
      const o = orders.get(id);
      o.status = 'processed'; o.status_detail = 'accredited';
      Object.assign(o.transactions.payments[0], { status: 'processed', status_detail: 'accredited', payment_method: { id: type === 'debit_card' ? 'debvisa' : 'visa', type } });
    }
  };
}

const basePayment = (o = {}) => ({
  date: '2026-10-17', patientId: 'p1', patientName: 'Ana Ruiz', appointmentId: null, studyIds: ['s1', 's2'],
  items: [{ serviceId: 'CBCT', label: 'Tomografía', price: 45000 }], discount: 0, total: 45000,
  method: '', docType: 'Voucher (boleta)', docNumber: '', note: '', channel: 'point', status: 'pending', ...o
});
const status = async (id) => (await db.doc('payments/' + id).get()).data();
const paidFlags = async () => Promise.all(['s1', 's2'].map(async (id) => (await db.doc('studies/' + id).get()).data().paid));

before(async () => {
  if (skip) return;
  initializeApp({ projectId: 'demo-dentfrucer' });
  db = getFirestore();
  await db.doc('users/admin').set({ role: 'admin' });
  await db.doc('users/sec').set({ role: 'admin', superadmin: false, permissions: { cobros: true } });
  await db.doc('users/tec').set({ role: 'admin', superadmin: false, permissions: { examenes: true } });
  await db.doc('users/off').set({ role: 'admin', disabled: true });
  await db.doc('users/doc').set({ role: 'doctor' });
});
after(async () => { if (db) await db.terminate(); });

test('permisos', { skip }, async () => {
  assert.equal(await point.adminCan(db, 'admin', 'cobros'), true);
  assert.equal(await point.adminCan(db, 'sec', 'cobros'), true);
  assert.equal(await point.adminCan(db, 'tec', 'cobros'), false);
  assert.equal(await point.adminCan(db, 'off', 'cobros'), false);
  assert.equal(await point.adminCan(db, 'doc', 'cobros'), false);
  assert.equal(await point.adminCan(db, null, 'cobros'), false);
});

test('sin maquinita elegida no se puede cobrar', { skip }, async () => {
  await db.doc('payments/x0').set(basePayment());
  await assert.rejects(point.charge(db, fakeMp(), 'x0'), /elija la maquinita/);
});

test('flujo: elegir maquinita, cobrar, pago aprobado por webhook', { skip }, async () => {
  const mp = fakeMp();
  await point.useTerminal(db, mp, 'NEWLAND_N950__T1', 'admin');
  assert.equal(mp.pdv, 'NEWLAND_N950__T1');
  assert.equal((await db.doc('settings/mercadopago').get()).data().terminalId, 'NEWLAND_N950__T1');
  await db.doc('studies/s1').set({ paid: false });
  await db.doc('studies/s2').set({ paid: false });
  await db.doc('payments/pay1').set(basePayment());

  const r = await point.charge(db, mp, 'pay1');
  assert.equal(r.orderId, 'ORD1');
  assert.equal(mp.created[0].amount, 45000);
  assert.equal(mp.created[0].reference, 'pay1-1');
  let p = await status('pay1');
  assert.equal(p.status, 'pending');
  assert.equal(p.mp.orderId, 'ORD1');
  // Un segundo clic no crea otra orden.
  await assert.rejects(point.charge(db, mp, 'pay1'), /ya está en la maquinita/);

  // Consulta mientras el paciente paga: sigue pendiente.
  mp.orders.get('ORD1').status = 'at_terminal';
  assert.equal((await point.refresh(db, mp, 'pay1')).status, 'pending');
  assert.equal((await status('pay1')).mp.status, 'at_terminal');

  // Aviso de Mercado Pago con firma inválida: no cambia nada.
  mp.pay('ORD1', 'credit_card');
  const ts = String(Math.floor(Date.now() / 1000));
  const bad = await point.handleNotification(db, mp, { query: { 'data.id': 'ORD1', type: 'order' }, headers: { 'x-signature': 'ts=' + ts + ',v1=00', 'x-request-id': 'r1' }, secret: 's', validSignature });
  assert.equal(bad, 401);
  assert.equal((await status('pay1')).status, 'pending');

  // Aviso firmado: el cobro queda pagado, con crédito, y la visita pagada.
  const ok = await point.handleNotification(db, mp, {
    query: { 'data.id': 'ORD1', type: 'order' }, body: { type: 'order', data: { id: 'ORD1' } },
    headers: { 'x-signature': signFor({ secret: 's', dataId: 'ORD1', xRequestId: 'r2', ts }), 'x-request-id': 'r2' }, secret: 's', validSignature
  });
  assert.equal(ok, 200);
  p = await status('pay1');
  assert.equal(p.status, 'paid');
  assert.equal(p.method, 'Crédito');
  assert.equal(p.mp.paymentType, 'credit_card');
  assert.ok(p.paidAt);
  assert.deepEqual(await paidFlags(), [true, true]);

  // Otros avisos (pagos sueltos, etc.) se ignoran.
  assert.equal(await point.handleNotification(db, mp, { query: { 'data.id': '123', type: 'payment' }, headers: {}, secret: 's', validSignature }), 200);
  // Ya pagado: no se puede volver a cobrar ni cancelar.
  await assert.rejects(point.charge(db, mp, 'pay1'), /ya está pagado/);
  assert.equal((await point.cancel(db, mp, 'pay1')).status, 'paid');

  // Devolución: el cobro queda devuelto y la visita vuelve a «Por cobrar».
  mp.orders.get('ORD1').status = 'refunded';
  assert.equal((await point.refresh(db, mp, 'pay1')).status, 'refunded');
  assert.deepEqual(await paidFlags(), [false, false]);
});

test('cancelar antes de que la maquinita lo tome, y reintentar', { skip }, async () => {
  const mp = fakeMp();
  await db.doc('payments/pay2').set(basePayment({ studyIds: [] }));
  await point.charge(db, mp, 'pay2');
  assert.equal((await point.cancel(db, mp, 'pay2')).status, 'canceled');
  assert.equal((await status('pay2')).status, 'canceled');

  // Reintento: nueva orden con otra referencia; la orden vieja ya no cuenta.
  const r = await point.charge(db, mp, 'pay2');
  assert.equal(r.orderId, 'ORD2');
  assert.equal(mp.created[1].reference, 'pay2-2');
  mp.pay('ORD1');
  assert.equal(await point.applyOrder(db, await mp.getOrder('ORD1')), 'pending');
  mp.pay('ORD2');
  assert.equal(await point.applyOrder(db, await mp.getOrder('ORD2')), 'paid');
  assert.equal((await status('pay2')).method, 'Débito');
});

test('si la maquinita ya lo tomó, se cancela en la maquinita', { skip }, async () => {
  const mp = fakeMp();
  await db.doc('payments/pay3').set(basePayment({ studyIds: [] }));
  const { orderId } = await point.charge(db, mp, 'pay3');
  mp.orders.get(orderId).status = 'at_terminal';
  await assert.rejects(point.cancel(db, mp, 'pay3'), /cancélelo en la maquinita/);
  assert.equal((await status('pay3')).status, 'pending');
});

test('maquinita ocupada: el cobro queda rechazado con el motivo', { skip }, async () => {
  const mp = fakeMp();
  mp.busy = true;
  await db.doc('payments/pay4').set(basePayment({ studyIds: [] }));
  await assert.rejects(point.charge(db, mp, 'pay4'), /ya tiene otro cobro pendiente/);
  const p = await status('pay4');
  assert.equal(p.status, 'failed');
  assert.match(p.mp.error, /otro cobro pendiente/);
  mp.busy = false;
  assert.equal((await point.charge(db, mp, 'pay4')).status, 'pending');
});

test('un cobro que no es con la maquinita no se envía', { skip }, async () => {
  const manual = basePayment({ method: 'Efectivo' });
  delete manual.channel;
  delete manual.status;
  await db.doc('payments/pay5').set(manual);
  await assert.rejects(point.charge(db, fakeMp(), 'pay5'), /no es con la maquinita/);
});
