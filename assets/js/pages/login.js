// Inicio de sesión. La misma página sirve a médicos y administradores según
// <body data-role="doctor|admin">.

import { backend, isDemo } from '../services/backend.js';
import { busy, showError, toast } from '../ui/dom.js';
import { ROUTES } from './session.js';

export async function init() {
  const role = document.body.dataset.role === 'admin' ? 'admin' : 'doctor';
  const form = document.getElementById('login-form');
  const err = document.getElementById('login-error');
  const email = document.getElementById('email');
  const pass = document.getElementById('password');
  const submit = form.querySelector('button[type=submit]');

  // Si ya hay sesión con el rol correcto, entrar directo.
  try {
    const u = await backend.currentUser();
    if (u && u.role === role) { location.replace(ROUTES[role].home); return; }
  } catch (e) { /* sin sesión */ }

  const demo = document.getElementById('demo-note');
  if (demo) {
    demo.hidden = !isDemo;
    const fill = document.getElementById('fill-demo');
    if (fill) fill.addEventListener('click', () => {
      email.value = role === 'admin' ? 'admin@dentfrucer.com' : 'doctor@dentfrucer.com';
      pass.value = 'demo1234';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(err, '');
    if (!email.value.trim() || !pass.value) { showError(err, 'Ingrese su correo y contraseña.'); return; }
    busy(submit, true, 'Ingresando…');
    try {
      const user = await backend.signIn(email.value.trim(), pass.value);
      if (user.role !== role) {
        await backend.signOut();
        throw new Error(role === 'admin' ? 'Esta cuenta no tiene permisos de administración.' : 'Esta cuenta no tiene acceso al portal de médicos.');
      }
      location.href = ROUTES[role].home;
    } catch (ex) {
      showError(err, ex.message);
      busy(submit, false);
    }
  });

  const forgot = document.getElementById('forgot');
  if (forgot) forgot.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!email.value.trim()) { showError(err, 'Escriba su correo y vuelva a pulsar “¿Olvidó su contraseña?”.'); email.focus(); return; }
    try {
      await backend.resetPassword(email.value.trim());
      showError(err, '');
      toast('Si el correo está registrado, recibirá un enlace para restablecer la contraseña.');
    } catch (ex) { showError(err, ex.message); }
  });
}
