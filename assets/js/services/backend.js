// Capa de datos de DentFrucer. Dos implementaciones con la misma interfaz:
//   backend/firebase.js  Authentication + Firestore + Storage (cuando firebase-config.js está completo)
//   backend/demo.js      datos de ejemplo, para ver la interfaz sin Firebase
//
// Modelo en Firestore (detalle en FIREBASE.md):
//  users/{uid}        { name, email, role: 'admin' | 'doctor', specialty,
//                       description, superadmin, permissions, disabled }   (permisos: services/permissions.js)
//  patients/{id}      { name, firstName, lastName, email, phone, code, age, source: 'agenda' | 'panel', createdAt }
//                     Solo identidad y contacto: los pacientes NO tienen médico.
//  studies/{id}       { code, patientId, patientName, patientCode, patientAge, doctorIds, doctorId,
//                       serviceId, service, description, date: 'YYYY-MM-DD', files: [{ name, path, size }],
//                       totalSize, status: 'Nuevo' | 'Visto', paid (visita pagada), createdAt, updatedAt }
//                     Cada examen es de un paciente y de uno o varios médicos (doctorIds; doctorId = el primero).
//                     updatedAt: último cambio hecho por la clínica (orden dentro de la visita).
//  appointments/{id}  { code, firstName, lastName, name, email, phone, referrer, exam,
//                       date: 'YYYY-MM-DD', time: 'HH:MM', slotId, patientId,
//                       status: 'Pendiente' | 'Atendida' | 'No asistió' | 'Cancelada', createdAt }
//  slots/{fecha_hora} { date, time, appointmentId }   turnos ocupados, sin datos personales
//  payments/{id}      cobros (services/payments.js)
//  settings/agenda    servicios y horario de la agenda (services/settings.js)
// Archivos en Storage: studies/{studyId}/{nombre de archivo}

import { createDemoBackend } from './backend/demo.js';
import { createFirebaseBackend } from './backend/firebase.js';
import { isDemo } from './mode.js';

export { isDemo };
export { AccessDisabledError } from './backend/shared.js';

export const backend = isDemo ? createDemoBackend() : await createFirebaseBackend();
