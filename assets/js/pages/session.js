// Sesión: rutas por rol y guarda de acceso para las páginas privadas.

import { backend } from '../services/backend.js';
import { initials } from '../ui/format.js';

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
  return user;
}

// Nombre, correo, cargo e iniciales de la cuenta en los elementos data-user-*.
export function showUser(user) {
  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = user.name; });
  document.querySelectorAll('[data-user-email]').forEach((el) => { el.textContent = user.email; el.title = user.email; });
  document.querySelectorAll('[data-user-title]').forEach((el) => { el.textContent = user.title; });
  document.querySelectorAll('[data-user-initials]').forEach((el) => { el.textContent = initials(user.name); });
}
