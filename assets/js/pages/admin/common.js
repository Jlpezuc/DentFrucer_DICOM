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
