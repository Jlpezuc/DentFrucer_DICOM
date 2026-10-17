// Sesión: rutas por rol y guarda de acceso para las páginas privadas.

import { backend } from '../services/backend.js';
import { toast } from '../ui/dom.js';
import { initials } from '../ui/format.js';

// Por seguridad, la sesión se cierra tras este tiempo sin usar la página.
export const IDLE_MINUTES = 30;

export const ROUTES = {
  doctor: { login: 'login.html', home: 'portal.html' },
  admin: { login: 'admin-login.html', home: 'admin.html' }
};

// Devuelve el usuario si tiene el rol pedido; si no, redirige a su login.
export async function requireRole(role) {
  let user = null;
  try { user = await backend.currentUser(); } catch (e) { user = null; }
  if (!user || user.role !== role) {
    location.replace(ROUTES[role].login);
    return null;
  }
  showUser(user);
  document.querySelectorAll('[data-logout]').forEach((el) => el.addEventListener('click', async () => {
    await backend.signOut();
    location.href = ROUTES[role].login;
  }));
  document.body.removeAttribute('data-guard');
  closeWhenIdle(role);
  return user;
}

// Cierra la sesión tras IDLE_MINUTES sin actividad (mouse, teclado, toque o
// rueda), con un aviso un minuto antes. Protege los computadores compartidos.
function closeWhenIdle(role) {
  let last = Date.now();
  let warned = false;
  const mark = () => { last = Date.now(); warned = false; };
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, mark, { passive: true, capture: true }));
  const timer = setInterval(async () => {
    const idle = Date.now() - last;
    if (idle >= IDLE_MINUTES * 60000) {
      clearInterval(timer);
      await backend.signOut();
      location.replace(ROUTES[role].login + '?inactividad=1');
    } else if (!warned && idle >= (IDLE_MINUTES - 1) * 60000) {
      warned = true;
      toast('Por seguridad, la sesión se cerrará en 1 minuto por inactividad. Mueva el mouse para seguir.');
    }
  }, 15000);
}

// Nombre, correo, cargo e iniciales de la cuenta en los elementos data-user-*.
export function showUser(user) {
  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = user.name; });
  document.querySelectorAll('[data-user-email]').forEach((el) => { el.textContent = user.email; el.title = user.email; });
  document.querySelectorAll('[data-user-title]').forEach((el) => { el.textContent = user.title; });
  document.querySelectorAll('[data-user-initials]').forEach((el) => { el.textContent = initials(user.name); });
}
