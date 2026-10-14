// Servicios y horario de la agenda, editables desde el panel (Servicios y
// horarios) y guardados en Firestore en settings/agenda. Lo que define
// config/agenda-config.js son los valores iniciales: se usan mientras no se
// haya guardado nada. Al abrir la agenda pública o el panel, applySettings()
// copia lo guardado sobre agendaConfig, así el resto del código no cambia.
//
//  settings/agenda { slotMinutes, daysAhead, minNoticeMinutes, closedDates: ['AAAA-MM-DD'],
//                    hours: { '1': ['09:00-13:00', '14:00-19:00'], … }   (0 = domingo)
//                    services: [{ id, label, detail, price, active }],
//                    examIds: [ids de los servicios activos], updatedAt }
// Firestore no guarda listas dentro de listas: por eso cada rango es un texto
// "inicio-fin". examIds lo usan las reglas para validar la agenda pública.

import { agendaConfig } from '../config/agenda-config.js';

const EDITABLE = ['slotMinutes', 'hours', 'daysAhead', 'minNoticeMinutes', 'closedDates', 'exams'];
const copy = (v) => JSON.parse(JSON.stringify(v));
export const SLOT_OPTIONS = [10, 15, 20, 30, 40, 45, 60];

// Configuración editable actual (copia, para trabajar en un formulario).
export function currentSettings() {
  return copy(Object.fromEntries(EDITABLE.map((k) => [k, agendaConfig[k]])));
}

export function applySettings(stored) {
  if (!stored) return;
  const cfg = fromStored(stored);
  if (cfg) Object.assign(agendaConfig, cfg);
}

export const activeServices = () => agendaConfig.exams.filter((e) => e.active !== false);
export const serviceById = (id) => agendaConfig.exams.find((e) => e.id === id);

// Servicio de un examen. Los exámenes guardan serviceId y el nombre del
// servicio al cargarlos (service); se muestra el nombre vigente del servicio.
// Los exámenes anteriores guardaban "modality", que coincide con el id de los
// servicios iniciales (CBCT, Panorámica…).
export const studyServiceId = (s) => s.serviceId || s.modality || '';
export function studyServiceName(s) {
  const sv = serviceById(studyServiceId(s));
  return sv ? sv.label : s.service || s.modality || 'Examen';
}

// --- Conversión para Firestore -----------------------------------------------------------
export function toStored(cfg) {
  return {
    slotMinutes: cfg.slotMinutes,
    daysAhead: cfg.daysAhead,
    minNoticeMinutes: cfg.minNoticeMinutes,
    closedDates: cfg.closedDates,
    hours: Object.fromEntries(Object.entries(cfg.hours).map(([d, ranges]) => [String(d), ranges.map(([a, b]) => a + '-' + b)])),
    services: cfg.exams,
    examIds: cfg.exams.filter((e) => e.active !== false).map((e) => e.id)
  };
}

function fromStored(s) {
  if (!s || !Array.isArray(s.services)) return null;
  return {
    slotMinutes: s.slotMinutes,
    daysAhead: s.daysAhead,
    minNoticeMinutes: s.minNoticeMinutes,
    closedDates: s.closedDates || [],
    hours: Object.fromEntries(Object.entries(s.hours || {}).map(([d, ranges]) => [Number(d), ranges.map((r) => r.split('-'))])),
    exams: s.services.map(({ id, label, detail, price, active }) => ({ id, label, detail: detail || '', price: Number(price) || 0, active: active !== false }))
  };
}

// --- Validación ---------------------------------------------------------------------------
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');

// Valida la configuración del formulario. Devuelve { data } o { error }.
export function validateSettings(cfg) {
  const slot = Number(cfg.slotMinutes);
  if (!Number.isInteger(slot) || slot < 5 || slot > 240) return { error: 'La duración del turno no es válida.' };
  const daysAhead = Number(cfg.daysAhead);
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 365) return { error: 'Los días que se pueden agendar deben ir de 1 a 365.' };
  const minNotice = Number(cfg.minNoticeMinutes);
  if (!Number.isInteger(minNotice) || minNotice < 0 || minNotice > 10080) return { error: 'La anticipación mínima no es válida.' };

  const hours = {};
  for (const [d, ranges] of Object.entries(cfg.hours || {})) {
    const clean = ranges.filter(([a, b]) => a || b);
    for (const [a, b] of clean) {
      if (!isTime(a) || !isTime(b)) return { error: 'Revise las horas del horario: use el formato 09:00.' };
      if (toMin(a) >= toMin(b)) return { error: 'En el horario, cada rango debe terminar después de empezar (' + a + '–' + b + ').' };
    }
    clean.sort((x, y) => toMin(x[0]) - toMin(y[0]));
    for (let i = 1; i < clean.length; i++) {
      if (toMin(clean[i][0]) < toMin(clean[i - 1][1])) return { error: 'Hay rangos del horario que se superponen el mismo día.' };
    }
    if (clean.length) hours[Number(d)] = clean;
  }

  const closedDates = [...new Set((cfg.closedDates || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();

  const ids = new Set();
  const exams = [];
  for (const e of cfg.exams || []) {
    const label = String(e.label || '').replace(/\s+/g, ' ').trim();
    if (!label) return { error: 'Cada servicio necesita un nombre.' };
    if (label.length > 60) return { error: 'El nombre «' + label.slice(0, 20) + '…» es demasiado largo.' };
    const price = Number(e.price);
    if (!Number.isInteger(price) || price < 0 || price > 100000000) return { error: 'El precio de «' + label + '» no es válido.' };
    if (!e.id || ids.has(e.id)) return { error: 'Hay servicios repetidos.' };
    ids.add(e.id);
    exams.push({ id: e.id, label, detail: String(e.detail || '').trim().slice(0, 160), price, active: e.active !== false });
  }
  if (!exams.some((e) => e.active)) return { error: 'Deje al menos un servicio disponible para agendar.' };

  return { data: { slotMinutes: slot, daysAhead, minNoticeMinutes: minNotice, hours, closedDates, exams } };
}

// ID de un servicio nuevo: su nombre simplificado, sin repetir uno existente.
export function newServiceId(label, existing) {
  const base = String(label || 'servicio').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'servicio';
  let id = base;
  for (let i = 2; existing.some((e) => e.id === id); i++) id = base + '-' + i;
  return id;
}
