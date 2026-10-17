// Funciones del servidor (Firebase Cloud Functions): cobros con la maquinita de
// Mercado Pago (Point) y creación de cuentas. El token de Mercado Pago es
// secreto y no puede ir en la página, por eso estas llamadas se hacen aquí.
// Configuración: ver FIREBASE.md.
//
//   createAccount      crea la cuenta de un médico o administrador (src/accounts.js)
//   pointTerminals     lista las maquinitas de la cuenta y cuál está elegida
//   pointUseTerminal   elige la maquinita y la deja en modo integrado (PDV)
//   pointCharge        envía un cobro a la maquinita (o lo reintenta)
//   pointRefresh       consulta en Mercado Pago el estado del cobro
//   pointCancel        cancela un cobro que la maquinita aún no tomó
//   mpWebhook          recibe los avisos de Mercado Pago (tema "Order")
//
// Las llamadas de la maquinita exigen una cuenta de administración con el
// permiso "cobros". La lógica está en src/point.js.

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as accounts from './src/accounts.js';
import { FriendlyError } from './src/errors.js';
import { createMercadoPago } from './src/mercadopago.js';
import * as point from './src/point.js';
import { validSignature } from './src/signature.js';

initializeApp();
const db = getFirestore();

// Debe coincidir con functionsRegion en assets/js/config/firebase-config.js.
setGlobalOptions({ region: 'southamerica-west1', maxInstances: 5 });

const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');
const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET');
const MP_API_BASE = defineString('MP_API_BASE', { default: 'https://api.mercadopago.com' }); // solo para pruebas

const mercadoPago = () => createMercadoPago({ accessToken: MP_ACCESS_TOKEN.value(), baseUrl: MP_API_BASE.value() });

// Llamada desde la página: exige sesión (y el permiso, si se indica) y traduce los errores.
const callable = (fn, { permission = 'cobros', secrets = [MP_ACCESS_TOKEN] } = {}) => onCall({ secrets }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Inicie sesión.');
  if (permission && !(await point.adminCan(db, uid, permission))) throw new HttpsError('permission-denied', 'Su cuenta no tiene el permiso para esta acción.');
  try {
    return await fn(req.data || {}, uid);
  } catch (e) {
    if (e instanceof FriendlyError) throw new HttpsError(e.code, e.message);
    console.error(e);
    throw new HttpsError('internal', 'No se pudo completar la operación en el servidor.');
  }
});
const paymentId = (data) => {
  if (typeof data.paymentId !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(data.paymentId)) throw new FriendlyError('invalid-argument', 'Cobro no válido.');
  return data.paymentId;
};

export const pointTerminals = callable(() => point.listTerminals(db, mercadoPago()));
export const pointUseTerminal = callable((data, uid) => point.useTerminal(db, mercadoPago(), data.terminalId, uid));
export const pointCharge = callable((data) => point.charge(db, mercadoPago(), paymentId(data)));
export const pointRefresh = callable((data) => point.refresh(db, mercadoPago(), paymentId(data)));
export const pointCancel = callable((data) => point.cancel(db, mercadoPago(), paymentId(data)));

// El permiso depende del tipo de cuenta: lo revisa accounts.createAccount.
export const createAccount = callable((data, uid) => accounts.createAccount(db, getAuth(), uid, data), { permission: null, secrets: [] });

// URL para "Webhooks" en Mercado Pago (Tus integraciones), evento "Order (Mercado Pago)":
//   https://southamerica-west1-<proyecto>.cloudfunctions.net/mpWebhook
export const mpWebhook = onRequest({ secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send(''); return; }
  try {
    const code = await point.handleNotification(db, mercadoPago(), {
      query: req.query, body: req.body || {}, headers: req.headers, secret: MP_WEBHOOK_SECRET.value(), validSignature
    });
    res.status(code).send('');
  } catch (e) {
    console.error(e);
    res.status(500).send(''); // Mercado Pago reintenta más tarde
  }
});
