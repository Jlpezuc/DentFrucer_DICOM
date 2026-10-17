// Utilidades comunes a las dos implementaciones del backend.

import { cleanDoctorIds, doctorsOf } from '../groups.js';
import { normalizePermissions } from '../permissions.js';
import { normalizeAccountName } from '../people.js';

export const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');
export const byDateTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
export const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es');
export const studyCode = (id) => 'EST-' + new Date().getFullYear() + '-' + id.slice(0, 5).toUpperCase();

// Paciente que se crea al agendar: solo identidad y contacto (sin médico).
export const agendaPatient = (a) => ({
  name: a.name, firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, code: '', age: null, source: 'agenda'
});

// Datos del paciente copiados en cada examen (los usa el portal del médico).
export const studyPatientFields = (p) => ({ patientName: p.name, patientCode: p.code || '', patientAge: p.age || null });

// Archivos de un examen.
export const sizeOf = (files) => files.reduce((n, f) => n + (f.size || 0), 0);
export const cleanFileName = (name) => String(name || '').replace(/[\\/]/g, '-').trim().slice(0, 120) || 'archivo';

// Médicos de un examen: doctorIds (todos) y doctorId (el primero, para los
// exámenes y reglas anteriores a que un examen pudiera tener varios médicos).
export function studyDoctors(ids) {
  const doctorIds = cleanDoctorIds(ids);
  return { doctorIds, doctorId: doctorIds[0] || null };
}
// Examen leído de la base: siempre con doctorIds.
export const withDoctors = (s) => ({ ...s, doctorIds: doctorsOf(s) });

// Servicio de un examen: su id y su nombre al momento de guardarlo.
export function studyServiceFields(serviceId, serviceName) {
  const id = String(serviceId || '').trim();
  if (!id) throw new Error('Elija el servicio del examen.');
  return { serviceId: id, service: String(serviceName || id).trim().slice(0, 60) };
}

// Cambios permitidos en un examen desde el panel.
export function studyEdits({ serviceId, service, description, date, doctorIds }) {
  const out = {};
  if (serviceId !== undefined) Object.assign(out, studyServiceFields(serviceId, service));
  if (description !== undefined) out.description = String(description).trim().slice(0, 120);
  if (date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('La fecha no es válida.');
    out.date = date;
  }
  if (doctorIds !== undefined) Object.assign(out, studyDoctors(doctorIds));
  return out;
}

// Cuenta de administración: nombre, descripción (cargo libre: "Secretaria"…),
// si es administrador general y sus permisos. Devuelve { data } o { error }.
export function normalizeAdmin(input) {
  const { data: name, error } = normalizeAccountName(input.name);
  if (error) return { error };
  const description = String(input.description || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const superadmin = input.superadmin === true;
  return { data: { name, description, superadmin, permissions: normalizePermissions(input.permissions) } };
}

// Campos de una cita que se guardan (además de code, slotId, patientId, createdAt).
export const appointmentFields = (a) => ({
  firstName: a.firstName, lastName: a.lastName, name: a.name, email: a.email, phone: a.phone, referrer: a.referrer,
  exam: a.exam, date: a.date, time: a.time, status: a.status || 'Pendiente'
});

// El acceso de pacientes está desactivado (config/patient-access.js).
export class AccessDisabledError extends Error {
  constructor() { super('El acceso a resultados en línea todavía no está disponible.'); }
}

// Contraseñas de las cuentas (médicos y administración): mínimo 10 caracteres,
// con letras y números. Devuelve el error o ''.
export const MIN_PASSWORD = 10;
export function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD) return 'La contraseña debe tener al menos ' + MIN_PASSWORD + ' caracteres.';
  if (!/[a-zA-ZñÑáéíóúÁÉÍÓÚ]/.test(p) || !/\d/.test(p)) return 'La contraseña debe tener letras y números.';
  return '';
}

// La cuenta tiene verificación en dos pasos: falta el código de la app de
// autenticación (backend.completeTwoFactor).
export class TwoFactorRequiredError extends Error {
  constructor() { super('Ingrese el código de 6 dígitos de su app de autenticación.'); this.name = 'TwoFactorRequiredError'; }
}

export function friendlyAuthError(err) {
  const code = (err && err.code) || '';
  if (code.includes('invalid-verification-code') || code.includes('invalid-totp')) return 'El código no es correcto o ya venció. Use el código que muestra ahora su app.';
  if (code.includes('unverified-email')) return 'Primero verifique su correo (le enviamos un enlace).';
  if (code.includes('requires-recent-login')) return 'Por seguridad, vuelva a escribir su contraseña.';
  if (code.includes('admin-restricted-operation')) return 'La creación de cuentas desde el navegador está desactivada: publique las funciones del servidor (ver FIREBASE.md).';
  if (code.includes('password-does-not-meet-requirements')) return 'La contraseña no cumple la política de seguridad (al menos ' + MIN_PASSWORD + ' caracteres, con letras y números).';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
  if (code.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo.';
  if (code.includes('weak-password')) return 'La contraseña es muy débil: use al menos ' + MIN_PASSWORD + ' caracteres, con letras y números.';
  if (code.includes('invalid-email')) return 'El correo no es válido.';
  if (code.includes('permission-denied')) return 'No tiene permiso para esta acción.';
  if (code.includes('api-key-not-valid') || code.includes('invalid-api-key')) return 'La configuración de Firebase no es válida (revise firebase-config.js).';
  if (code.includes('configuration-not-found') || code.includes('operation-not-allowed')) return 'El inicio de sesión con correo no está activado en Firebase (Authentication → Método de acceso).';
  if (code.includes('network')) return 'Sin conexión. Revise su internet.';
  return (err && err.message) || 'Ocurrió un error inesperado.';
}
