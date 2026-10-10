// Formato de datos para mostrar en pantalla.

import { escapeHtml } from './dom.js';

export function initials(name) {
  return String(name || '?').replace(/^(Dr\.|Dra\.)\s*/, '').split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtSize(bytes) {
  if (!bytes) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}

// Fecha de hoy en formato YYYY-MM-DD (hora local).
export function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function statusBadge(s) {
  const map = { 'Nuevo': 'blue', 'Visto': 'green' };
  return '<span class="badge ' + (map[s] || 'gray') + '">' + escapeHtml(s || '—') + '</span>';
}
