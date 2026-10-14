// Utilidades compartidas por las secciones del panel de administración.

import { plainText } from '../../services/people.js';
import { escapeHtml } from '../../ui/dom.js';
import { initials } from '../../ui/format.js';

// Celda con avatar, nombre en negrita y una línea secundaria (HTML ya escapado).
export function personCell(name, subHtml, tagHtml = '') {
  return '<div class="cell-patient"><span class="avatar">' + initials(name) + '</span><div><strong>' + escapeHtml(name) + '</strong>' + tagHtml +
    '<small>' + (subHtml || '&nbsp;') + '</small></div></div>';
}

export const contactOf = (x) => [x.email, x.phone].filter(Boolean).map(escapeHtml).join(' · ');

export function doctorOptions(doctors, selected, emptyLabel = 'Sin médico') {
  return '<option value="">' + escapeHtml(emptyLabel) + '</option>' +
    doctors.map((d) => '<option value="' + escapeHtml(d.id) + '"' + (d.id === selected ? ' selected' : '') + '>' + escapeHtml(d.name) + '</option>').join('');
}

// Médico registrado cuyo nombre coincide con el texto escrito por el paciente
// ("Dra. Laura Méndez", "laura mendez"…), o undefined.
export function matchDoctor(doctors, text) {
  const clean = (s) => plainText(s).replace(/^(dra?|doctora?)\.?\s+/, '');
  const q = clean(text);
  if (q.length < 3) return undefined;
  return doctors.find((d) => { const n = clean(d.name); return n === q || n.includes(q) || q.includes(n); });
}

// Pestañas de filtro: botones con data-filter dentro de un contenedor.
export function bindTabs(containerId, onPick) {
  const buttons = document.querySelectorAll('#' + containerId + ' [data-filter]');
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
    onPick(b.dataset.filter);
  }));
}

// Valores de un formulario como objeto { name: valor }.
export function formValues(form) { return Object.fromEntries(new FormData(form)); }

// Nombres de los médicos de un examen o visita ("Sin médico" si no tiene).
export function doctorNames(doctors, ids, empty = 'Sin médico') {
  const names = (ids || []).map((id) => (doctors.find((d) => d.id === id) || {}).name || 'Médico eliminado');
  return names.length ? names.join(', ') : empty;
}

// --- Selector de varios médicos ---------------------------------------------------------
// Chips con los médicos elegidos (cada uno con ×) y un menú para agregar otro.
// El valor va en un <input type="hidden" name="doctorIds"> separado por comas.
//   html: doctorPickerHtml(doctors, ids)
//   comportamiento: bindDoctorPickers(contenedor, () => doctors, (picker, ids) => …)
export function doctorPickerHtml(doctors, ids = [], { name = 'doctorIds', emptyLabel = 'Sin médico: solo lo ve la clínica' } = {}) {
  const chosen = ids.map((id) => doctors.find((d) => d.id === id) || { id, name: 'Médico eliminado' });
  const rest = doctors.filter((d) => !ids.includes(d.id));
  return `<div class="doc-picker" data-doctor-picker>
    <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(ids.join(','))}">
    <div class="doc-chips">${chosen.length ? chosen.map((d) => `<span class="doc-chip">${escapeHtml(d.name)}<button type="button" data-remove-doctor="${escapeHtml(d.id)}" aria-label="Quitar a ${escapeHtml(d.name)}">×</button></span>`).join('') : `<span class="doc-empty">${escapeHtml(emptyLabel)}</span>`}</div>
    ${rest.length ? `<select class="input select input-sm doc-add" data-add-doctor aria-label="Agregar médico"><option value="">+ Agregar médico…</option>${rest.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('')}</select>` : ''}
  </div>`;
}

export const pickerValue = (picker) => (picker.querySelector('input[type=hidden]').value || '').split(',').filter(Boolean);

export function bindDoctorPickers(root, getDoctors, onChange = () => {}) {
  const redraw = (picker, ids) => {
    const name = picker.querySelector('input[type=hidden]').name;
    const empty = picker.querySelector('.doc-empty');
    const html = doctorPickerHtml(getDoctors(), ids, { name, emptyLabel: empty ? empty.textContent : undefined });
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const next = tmp.firstElementChild;
    picker.replaceWith(next);
    onChange(next, ids);
    return next;
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-doctor]');
    const picker = b && b.closest('[data-doctor-picker]');
    if (!picker) return;
    redraw(picker, pickerValue(picker).filter((id) => id !== b.dataset.removeDoctor));
  });
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-add-doctor]');
    const picker = sel && sel.closest('[data-doctor-picker]');
    if (!picker || !sel.value) return;
    e.stopPropagation();
    redraw(picker, [...pickerValue(picker), sel.value]);
  });
}
