// Verificación en dos pasos (médicos y administración): además de la
// contraseña, al ingresar se pide el código de 6 dígitos de una app de
// autenticación del teléfono (Google Authenticator, Microsoft Authenticator,
// Authy…). Así, aunque alguien conozca la contraseña, no puede entrar.
//
//   initTwoFactor({ banner })  agrega la ventana; la abren los botones
//                              data-open="mfa". Con banner (un elemento), si la
//                              cuenta no la tiene activada muestra un aviso.
//
// Pasos para activarla: confirmar la contraseña (Firebase lo exige), confirmar
// el correo si aún no está verificado, escanear el código QR y escribir el
// primer código. Para desactivarla se confirma la contraseña.

import { backend, TwoFactorRequiredError } from '../services/backend.js';
import { busy, escapeHtml, modal, showError, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const BANNER_KEY = 'dentfrucer.mfaBannerHidden';

const MARKUP = `
  <div class="modal-backdrop" id="mfa-modal" role="dialog" aria-modal="true" aria-labelledby="mfa-modal-title">
    <div class="modal sm">
      <div class="modal-head"><h3 id="mfa-modal-title">Verificación en dos pasos</h3><button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x')}</button></div>
      <div class="modal-body">
        <div class="form-error" role="alert"></div>
        <div class="mfa-body" id="mfa-body"></div>
      </div>
    </div>
  </div>`;

const codeField = (id, label = 'Código de 6 dígitos') => `
  <div class="field"><label for="${id}">${label}</label>
    <input class="input mfa-code" id="${id}" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="7" placeholder="123456" required></div>`;

export function initTwoFactor({ banner = null } = {}) {
  document.body.insertAdjacentHTML('beforeend', MARKUP);
  const m = modal('mfa-modal');
  const body = document.getElementById('mfa-body');
  const err = m.el.querySelector('.form-error');
  let status = null;

  const fail = (e) => showError(err, e.message || String(e));

  // Formulario de un paso: onSubmit(valores) se ejecuta con el botón en espera.
  function step(html, onSubmit, submitLabel) {
    body.innerHTML = `<form class="mfa-step" novalidate>${html}
      <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="submit">${submitLabel}</button></div></form>`;
    const form = body.querySelector('form');
    const first = form.querySelector('input');
    if (first) first.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showError(err, '');
      const btn = form.querySelector('button[type=submit]');
      busy(btn, true, 'Un momento…');
      try { await onSubmit(Object.fromEntries(new FormData(form))); } catch (ex) { fail(ex); busy(btn, false); }
    });
  }

  async function showStatus() {
    showError(err, '');
    body.innerHTML = '<div class="empty">Cargando…</div>';
    try { status = await backend.twoFactorStatus(); } catch (e) { fail(e); body.innerHTML = ''; return; }
    if (banner) banner.hidden = status.enrolled || sessionStorage.getItem(BANNER_KEY) === '1';
    body.innerHTML = status.enrolled ? `
      <div class="mfa-state on">${icon('shield')}<div><strong>Activada</strong><p>Al ingresar se le pide el código de su app de autenticación.</p></div></div>
      <div class="modal-foot"><button class="btn btn-ghost danger-text" type="button" data-mfa="disable">Desactivar</button><span class="spacer"></span><button class="btn btn-primary" type="button" data-close>Listo</button></div>`
      : `
      <div class="mfa-state off">${icon('shield')}<div><strong>No activada</strong><p>Además de la contraseña, al ingresar se pedirá un código de 6 dígitos de una app en su teléfono (Google Authenticator, Microsoft Authenticator, Authy…). Aunque alguien conozca su contraseña, no podrá entrar.</p></div></div>
      <div class="modal-foot"><button class="btn btn-ghost" type="button" data-close>Ahora no</button><button class="btn btn-primary" type="button" data-mfa="enable">${icon('shield')} Activar</button></div>`;
  }

  // Firebase pide confirmar la contraseña (y el código, si ya tiene dos pasos).
  function confirmPassword(next) {
    step(`<p>Por seguridad, confirme su contraseña.</p>
      <div class="field"><label for="mfa-pass">Contraseña</label><input class="input" id="mfa-pass" name="password" type="password" autocomplete="current-password" required></div>`,
    async ({ password }) => {
      try {
        await backend.confirmPassword(password);
      } catch (e) {
        if (!(e instanceof TwoFactorRequiredError)) throw e;
        step(codeField('mfa-recode', 'Código de su app de autenticación'), async ({ code }) => { await backend.completeTwoFactor(code); await next(); }, 'Continuar');
        return;
      }
      await next();
    }, 'Continuar');
  }

  async function ensureEmail() {
    if (status.emailVerified || await backend.emailVerifiedNow()) return enroll();
    await backend.sendVerificationEmail();
    body.innerHTML = `
      <div class="mfa-state off">${icon('mail')}<div><strong>Confirme su correo</strong><p>Le enviamos un enlace a <strong>${escapeHtml(status.email)}</strong>. Ábralo y luego vuelva aquí. (Revise también la carpeta de spam.)</p></div></div>
      <div class="modal-foot"><button class="btn btn-ghost" type="button" data-mfa="resend">Reenviar correo</button><span class="spacer"></span><button class="btn btn-primary" type="button" data-mfa="verified">Ya lo confirmé</button></div>`;
  }

  async function enroll() {
    const { secretKey, uri } = await backend.startTwoFactor();
    const { default: qrcode } = await import('../../vendor/qrcode.mjs');
    const qr = qrcode(0, 'M');
    qr.addData(uri);
    qr.make();
    step(`
      <ol class="mfa-steps">
        <li>Instale en su teléfono una app de autenticación (Google Authenticator, Microsoft Authenticator o Authy).</li>
        <li>En la app, agregue una cuenta y escanee este código:
          <div class="mfa-qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>
          <small class="muted">¿No puede escanearlo? Escriba esta clave en la app: <span class="mono mfa-key">${escapeHtml(secretKey.replace(/(.{4})/g, '$1 ').trim())}</span> · <a href="${escapeHtml(uri)}">abrir en la app de este teléfono</a></small></li>
        <li>Escriba el código de 6 dígitos que muestra la app.</li>
      </ol>
      ${codeField('mfa-code')}`,
    async ({ code }) => {
      await backend.finishTwoFactor(code);
      toast('Verificación en dos pasos activada.');
      await showStatus();
    }, 'Activar');
  }

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mfa]');
    if (!b) return;
    showError(err, '');
    const action = b.dataset.mfa;
    try {
      if (action === 'enable') confirmPassword(ensureEmail);
      if (action === 'resend') { await backend.sendVerificationEmail(); toast('Correo reenviado.'); }
      if (action === 'verified') {
        if (await backend.emailVerifiedNow()) { busy(b, true, 'Preparando…'); await enroll(); } else fail(new Error('Aún no aparece confirmado. Abra el enlace del correo e intente de nuevo.'));
      }
      if (action === 'disable') {
        if (!confirm('¿Desactivar la verificación en dos pasos? Su cuenta quedará protegida solo por la contraseña.')) return;
        confirmPassword(async () => { await backend.disableTwoFactor(); toast('Verificación en dos pasos desactivada.'); await showStatus(); });
      }
    } catch (ex) { fail(ex); busy(b, false); }
  });

  const open = () => { m.open(); showStatus(); };
  document.querySelectorAll('[data-open="mfa"]').forEach((el) => el.addEventListener('click', open));

  // Aviso para activarla (se puede ocultar durante la sesión).
  if (banner) {
    banner.innerHTML = `${icon('shield')}<span><strong>Proteja su cuenta:</strong> active la verificación en dos pasos.</span>
      <button class="btn btn-primary btn-sm" type="button" data-banner="open">Activar</button><button class="icon-btn" type="button" data-banner="hide" aria-label="Ocultar aviso">${icon('x')}</button>`;
    banner.addEventListener('click', (e) => {
      const b = e.target.closest('[data-banner]');
      if (!b) return;
      if (b.dataset.banner === 'open') open();
      else { banner.hidden = true; try { sessionStorage.setItem(BANNER_KEY, '1'); } catch (ex) { /* sin almacenamiento */ } }
    });
    backend.twoFactorStatus().then((s) => { banner.hidden = s.enrolled || sessionStorage.getItem(BANNER_KEY) === '1'; }).catch(() => {});
  }
  return { open };
}
