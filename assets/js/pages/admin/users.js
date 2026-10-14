// Usuarios: cuentas de administración (solo el administrador general). Cada
// cuenta tiene nombre, una descripción libre (secretaria, tecnólogo…), y es
// administrador general o tiene una lista de permisos (services/permissions.js).
// Una cuenta no se borra: se desactiva (no puede entrar) y se puede reactivar.
// Nadie puede quitarse a sí mismo los permisos ni desactivarse.

import { backend } from '../../services/backend.js';
import { isSuperAdmin, PERMISSIONS } from '../../services/permissions.js';
import { busy, escapeHtml, modal, showError, toast } from '../../ui/dom.js';
import { initials } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';

export function createUsers(ctx) {
  const { state, user } = ctx;
  const $ = (id) => document.getElementById(id);
  const body = $('admins-body');

  function render() {
    if (!state.admins.length) { body.innerHTML = '<tr><td colspan="5"><div class="empty">Cargando cuentas…</div></td></tr>'; return; }
    body.innerHTML = state.admins.map((a) => {
      const me = a.id === user.uid;
      const general = isSuperAdmin(a);
      return `<tr class="${a.disabled ? 'row-muted' : ''}">
        <td><div class="cell-patient"><span class="avatar">${initials(a.name)}</span><div><strong>${escapeHtml(a.name || a.email)}${me ? ' <span class="badge gray">Usted</span>' : ''}</strong><small>${escapeHtml(a.email || '')}</small></div></div></td>
        <td>${a.description ? escapeHtml(a.description) : '<span class="muted">—</span>'}</td>
        <td>${general ? '<span class="badge blue">' + icon('shield') + ' Administrador general</span>'
          : `<div class="perm-chips">${PERMISSIONS.filter((p) => a.permissions && a.permissions[p.id]).map((p) => `<span class="badge gray">${escapeHtml(p.label)}</span>`).join('') || '<span class="warn-text">Sin permisos</span>'}</div>`}</td>
        <td>${a.disabled ? '<span class="badge amber">Desactivada</span>' : '<span class="badge green">Activa</span>'}</td>
        <td><div class="row-actions"><button class="btn btn-outline btn-sm" type="button" data-edit-admin="${escapeHtml(a.id)}">${icon('edit')} Editar</button></div></td>
      </tr>`;
    }).join('');
  }
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit-admin]');
    if (b) open(state.admins.find((a) => a.id === b.dataset.editAdmin));
  });

  // --- Formulario -----------------------------------------------------------------------
  const m = modal('admin-modal');
  const form = $('admin-form');
  const err = form.querySelector('.form-error');
  const superBox = $('ad-super');
  const perms = $('ad-perms');
  const toggle = $('ad-toggle');
  let editing = null;
  perms.insertAdjacentHTML('beforeend', PERMISSIONS.map((p) => `
    <label class="check"><input type="checkbox" name="perm-${p.id}" data-perm-id="${p.id}"> <span><strong>${escapeHtml(p.label)}</strong><small>${escapeHtml(p.hint)}</small></span></label>`).join(''));

  const syncSuper = () => {
    perms.disabled = superBox.checked;
    perms.classList.toggle('all', superBox.checked);
  };
  superBox.addEventListener('change', syncSuper);

  function open(a) {
    editing = a || null;
    form.reset();
    showError(err, '');
    const me = a && a.id === user.uid;
    $('admin-modal-title').textContent = a ? 'Editar cuenta' : 'Nuevo administrador';
    form.querySelector('[data-new-only]').hidden = !!a;
    $('ad-name').value = a ? a.name || '' : '';
    $('ad-description').value = a ? a.description || '' : '';
    superBox.checked = a ? isSuperAdmin(a) : false;
    perms.querySelectorAll('[data-perm-id]').forEach((c) => { c.checked = !!(a && a.permissions && a.permissions[c.dataset.permId]); });
    // Su propia cuenta: puede cambiar nombre y descripción, no sus permisos.
    superBox.disabled = !!me;
    syncSuper();
    if (me) perms.disabled = true;
    toggle.hidden = !a || me;
    if (a) toggle.innerHTML = a.disabled ? icon('check') + ' Reactivar cuenta' : icon('lock') + ' Desactivar cuenta';
    m.open();
  }
  document.querySelector('[data-new-admin]').addEventListener('click', () => open(null));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const me = editing && editing.id === user.uid;
    const permissions = Object.fromEntries([...perms.querySelectorAll('[data-perm-id]')].map((c) => [c.dataset.permId, c.checked]));
    // La propia cuenta solo cambia nombre y descripción (sin permissions).
    const data = me
      ? { name: $('ad-name').value, description: $('ad-description').value }
      : { name: $('ad-name').value, description: $('ad-description').value, superadmin: superBox.checked, permissions };
    showError(err, '');
    if (!editing) {
      if (!$('ad-email').value.trim() || $('ad-pass').value.length < 6) { showError(err, 'Escriba el correo y una contraseña de al menos 6 caracteres.'); return; }
      if (!data.superadmin && !Object.values(permissions).some(Boolean)) { showError(err, 'Elija al menos un permiso o márquela como administrador general.'); return; }
    }
    busy(btn, true, 'Guardando…');
    try {
      if (editing) await backend.updateAdmin(editing.id, data);
      else await backend.createAdmin({ ...data, email: $('ad-email').value, password: $('ad-pass').value });
      toast(editing ? 'Cuenta actualizada. Los cambios de permisos se aplican cuando esa persona recarga el panel.' : 'Cuenta creada para ' + data.name + '. Comparta sus credenciales de forma segura.');
      m.close();
      await ctx.reload();
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  toggle.addEventListener('click', async () => {
    if (!editing) return;
    const off = !editing.disabled;
    if (off && !confirm('¿Desactivar la cuenta de ' + editing.name + '? No podrá entrar al panel hasta que se reactive.')) return;
    try {
      await backend.setAdminDisabled(editing.id, off);
      toast(off ? 'Cuenta desactivada.' : 'Cuenta reactivada.');
      m.close();
      await ctx.reload();
    } catch (ex) { showError(err, ex.message); }
  });

  return { render: () => { if (ctx.can('*')) render(); } };
}
