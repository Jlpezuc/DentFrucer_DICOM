// Cobros: lo cobrado en cada atención (servicios con su precio, descuento, medio
// de pago y el documento entregado). Se registra desde esta sección, desde una
// cita de la agenda («Cobrar») o desde una visita del explorador. La página no
// emite boletas ni facturas: solo se anota el número del documento.
//
// Un cobro puede ir asociado a una visita (opcional): al elegirla se cargan sus
// exámenes como servicios y, al guardar, la visita queda pagada (studies.paid).
// Sin visita es un servicio suelto. Al eliminar un cobro o cambiarle la visita,
// la visita que deja de estar cubierta por algún cobro vuelve a «Por cobrar».
//
//   open(preset)  preset: { payment } para editar, o { patientId, date,
//                 appointment, visitKey } para un cobro nuevo con datos propuestos.

import { examLabel } from '../../services/agenda.js';
import { backend } from '../../services/backend.js';
import { groupStudies, PAY_STATE } from '../../services/groups.js';
import { DOC_TYPES, fmtCLP, itemsTotal, PAYMENT_METHODS } from '../../services/payments.js';
import { activeServices, serviceById, serviceForModality } from '../../services/settings.js';
import { busy, escapeHtml, modal, showError, toast } from '../../ui/dom.js';
import { fmtDate, today } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { formValues } from './common.js';

const DOC_FOR_METHOD = { 'Débito': 'Voucher (boleta)', 'Crédito': 'Voucher (boleta)', Efectivo: 'Boleta', Transferencia: 'Boleta', Convenio: 'Factura' };
const money = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')) || 0));

export function createPayments(ctx) {
  const { state } = ctx;
  const $ = (id) => document.getElementById(id);
  const body = $('payments-body');
  const fromInput = $('pay-from');
  const toInput = $('pay-to');
  const methodSel = $('pay-method');
  const search = $('pay-search');
  fromInput.value = today().slice(0, 8) + '01';
  toInput.value = today();
  methodSel.innerHTML += PAYMENT_METHODS.map((m) => `<option>${m}</option>`).join('');

  // --- Lista ------------------------------------------------------------------------------
  function filtered() {
    const q = search.value.trim().toLowerCase();
    return state.payments.filter((x) => (!fromInput.value || x.date >= fromInput.value) && (!toInput.value || x.date <= toInput.value) &&
      (!methodSel.value || x.method === methodSel.value) &&
      (!q || [x.patientName, x.docNumber, x.note, ...x.items.map((it) => it.label)].join(' ').toLowerCase().includes(q)));
  }

  // Fecha de la visita cobrada (la de sus exámenes; si ya no existen, la del cobro).
  const visitDate = (x) => (state.studies.find((s) => x.studyIds.includes(s.id)) || x).date;

  function render() {
    const rows = filtered();
    const total = rows.reduce((n, x) => n + x.total, 0);
    const byMethod = PAYMENT_METHODS.map((m) => [m, rows.filter((x) => x.method === m).reduce((n, x) => n + x.total, 0)]).filter(([, v]) => v > 0);
    $('pay-summary').innerHTML = `
      <div><span>Total del período</span><strong>${fmtCLP(total)}</strong></div>
      <div><span>Cobros</span><strong>${rows.length}</strong></div>
      ${byMethod.map(([m, v]) => `<div><span>${escapeHtml(m)}</span><strong>${fmtCLP(v)}</strong></div>`).join('')}`;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty">' + (state.payments.length ? 'No hay cobros con estos filtros.' : 'Aún no hay cobros. Regístrelos desde aquí, desde una cita («Cobrar») o desde una visita.') + '</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map((x) => `
      <tr>
        <td>${fmtDate(x.date)}</td>
        <td><strong>${escapeHtml(x.patientName || '—')}</strong><small class="muted cell-note">${(x.studyIds || []).length ? 'Visita del ' + fmtDate(visitDate(x)) : 'Servicio suelto'}${x.note ? ' · ' + escapeHtml(x.note) : ''}</small></td>
        <td class="pay-detail">${x.items.map((it) => `<span>${escapeHtml(it.label)} <small class="muted">${fmtCLP(it.price)}</small></span>`).join('')}${x.discount ? `<span class="muted">Descuento −${fmtCLP(x.discount)}</span>` : ''}</td>
        <td><span class="badge gray">${escapeHtml(x.method)}</span></td>
        <td>${escapeHtml(x.docType)}${x.docNumber ? ' <span class="mono">' + escapeHtml(x.docNumber) + '</span>' : ''}</td>
        <td class="num"><strong>${fmtCLP(x.total)}</strong></td>
        <td><div class="row-actions"><button class="icon-btn" type="button" data-edit-pay="${escapeHtml(x.id)}" title="Editar cobro" aria-label="Editar cobro">${icon('edit')}</button></div></td>
      </tr>`).join('');
  }
  [fromInput, toInput, methodSel].forEach((el) => el.addEventListener('change', render));
  search.addEventListener('input', render);
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit-pay]');
    if (b) open({ payment: state.payments.find((x) => x.id === b.dataset.editPay) });
  });

  // --- Formulario -------------------------------------------------------------------------
  const m = modal('payment-modal');
  const form = $('payment-form');
  const err = form.querySelector('.form-error');
  const items = $('py-items');
  const patientSel = $('py-patient');
  const methodField = $('py-method');
  const docField = $('py-doctype');
  const context = $('py-context');
  const visitSel = $('py-visit');
  let editing = null;
  let appointmentId = null;
  let visits = [];   // visitas del paciente elegido
  methodField.innerHTML = '<option value="">Elija…</option>' + PAYMENT_METHODS.map((x) => `<option>${x}</option>`).join('');
  docField.innerHTML = DOC_TYPES.map((x) => `<option>${x}</option>`).join('');

  // Cada línea: un servicio (con su precio propuesto, editable) u otro concepto escrito a mano.
  function itemRow(it = {}) {
    const services = activeServices();
    const known = it.serviceId && serviceById(it.serviceId);
    const options = services.map((sv) => `<option value="${escapeHtml(sv.id)}"${sv.id === it.serviceId ? ' selected' : ''}>${escapeHtml(sv.label)}</option>`).join('') +
      (known && !services.includes(known) ? `<option value="${escapeHtml(known.id)}" selected>${escapeHtml(known.label)}</option>` : '');
    const custom = !it.serviceId && (it.label || it.price);
    const row = document.createElement('div');
    row.className = 'pay-item';
    row.innerHTML = `
      <select class="input select" data-item-service aria-label="Servicio"><option value="">${services.length ? 'Elija un servicio…' : 'Sin servicios'}</option>${options}<option value="__other"${custom ? ' selected' : ''}>Otro concepto…</option></select>
      <input class="input" data-item-label placeholder="Concepto" maxlength="80" value="${escapeHtml(custom ? it.label || '' : '')}"${custom ? '' : ' hidden'}>
      <input class="input" data-item-price inputmode="numeric" aria-label="Precio" placeholder="$0" value="${it.price ? escapeHtml(String(it.price)) : ''}">
      <button type="button" class="icon-btn" data-item-remove aria-label="Quitar">${icon('x')}</button>`;
    items.appendChild(row);
  }
  const readItems = () => [...items.children].map((row) => {
    const sel = row.querySelector('[data-item-service]').value;
    const sv = sel && sel !== '__other' ? serviceById(sel) : null;
    return { serviceId: sv ? sv.id : '', label: sv ? sv.label : row.querySelector('[data-item-label]').value, price: money(row.querySelector('[data-item-price]').value) };
  }).filter((it) => it.label || it.price);
  function updateTotal() {
    const total = Math.max(0, itemsTotal(readItems()) - money($('py-discount').value));
    $('py-total').textContent = fmtCLP(total);
  }

  items.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-item-service]');
    if (!sel) return;
    const row = sel.closest('.pay-item');
    const label = row.querySelector('[data-item-label]');
    label.hidden = sel.value !== '__other';
    if (sel.value === '__other') label.focus();
    const sv = serviceById(sel.value);
    if (sv) row.querySelector('[data-item-price]').value = sv.price || '';
    updateTotal();
  });
  items.addEventListener('input', updateTotal);
  items.addEventListener('click', (e) => {
    if (!e.target.closest('[data-item-remove]')) return;
    e.target.closest('.pay-item').remove();
    if (!items.children.length) itemRow();
    updateTotal();
  });
  $('py-add-item').addEventListener('click', () => { itemRow(); updateTotal(); });
  $('py-discount').addEventListener('input', updateTotal);
  // El documento se propone según el medio de pago (se puede cambiar).
  methodField.addEventListener('change', () => { if (!editing && DOC_FOR_METHOD[methodField.value]) docField.value = DOC_FOR_METHOD[methodField.value]; });

  // --- Visita asociada (opcional) ------------------------------------------------------------
  function renderVisits(selectedKey = '') {
    visits = groupStudies(state.studies).filter((g) => g.patientId === patientSel.value);
    visitSel.innerHTML = '<option value="">Sin visita: servicio suelto</option>' + visits.map((g) =>
      `<option value="${escapeHtml(g.key)}">${fmtDate(g.date)} · ${escapeHtml(g.modalities.join(', '))} · ${PAY_STATE[g.payState]}</option>`).join('');
    visitSel.value = visits.some((g) => g.key === selectedKey) ? selectedKey : '';
    visitSel.disabled = !visits.length;
  }
  const currentVisit = () => visits.find((g) => g.key === visitSel.value) || null;
  // Servicios propuestos para los exámenes de una visita (con el precio de cada servicio).
  const visitItems = (g) => g.studies.filter((s) => s.modality !== 'Informe').map((s) => {
    const sv = serviceForModality(s.modality);
    return sv ? { serviceId: sv.id, price: sv.price } : { label: s.description || s.modality, price: 0 };
  });
  function fillFromVisit(g) {
    $('py-date').value = g.date;
    items.innerHTML = '';
    const list = visitItems(g);
    (list.length ? list : [{}]).forEach(itemRow);
    updateTotal();
  }
  patientSel.addEventListener('change', () => renderVisits(''));
  visitSel.addEventListener('change', () => { const g = currentVisit(); if (g) fillFromVisit(g); });

  // Marca como pagadas las visitas cobradas y devuelve a «Por cobrar» las que
  // ya no cubre ningún cobro.
  async function syncPaid(newIds, oldIds, exceptPaymentId) {
    const covered = new Set(state.payments.filter((x) => x.id !== exceptPaymentId).flatMap((x) => x.studyIds || []));
    newIds.forEach((id) => covered.add(id));
    const release = oldIds.filter((id) => !covered.has(id));
    if (newIds.length) await backend.setStudiesPaid(newIds, true);
    if (release.length) await backend.setStudiesPaid(release, false);
  }

  function open(preset = {}) {
    const p = preset.payment || null;
    editing = p;
    appointmentId = p ? p.appointmentId : preset.appointment ? preset.appointment.id : null;
    form.reset();
    showError(err, '');
    $('payment-modal-title').textContent = p ? 'Editar cobro' : 'Registrar cobro';
    $('py-delete').hidden = !p;
    patientSel.innerHTML = '<option value="">Elija el paciente…</option>' + state.patients.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}${x.code ? ' · ' + escapeHtml(x.code) : ''}</option>`).join('');
    patientSel.value = p ? p.patientId : preset.patientId || '';
    $('py-date').value = p ? p.date : preset.date || today();
    $('py-discount').value = p && p.discount ? p.discount : '';
    methodField.value = p ? p.method : '';
    docField.value = p ? p.docType : 'Boleta';
    $('py-docnumber').value = p ? p.docNumber || '' : '';
    $('py-note').value = p ? p.note || '' : '';

    // Visita: la del cobro, la pedida o, desde una cita, la del mismo paciente y día.
    const groups = groupStudies(state.studies);
    let key = preset.visitKey || '';
    if (p && (p.studyIds || []).length) key = (groups.find((g) => g.studies.some((s) => p.studyIds.includes(s.id))) || {}).key || '';
    else if (!p && preset.appointment) key = (groups.find((g) => g.patientId === preset.appointment.patientId && g.date === preset.appointment.date) || {}).key || '';
    renderVisits(key);

    // Servicios propuestos: los del cobro, los exámenes de la visita o el servicio de la cita.
    items.innerHTML = '';
    let proposed = p ? p.items : [];
    if (!p && currentVisit()) proposed = visitItems(currentVisit());
    else if (!p && preset.appointment) {
      const sv = serviceById(preset.appointment.exam);
      proposed = [sv ? { serviceId: sv.id, price: sv.price } : { label: examLabel(preset.appointment.exam), price: 0 }];
    }
    (proposed.length ? proposed : [{}]).forEach(itemRow);
    updateTotal();

    const ctxText = preset.appointment
      ? 'Cita del ' + fmtDate(preset.appointment.date) + ' a las ' + preset.appointment.time + ' · ' + examLabel(preset.appointment.exam)
      : '';
    context.hidden = !ctxText;
    context.innerHTML = ctxText ? icon('calendar') + '<span>' + escapeHtml(ctxText) + '</span>' : '';
    m.open();
  }
  document.querySelectorAll('[data-open="payment"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const v = formValues(form);
    const patient = ctx.patientById(v.patientId);
    showError(err, '');
    busy(btn, true, 'Guardando…');
    const visit = currentVisit();
    const studyIds = visit ? visit.studies.map((s) => s.id) : [];
    try {
      const id = await backend.savePayment(editing ? editing.id : null, {
        ...v, patientName: patient ? patient.name : '', appointmentId, studyIds, items: readItems(), discount: money(v.discount)
      });
      await syncPaid(studyIds, editing ? editing.studyIds || [] : [], id);
      toast((editing ? 'Cobro actualizado.' : 'Cobro registrado: ' + $('py-total').textContent + '.') + (visit ? ' La visita del ' + fmtDate(visit.date) + ' quedó pagada.' : ''));
      m.close();
      await ctx.reload();
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  $('py-delete').addEventListener('click', async () => {
    if (!editing || !confirm('¿Eliminar este cobro de ' + fmtCLP(editing.total) + ' (' + editing.patientName + ')?')) return;
    try {
      await backend.deletePayment(editing.id);
      await syncPaid([], editing.studyIds || [], editing.id);
      toast('Cobro eliminado.');
      m.close();
      await ctx.reload();
    } catch (ex) { showError(err, ex.message); }
  });

  return { render, open };
}
