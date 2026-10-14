// Utilidades de interfaz compartidas por todas las páginas.

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3000);
}

// Deshabilita un botón y muestra un texto mientras dura una acción.
export function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn._label = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'Procesando…'; }
  else { btn.disabled = false; if (btn._label) btn.innerHTML = btn._label; }
}

export function showError(el, msg) {
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
}

// Modal simple basado en .modal-backdrop (ver styles.css). Varias ventanas
// pueden abrirse una sobre otra (por ejemplo, un cobro desde una visita): la
// última abierta queda encima y Esc cierra solo esa.
const openModals = [];

export function modal(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const close = () => {
    el.classList.remove('open');
    const i = openModals.indexOf(el);
    if (i >= 0) openModals.splice(i, 1);
  };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => {
    // Con el visor abierto encima, Esc es del visor.
    if (e.key === 'Escape' && openModals[openModals.length - 1] === el && !document.body.classList.contains('dv-open')) close();
  });
  return {
    el,
    open() {
      close();
      openModals.push(el);
      el.style.zIndex = 100 + openModals.length;
      el.classList.add('open');
      const f = el.querySelector('input, select, button[data-close]');
      if (f) f.focus();
    },
    close
  };
}
