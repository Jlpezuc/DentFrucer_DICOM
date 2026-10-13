// Mi cuenta: el panel muestra el correo de la cuenta en sesión (puede haber
// varios administradores) y permite cambiar su nombre visible.

import { backend } from '../../services/backend.js';
import { busy, modal, showError, toast } from '../../ui/dom.js';
import { showUser } from '../session.js';

export function createAccount(user) {
  const m = modal('account-modal');
  const form = document.getElementById('account-form');
  const err = form.querySelector('.form-error');
  let me = user;

  document.querySelectorAll('[data-open="account"]').forEach((b) => b.addEventListener('click', () => {
    form.elements.namedItem('name').value = me.name;
    document.getElementById('ac-email').value = me.email;
    showError(err, '');
    m.open();
    form.elements.namedItem('name').select();
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    showError(err, '');
    busy(btn, true, 'Guardando…');
    try {
      me = await backend.updateMyName(form.elements.namedItem('name').value);
      showUser(me);
      m.close();
      toast('Nombre de la cuenta actualizado.');
    } catch (ex) {
      showError(err, ex.message);
    }
    busy(btn, false);
  });
}
