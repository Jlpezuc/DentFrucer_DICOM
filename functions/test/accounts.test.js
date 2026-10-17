// Creación de cuentas por el servidor. Con los emuladores de Firestore y Auth:
//   npx firebase-tools emulators:exec --only firestore,auth --project demo-dentfrucer "npm test"
import assert from 'node:assert/strict';
import process from 'node:process';
import { after, before, test } from 'node:test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createAccount, passwordProblem } from '../src/accounts.js';

const skip = !(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST) && 'requiere los emuladores de Firestore y Auth';
let db;
let auth;

before(async () => {
  if (skip) return;
  if (!getApps().length) initializeApp({ projectId: 'demo-dentfrucer' });
  db = getFirestore();
  auth = getAuth();
  await db.doc('users/sup').set({ role: 'admin' });
  await db.doc('users/rrhh').set({ role: 'admin', superadmin: false, permissions: { medicos: true } });
  await db.doc('users/caja').set({ role: 'admin', superadmin: false, permissions: { cobros: true } });
  await db.doc('users/doc').set({ role: 'doctor' });
});
after(async () => { if (db) await db.terminate(); });

test('política de contraseñas', () => {
  assert.match(passwordProblem('abc123'), /10 caracteres/);
  assert.match(passwordProblem('solamenteletras'), /letras y números/);
  assert.equal(passwordProblem('clave-segura-2026'), '');
});

test('quién puede crear cada tipo de cuenta', { skip }, async () => {
  const ok = await createAccount(db, auth, 'sup', { email: 'Nuevo.Admin@Clinica.cl', password: 'clave-segura-2026', role: 'admin' });
  assert.equal((await auth.getUser(ok.uid)).email, 'nuevo.admin@clinica.cl');
  assert.ok((await createAccount(db, auth, 'rrhh', { email: 'medico1@clinica.cl', password: 'clave-segura-2026', role: 'doctor' })).uid);
  await assert.rejects(createAccount(db, auth, 'rrhh', { email: 'admin2@clinica.cl', password: 'clave-segura-2026', role: 'admin' }), /no puede crear/);
  await assert.rejects(createAccount(db, auth, 'caja', { email: 'medico2@clinica.cl', password: 'clave-segura-2026', role: 'doctor' }), /no puede crear/);
  await assert.rejects(createAccount(db, auth, 'doc', { email: 'medico3@clinica.cl', password: 'clave-segura-2026', role: 'doctor' }), /no puede crear/);
  await assert.rejects(createAccount(db, auth, 'nadie', { email: 'medico4@clinica.cl', password: 'clave-segura-2026', role: 'doctor' }), /no puede crear/);
});

test('valida correo, contraseña y duplicados', { skip }, async () => {
  await assert.rejects(createAccount(db, auth, 'sup', { email: 'no-es-correo', password: 'clave-segura-2026', role: 'doctor' }), /correo no es válido/);
  await assert.rejects(createAccount(db, auth, 'sup', { email: 'x@clinica.cl', password: 'corta1', role: 'doctor' }), /10 caracteres/);
  await assert.rejects(createAccount(db, auth, 'sup', { email: 'medico1@clinica.cl', password: 'clave-segura-2026', role: 'doctor' }), /Ya existe/);
  await assert.rejects(createAccount(db, auth, 'sup', { email: 'y@clinica.cl', password: 'clave-segura-2026', role: 'paciente' }), /no válido/);
});
