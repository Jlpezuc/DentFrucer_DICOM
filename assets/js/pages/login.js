// Inicio de sesión. La misma página sirve a médicos y administradores según
// <body data-role="doctor|admin">. Si la cuenta tiene verificación en dos
// pasos, después de la contraseña se pide el código de la app de autenticación.

import { backend, isDemo, TwoFactorRequiredError } from '../services/backend.js';
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

  if (new URLSearchParams(location.search).get('inactividad') === '1') {
    showError(err, 'Por seguridad, la sesión se cerró tras 30 minutos sin actividad. Vuelva a ingresar.');
  }

  // Segundo paso: el código de 6 dígitos (se agrega al formulario cuando hace falta).
  let codeInput = null;
  function askCode() {
    form.querySelectorAll('.field, .auth-meta').forEach((el) => { el.hidden = true; });
    form.insertAdjacentHTML('afterbegin', `<div class="mfa-login"><p><strong>Verificación en dos pasos</strong><br>Escriba el código de 6 dígitos que muestra su app de autenticación.</p>
      <div class="field"><label for="mfa-login-code">Código</label><input class="input mfa-code" id="mfa-login-code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required></div></div>`);
    form.prepend(err);
    codeInput = document.getElementById('mfa-login-code');
    submit.textContent = 'Verificar';
    codeInput.focus();
  }

  async function enter(user) {
    if (user.role !== role) {
      await backend.signOut();
      throw new Error(role === 'admin' ? 'Esta cuenta no tiene permisos de administración.' : 'Esta cuenta no tiene acceso al portal de médicos.');
    }
    location.href = ROUTES[role].home;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(err, '');
    if (codeInput) {
      if (!codeInput.value.trim()) { showError(err, 'Escriba el código de su app.'); return; }
      busy(submit, true, 'Verificando…');
      try { await enter(await backend.completeTwoFactor(codeInput.value)); } catch (ex) { showError(err, ex.message); busy(submit, false); codeInput.select(); }
      return;
    }
    if (!email.value.trim() || !pass.value) { showError(err, 'Ingrese su correo y contraseña.'); return; }
    busy(submit, true, 'Ingresando…');
    try {
      await enter(await backend.signIn(email.value.trim(), pass.value));
    } catch (ex) {
      busy(submit, false);
      if (ex instanceof TwoFactorRequiredError) { askCode(); return; }
      showError(err, ex.message);
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
