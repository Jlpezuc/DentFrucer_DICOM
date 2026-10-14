// Servicios y horarios: los servicios que se agendan, se cargan y se cobran
// (nombre, descripción, precio y si aparecen en la agenda en línea) y el
// horario en que los pacientes pueden reservar (días, rangos de horas, duración
// del turno, anticipación y días cerrados). Todo se guarda junto en
// settings/agenda (services/settings.js) y se aplica de inmediato.

import { agendaConfig } from '../../config/agenda-config.js';
import { backend } from '../../services/backend.js';
import { fmtCLP } from '../../services/payments.js';
import { applySettings, currentSettings, newServiceId, SLOT_OPTIONS, toStored } from '../../services/settings.js';
import { busy, escapeHtml, modal, showError, toast } from '../../ui/dom.js';
import { fmtDate } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { formValues } from './common.js';

// Lunes primero; 0 = domingo como en Date.getDay().
const DAYS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']];

export function createSchedule(ctx) {
  const { state } = ctx;
  const $ = (id) => document.getElementById(id);
  const servicesBody = $('services-body');
  const hoursForm = $('hours-form');

  // Guarda la configuración completa y la aplica en esta página.
  async function save(cfg, message) {
    const data = await backend.saveAgendaSettings(cfg);
    applySettings(toStored(data));
    toast(message);
    render();
    await ctx.reload();
  }

  // --- Servicios ---------------------------------------------------------------------------
  function renderServices() {
    const used = new Set(state.appointments.map((a) => a.exam));
    servicesBody.innerHTML = agendaConfig.exams.map((e) => `
      <tr class="${e.active === false ? 'row-muted' : ''}">
        <td><strong>${escapeHtml(e.label)}</strong><small class="muted cell-note">${escapeHtml(e.detail || '')}</small></td>
        <td class="num"><strong>${e.price ? fmtCLP(e.price) : '<span class="warn-text">Sin precio</span>'}</strong></td>
        <td>${e.active === false ? '<span class="badge gray">No se agenda</span>' : '<span class="badge green">Disponible</span>'}${used.has(e.id) ? ' <small class="muted">· con citas</small>' : ''}</td>
        <td><div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-edit-service="${escapeHtml(e.id)}">${icon('edit')} Editar</button></div></td>
      </tr>`).join('');
  }

  const m = modal('service-modal');
  const form = $('service-form');
  const err = form.querySelector('.form-error');
  let editing = null;

  function openService(service) {
    editing = service || null;
    form.reset();
    showError(err, '');
    $('service-modal-title').textContent = service ? 'Editar servicio' : 'Nuevo servicio';
    $('sv-label').value = service ? service.label : '';
    $('sv-detail').value = service ? service.detail || '' : '';
    $('sv-price').value = service && service.price ? service.price : '';
    $('sv-active').checked = service ? service.active !== false : true;
    $('sv-delete').hidden = !service;
    m.open();
  }
  document.querySelector('[data-new-service]').addEventListener('click', () => openService(null));
  servicesBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit-service]');
    if (b) openService(agendaConfig.exams.find((x) => x.id === b.dataset.editService));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const v = formValues(form);
    const cfg = currentSettings();
    const service = {
      id: editing ? editing.id : newServiceId(v.label, cfg.exams),
      label: v.label, detail: v.detail,
      price: Math.round(Number(String(v.price).replace(/[^\d]/g, '')) || 0),
      active: $('sv-active').checked
    };
    cfg.exams = editing ? cfg.exams.map((x) => (x.id === editing.id ? service : x)) : [...cfg.exams, service];
    showError(err, '');
    busy(btn, true, 'Guardando…');
    try {
      await save(cfg, editing ? 'Servicio actualizado.' : 'Servicio agregado.');
      m.close();
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  $('sv-delete').addEventListener('click', async () => {
    if (!editing) return;
    const used = state.appointments.some((a) => a.exam === editing.id);
    const msg = used
      ? '«' + editing.label + '» tiene citas. Si lo elimina, esas citas lo seguirán mostrando con su código. Para que no se agende más, puede solo desmarcar «Se puede agendar en línea». ¿Eliminarlo igual?'
      : '¿Eliminar el servicio «' + editing.label + '»?';
    if (!confirm(msg)) return;
    const cfg = currentSettings();
    cfg.exams = cfg.exams.filter((x) => x.id !== editing.id);
    try { await save(cfg, 'Servicio eliminado.'); m.close(); } catch (ex) { showError(err, ex.message); }
  });

  // --- Horario -------------------------------------------------------------------------------
  let draft = null; // horario en edición (se descarta al guardar o al volver a dibujar)

  function renderHours() {
    const cfg = draft || (draft = currentSettings());
    const rangeRow = (day, [a, b], i) => `
      <span class="time-range" data-range="${i}">
        <input class="input input-sm" type="time" step="300" value="${escapeHtml(a)}" data-day="${day}" data-i="${i}" data-edge="0" aria-label="Desde">
        <span>a</span>
        <input class="input input-sm" type="time" step="300" value="${escapeHtml(b)}" data-day="${day}" data-i="${i}" data-edge="1" aria-label="Hasta">
        <button type="button" class="icon-btn" data-remove-range="${day}:${i}" aria-label="Quitar rango">${icon('x')}</button>
      </span>`;
    hoursForm.innerHTML = `
      <div class="form-error" role="alert"></div>
      <div class="week-hours">${DAYS.map(([d, name]) => {
        const ranges = cfg.hours[d] || [];
        return `<div class="day-hours${ranges.length ? '' : ' closed'}">
          <label class="check"><input type="checkbox" data-open-day="${d}"${ranges.length ? ' checked' : ''}> <strong>${name}</strong></label>
          <div class="day-ranges">${ranges.length ? ranges.map((r, i) => rangeRow(d, r, i)).join('') + `<button type="button" class="btn btn-ghost btn-sm" data-add-range="${d}">${icon('plus')} Rango</button>` : '<span class="muted">Cerrado</span>'}</div>
        </div>`;
      }).join('')}</div>
      <div class="form-row three">
        <div class="field"><label for="hs-slot">Duración de cada turno</label><select class="input select" id="hs-slot">${SLOT_OPTIONS.concat(SLOT_OPTIONS.includes(cfg.slotMinutes) ? [] : [cfg.slotMinutes]).map((n) => `<option value="${n}"${n === cfg.slotMinutes ? ' selected' : ''}>${n} minutos</option>`).join('')}</select></div>
        <div class="field"><label for="hs-ahead">Se puede agendar hasta</label><select class="input select" id="hs-ahead">${[14, 30, 45, 60, 90, 120, 180].concat([14, 30, 45, 60, 90, 120, 180].includes(cfg.daysAhead) ? [] : [cfg.daysAhead]).map((n) => `<option value="${n}"${n === cfg.daysAhead ? ' selected' : ''}>${n} días adelante</option>`).join('')}</select></div>
        <div class="field"><label for="hs-notice">Anticipación mínima</label><select class="input select" id="hs-notice">${[[0, 'Sin mínimo'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [720, '12 horas'], [1440, '1 día'], [2880, '2 días']].concat([0, 60, 120, 240, 720, 1440, 2880].includes(cfg.minNoticeMinutes) ? [] : [[cfg.minNoticeMinutes, cfg.minNoticeMinutes + ' minutos']]).map(([n, t]) => `<option value="${n}"${n === cfg.minNoticeMinutes ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      </div>
      <div class="field">
        <span class="field-label">Días sin atención <span class="opt">(feriados, vacaciones)</span></span>
        <div class="closed-dates">${cfg.closedDates.map((d) => `<span class="doc-chip">${fmtDate(d)}<button type="button" data-remove-closed="${d}" aria-label="Quitar">×</button></span>`).join('') || '<span class="muted">Ninguno</span>'}
          <input class="input input-sm" type="date" id="hs-closed" aria-label="Agregar día sin atención"><button type="button" class="btn btn-ghost btn-sm" data-add-closed>${icon('plus')} Agregar</button></div>
      </div>
      <div class="exam-form-actions"><button type="button" class="btn btn-ghost" data-reset-hours>Descartar cambios</button><button type="submit" class="btn btn-primary">Guardar horario</button></div>`;
  }

  const readTop = () => {
    draft.slotMinutes = Number($('hs-slot').value);
    draft.daysAhead = Number($('hs-ahead').value);
    draft.minNoticeMinutes = Number($('hs-notice').value);
  };
  hoursForm.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.edge !== undefined) draft.hours[t.dataset.day][t.dataset.i][Number(t.dataset.edge)] = t.value;
  });
  hoursForm.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.openDay !== undefined) {
      readTop();
      const d = Number(t.dataset.openDay);
      if (t.checked) draft.hours[d] = [['09:00', '13:00'], ['14:00', '18:00']];
      else delete draft.hours[d];
      renderHours();
    } else if (t.id && t.id.startsWith('hs-') && t.id !== 'hs-closed') readTop();
  });
  hoursForm.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.type === 'submit') return;
    readTop();
    if (b.dataset.addRange) {
      const list = draft.hours[b.dataset.addRange] || [];
      const last = list[list.length - 1];
      list.push(last ? [last[1], last[1] < '20:00' ? String(Math.min(23, Number(last[1].slice(0, 2)) + 2)).padStart(2, '0') + ':00' : '23:00'] : ['09:00', '13:00']);
      draft.hours[b.dataset.addRange] = list;
    } else if (b.dataset.removeRange) {
      const [d, i] = b.dataset.removeRange.split(':');
      draft.hours[d].splice(Number(i), 1);
      if (!draft.hours[d].length) delete draft.hours[d];
    } else if (b.hasAttribute('data-add-closed')) {
      const v = $('hs-closed').value;
      if (!v) return;
      if (!draft.closedDates.includes(v)) draft.closedDates = [...draft.closedDates, v].sort();
    } else if (b.dataset.removeClosed) {
      draft.closedDates = draft.closedDates.filter((d) => d !== b.dataset.removeClosed);
    } else if (b.hasAttribute('data-reset-hours')) {
      draft = null;
    } else return;
    renderHours();
  });
  hoursForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    readTop();
    const btn = hoursForm.querySelector('button[type=submit]');
    const errEl = hoursForm.querySelector('.form-error');
    showError(errEl, '');
    busy(btn, true, 'Guardando…');
    try {
      // Los servicios se toman de lo guardado (pudieron cambiar mientras se editaba el horario).
      await save({ ...draft, exams: currentSettings().exams }, 'Horario guardado. La agenda en línea ya muestra el nuevo horario.');
      draft = null;
      renderHours();
    } catch (ex) { showError(errEl, ex.message); busy(btn, false); }
  });

  function render() {
    renderServices();
    if (!draft) renderHours();
  }

  return { render };
}
