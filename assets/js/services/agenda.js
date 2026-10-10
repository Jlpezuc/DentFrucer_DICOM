// Lógica de la agenda compartida por la página pública, el panel y el backend:
// turnos disponibles, claves de turno y normalización de los datos del paciente.

import { agendaConfig } from '../config/agenda-config.js';

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

// Nombres: se respetan mayúsculas escritas a propósito; si todo está en
// minúsculas o en mayúsculas se pasa a "Nombre Propio".
function tidyName(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s && (s === s.toLowerCase() || s === s.toUpperCase())) {
    s = s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  }
  return s;
}

export const LIMITS = { name: 60, email: 120, phone: 30, referrer: 80 };

// Valida y normaliza los datos del formulario. Devuelve { data } o { error }.
export function normalizeBooking(input) {
  const firstName = tidyName(input.firstName);
  const lastName = tidyName(input.lastName);
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').replace(/\s+/g, ' ').trim();
  const referrer = String(input.referrer || '').replace(/\s+/g, ' ').trim();
  if (!firstName || !lastName) return { error: 'Escriba su nombre y su apellido.' };
  if (firstName.length > LIMITS.name || lastName.length > LIMITS.name) return { error: 'El nombre o el apellido es demasiado largo.' };
  if (email && (email.length > LIMITS.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) return { error: 'El correo no es válido. Puede dejarlo en blanco.' };
  if (phone.length > LIMITS.phone || (phone && !/^[0-9+()\-. ]{6,}$/.test(phone))) return { error: 'El teléfono no es válido. Puede dejarlo en blanco.' };
  if (referrer.length > LIMITS.referrer) return { error: 'El nombre del médico es demasiado largo.' };
  if (!agendaConfig.exams.some((e) => e.id === input.exam)) return { error: 'Elija el tipo de examen.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !/^\d{2}:\d{2}$/.test(input.time || '')) return { error: 'Elija el día y la hora.' };
  return {
    data: { firstName, lastName, name: firstName + ' ' + lastName, email, phone, referrer, exam: input.exam, date: input.date, time: input.time }
  };
}

// ID del paciente creado desde la agenda. Si la persona deja correo o teléfono,
// el mismo nombre + contacto da siempre el mismo ID: quien agenda dos veces no
// queda duplicado en la lista de pacientes. Sin contacto no se puede saber si
// es la misma persona, así que cada cita crea su propio paciente.
export async function agendaPatientId(data, appointmentId) {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const contact = data.email || data.phone.replace(/\D/g, '') || 'cita:' + appointmentId;
  const bytes = new TextEncoder().encode(norm(data.name) + '|' + contact);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'ag_' + Array.from(hash.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function appointmentCode(id) { return 'C-' + id.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase(); }

export class SlotTakenError extends Error {
  constructor() { super('Ese horario acaba de ser reservado por otra persona. Elija otro, por favor.'); }
}
