// Capa de datos de DentFrucer. Dos implementaciones con la misma interfaz:
//   backend/firebase.js  Authentication + Firestore + Storage (cuando firebase-config.js está completo)
//   backend/demo.js      datos de ejemplo, para ver la interfaz sin Firebase
//
// Modelo en Firestore:
//  users/{uid}        { name, email, role: 'admin' | 'doctor', specialty }
//  patients/{id}      { name, firstName, lastName, email, phone, code, age, source: 'agenda' | 'panel', createdAt }
//                     Solo identidad y contacto: los pacientes NO tienen médico.
//  studies/{id}       { code, patientId, patientName, patientCode, patientAge, doctorId,
//                       modality, description, date: 'YYYY-MM-DD', files: [{ name, path, size }],
//                       totalSize, status: 'Nuevo' | 'Visto', createdAt }
//                     Cada examen pertenece a un paciente y a un médico (doctorId), que lo ve en su portal.
//  appointments/{id}  { code, firstName, lastName, name, email, phone, referrer, exam,
//                       date: 'YYYY-MM-DD', time: 'HH:MM', slotId, patientId,
//                       status: 'Pendiente' | 'Atendida' | 'No asistió' | 'Cancelada', createdAt }
//  slots/{fecha_hora} { date, time, appointmentId }   turnos ocupados, sin datos personales
// Archivos en Storage: studies/{studyId}/{nombre de archivo}

import { createDemoBackend } from './backend/demo.js';
import { createFirebaseBackend } from './backend/firebase.js';
import { isDemo } from './mode.js';

export { isDemo };
export { AccessDisabledError } from './backend/shared.js';

export const backend = isDemo ? createDemoBackend() : await createFirebaseBackend();
