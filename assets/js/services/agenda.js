// Lógica de la agenda compartida por la página pública, el panel y el backend:
// turnos disponibles, claves de turno, estados y validación de las citas.

import { agendaConfig } from '../config/agenda-config.js';
import { LIMITS, normalizePerson, plainText } from './people.js';

const pad = (n) => String(n).padStart(2, '0');

// 'AAAA-MM-DD' de una fecha local.
export function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function parseIso(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(iso, n) { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoDate(d); }

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => pad(Math.floor(min / 60)) + ':' + pad(min % 60);

// Identificador del turno: también es el ID del documento en la colección "slots",
// lo que impide que dos citas ocupen el mismo turno.
export function slotId(date, time) { return date + '_' + time.replace(':', ''); }

export function examLabel(id) {
  const e = agendaConfig.exams.find((x) => x.id === id);
  return e ? e.label : id;
}

// Primer y último día que se pueden agendar.
export function bookingRange(now = new Date()) {
  const from = isoDate(now);
  return { from, to: addDays(from, agendaConfig.daysAhead) };
}

// Horas del día según el horario (sin considerar los turnos ocupados).
export function dayTimes(date) {
  if (agendaConfig.closedDates.includes(date)) return [];
  const ranges = agendaConfig.hours[parseIso(date).getDay()] || [];
  const out = [];
  for (const [a, b] of ranges) {
    for (let t = toMin(a); t + agendaConfig.slotMinutes <= toMin(b); t += agendaConfig.slotMinutes) out.push(toHHMM(t));
  }
  return out;
}

// Horas que el panel ofrece para un día: las del horario o, si ese día no se
// atiende (sábado, feriado…), todo el día, para citas fuera de horario.
export function adminDayTimes(date) {
  const times = dayTimes(date);
  if (times.length) return { times, outside: false };
  const all = [];
  for (let t = 7 * 60; t + agendaConfig.slotMinutes <= 20 * 60; t += agendaConfig.slotMinutes) all.push(toHHMM(t));
  return { times: all, outside: true };
}

// Turnos de un día con su estado: libre, ocupado o ya pasado (respetando la anticipación mínima).
export function daySlots(date, busy, now = new Date()) {
  const limit = new Date(now.getTime() + agendaConfig.minNoticeMinutes * 60000);
  return dayTimes(date).map((time) => {
    const [h, m] = time.split(':').map(Number);
    const at = parseIso(date);
    at.setHours(h, m, 0, 0);
    const state = at < limit ? 'past' : busy.has(slotId(date, time)) ? 'busy' : 'free';
    return { time, state };
  });
}

export const APPOINTMENT_STATUSES = ['Pendiente', 'Atendida', 'No asistió', 'Cancelada'];
export const isActive = (appt) => appt.status !== 'Cancelada';

// Valida y normaliza una cita (formulario público o panel). Devuelve { data } o { error }.
export function normalizeBooking(input) {
  const { data: person, error } = normalizePerson(input);
  if (error) return { error };
  const referrer = String(input.referrer || '').replace(/\s+/g, ' ').trim();
  if (referrer.length > LIMITS.referrer) return { error: 'El nombre del médico es demasiado largo.' };
  if (!agendaConfig.exams.some((e) => e.id === input.exam)) return { error: 'Elija el tipo de examen.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !/^\d{2}:\d{2}$/.test(input.time || '')) return { error: 'Elija el día y la hora.' };
  return { data: { ...person, referrer, exam: input.exam, date: input.date, time: input.time } };
}

// ID del paciente creado desde la agenda. Si la persona deja correo o teléfono,
// el mismo nombre + contacto da siempre el mismo ID: quien agenda dos veces no
// queda duplicado en la lista de pacientes. Sin contacto no se puede saber si
// es la misma persona, así que cada cita crea su propio paciente.
export async function agendaPatientId(data, appointmentId) {
  const contact = data.email || data.phone.replace(/\D/g, '') || 'cita:' + appointmentId;
  const bytes = new TextEncoder().encode(plainText(data.name) + '|' + contact);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'ag_' + Array.from(hash.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function appointmentCode(id) { return 'C-' + id.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase(); }

export class SlotTakenError extends Error {
  constructor() { super('Ese horario acaba de ser reservado por otra persona. Elija otro, por favor.'); }
}
