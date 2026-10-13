// Utilidades comunes a las dos implementaciones del backend.

export const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');
export const byDateTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
export const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es');
export const studyCode = (id) => 'EST-' + new Date().getFullYear() + '-' + id.slice(0, 5).toUpperCase();

// Paciente que se crea al agendar: solo identidad y contacto (sin médico).
export const agendaPatient = (a) => ({
  name: a.name, firstName: a.firstName, lastName: a.lastName, email: a.email, phone: a.phone, code: '', age: null, source: 'agenda'
});

// Datos del paciente copiados en cada estudio (los usa el portal del médico).
export const studyPatientFields = (p) => ({ patientName: p.name, patientCode: p.code || '', patientAge: p.age || null });

// Archivos de un examen.
export const sizeOf = (files) => files.reduce((n, f) => n + (f.size || 0), 0);
export const cleanFileName = (name) => String(name || '').replace(/[\\/]/g, '-').trim().slice(0, 120) || 'archivo';

// Cambios permitidos en un examen desde el panel.
export function studyEdits({ modality, description, date, doctorId }) {
  const out = {};
  if (modality !== undefined) out.modality = String(modality).trim();
  if (description !== undefined) out.description = String(description).trim() || out.modality || '';
  if (date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('La fecha no es válida.');
    out.date = date;
  }
  if (doctorId !== undefined) out.doctorId = doctorId || null;
  return out;
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

export function friendlyAuthError(err) {
  const code = (err && err.code) || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
  if (code.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo.';
  if (code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.includes('invalid-email')) return 'El correo no es válido.';
  if (code.includes('permission-denied')) return 'No tiene permiso para esta acción.';
  if (code.includes('api-key-not-valid') || code.includes('invalid-api-key')) return 'La configuración de Firebase no es válida (revise firebase-config.js).';
  if (code.includes('configuration-not-found') || code.includes('operation-not-allowed')) return 'El inicio de sesión con correo no está activado en Firebase (Authentication → Método de acceso).';
  if (code.includes('network')) return 'Sin conexión. Revise su internet.';
  return (err && err.message) || 'Ocurrió un error inesperado.';
}
