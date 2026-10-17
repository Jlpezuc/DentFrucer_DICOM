// Cobros: lo cobrado en cada atención (servicios con su precio, descuento, medio
// de pago y el documento entregado). Se registra desde esta sección, desde una
// cita de la agenda («Cobrar») o desde una visita del explorador. La página no
// emite boletas ni facturas: solo se anota el número del documento.
//
// Un cobro puede ir asociado a una visita (opcional): al elegirla se cargan sus
// exámenes como servicios y, al pagarse, la visita queda pagada (studies.paid).
// Sin visita es un servicio suelto. Al eliminar un cobro o cambiarle la visita,
// la visita que deja de estar cubierta por algún cobro vuelve a «Por cobrar».
//
// Forma de pago:
//   Efectivo        queda pagado al registrarlo.
//   Maquinita       el cobro se envía a la maquinita de Mercado Pago (Point) y la
//                   página espera, en vivo, a que el paciente pague: el servidor
//                   (functions/) lo marca pagado, con débito o crédito, y la
//                   visita queda pagada. Si se cierra la ventana, la página sigue
//                   atenta y avisa cuando se aprueba. Mientras no se apruebe, no
//                   suma en ningún total.
//   Otro medio      transferencia, convenio, tarjeta en otra máquina…
//
//   open(preset)  preset: { payment } para editar o ver, o { patientId, date,
//                 appointment, visitKey } para un cobro nuevo con datos propuestos.

import { examLabel } from '../../services/agenda.js';
import { backend, isDemo } from '../../services/backend.js';
import { groupStudies, isReportOnly, PAY_STATE } from '../../services/groups.js';
import { DOC_TYPES, fmtCLP, isPaid, isPoint, itemsTotal, ORDER_STEP, PAYMENT_METHODS, POINT_STATUS } from '../../services/payments.js';
import { activeServices, serviceById, studyServiceId, studyServiceName } from '../../services/settings.js';
import { busy, escapeHtml, modal, showError, toast } from '../../ui/dom.js';
import { fmtDate, today } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { formValues } from './common.js';

const DOC_FOR_METHOD = { 'Débito': 'Voucher (boleta)', 'Crédito': 'Voucher (boleta)', Efectivo: 'Boleta', Transferencia: 'Boleta', Convenio: 'Factura' };
const OTHER_METHODS = PAYMENT_METHODS.filter((x) => x !== 'Efectivo');
const POLL_MS = 8000; // consulta a Mercado Pago mientras se espera, por si el aviso (webhook) no llega
const money = (v) => Math.max(0, Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')) || 0));
const terminalLabel = (id) => (id ? 'Maquinita ' + String(id).split('__').pop() : 'Maquinita');
const STATUS_BADGE = { pending: 'amber', canceled: 'gray', expired: 'gray', failed: 'red', refunded: 'red' };

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
  let terminalId = '';   // maquinita elegida ('' = sin configurar)
  const loadTerminal = async () => { terminalId = ((await backend.pointSettings()) || {}).terminalId || ''; };
  if (ctx.can('cobros')) loadTerminal();

  // --- Lista ------------------------------------------------------------------------------
  function filtered() {
    const q = search.value.trim().toLowerCase();
    return state.payments.filter((x) => (!fromInput.value || x.date >= fromInput.value) && (!toInput.value || x.date <= toInput.value) &&
      (!methodSel.value || x.method === methodSel.value) &&
      (!q || [x.patientName, x.docNumber, x.note, ...x.items.map((it) => it.label)].join(' ').toLowerCase().includes(q)));
  }

  // Fecha de la visita cobrada (la de sus exámenes; si ya no existen, la del cobro).
  const visitDate = (x) => (state.studies.find((s) => x.studyIds.includes(s.id)) || x).date;

  function methodCell(x) {
    if (!isPoint(x)) return `<span class="badge gray">${escapeHtml(x.method)}</span>`;
    const label = x.status === 'paid' ? escapeHtml(x.method) : POINT_STATUS[x.status] || escapeHtml(x.status);
    return `<span class="badge ${x.status === 'paid' ? 'gray' : STATUS_BADGE[x.status] || 'gray'}">${label}</span><small class="muted cell-note">${icon('pos')} Maquinita</small>`;
  }

  function render() {
    const rows = filtered();
    const paidRows = rows.filter(isPaid);
    const total = paidRows.reduce((n, x) => n + x.total, 0);
    const waiting = rows.filter((x) => x.status === 'pending').length;
    const byMethod = PAYMENT_METHODS.map((m) => [m, paidRows.filter((x) => x.method === m).reduce((n, x) => n + x.total, 0)]).filter(([, v]) => v > 0);
    $('pay-summary').innerHTML = `
      <div><span>Total del período</span><strong>${fmtCLP(total)}</strong></div>
      <div><span>Cobros</span><strong>${paidRows.length}</strong></div>
      ${byMethod.map(([m, v]) => `<div><span>${escapeHtml(m)}</span><strong>${fmtCLP(v)}</strong></div>`).join('')}
      ${waiting ? `<div><span>Esperando la maquinita</span><strong class="warn-text">${waiting}</strong></div>` : ''}`;
    // La página sigue atenta a los cobros que esperan la maquinita.
    if (ctx.can('cobros')) state.payments.filter((x) => isPoint(x) && x.status === 'pending').forEach((x) => watch(x.id));
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty">' + (state.payments.length ? 'No hay cobros con estos filtros.' : 'Aún no hay cobros. Regístrelos desde aquí, desde una cita («Cobrar») o desde una visita.') + '</div></td></tr>';
      return;
    }
    body.innerHTML = rows.map((x) => `
      <tr class="${isPaid(x) ? '' : 'row-muted'}">
        <td>${fmtDate(x.date)}</td>
        <td><strong>${escapeHtml(x.patientName || '—')}</strong><small class="muted cell-note">${(x.studyIds || []).length ? 'Visita del ' + fmtDate(visitDate(x)) : 'Servicio suelto'}${x.note ? ' · ' + escapeHtml(x.note) : ''}</small></td>
        <td class="pay-detail">${x.items.map((it) => `<span>${escapeHtml(it.label)} <small class="muted">${fmtCLP(it.price)}</small></span>`).join('')}${x.discount ? `<span class="muted">Descuento −${fmtCLP(x.discount)}</span>` : ''}</td>
        <td>${methodCell(x)}</td>
        <td>${escapeHtml(x.docType)}${x.docNumber ? ' <span class="mono">' + escapeHtml(x.docNumber) + '</span>' : ''}</td>
        <td class="num">${isPaid(x) ? `<strong>${fmtCLP(x.total)}</strong>` : `<span class="muted" title="No suma: no está pagado">${fmtCLP(x.total)}</span>`}</td>
        <td><div class="row-actions">${isPoint(x) && !isPaid(x) && x.status !== 'refunded'
          ? `<button class="icon-btn" type="button" data-edit-pay="${escapeHtml(x.id)}" title="Ver cobro en la maquinita" aria-label="Ver cobro en la maquinita">${icon('pos')}</button>`
          : `<button class="icon-btn" type="button" data-edit-pay="${escapeHtml(x.id)}" title="Editar cobro" aria-label="Editar cobro">${icon('edit')}</button>`}</div></td>
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
  const submitBtn = $('py-submit');
  const pointHint = $('py-point-hint');
  const waitEl = $('py-wait');
  let editing = null;     // cobro que se edita
  let replacing = null;   // cobro con la maquinita que no se completó y se cobra de otra forma
  let appointmentId = null;
  let visits = [];   // visitas del paciente elegido
  methodField.innerHTML = '<option value="">Elija…</option>' + OTHER_METHODS.map((x) => `<option>${x}</option>`).join('');
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
  const currentTotal = () => Math.max(0, itemsTotal(readItems()) - money($('py-discount').value));
  function updateTotal() {
    $('py-total').textContent = fmtCLP(currentTotal());
    updateSubmit();
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

  // --- Forma de pago -----------------------------------------------------------------------
  const modeOf = () => (form.querySelector('input[name=mode]:checked') || {}).value || '';
  function setMode(mode) {
    form.querySelectorAll('input[name=mode]').forEach((r) => { r.checked = r.value === mode; });
    $('py-method-field').hidden = mode !== 'other';
    $('py-docnumber-field').hidden = mode === 'point';
    if (!editing) docField.value = mode === 'point' ? 'Voucher (boleta)' : mode === 'cash' ? 'Boleta' : DOC_FOR_METHOD[methodField.value] || docField.value;
    updateSubmit();
  }
  function updateSubmit() {
    const mode = modeOf();
    const noTerminal = mode === 'point' && !terminalId;
    pointHint.hidden = !noTerminal;
    pointHint.textContent = noTerminal ? 'Aún no hay maquinita elegida: configúrela en Cobros → Maquinita.' : '';
    submitBtn.disabled = noTerminal;
    submitBtn.innerHTML = editing ? 'Guardar cambios'
      : mode === 'cash' ? icon('cash') + ' Registrar pago en efectivo'
        : mode === 'point' ? icon('pos') + ' Cobrar ' + fmtCLP(currentTotal()) + ' en la maquinita'
          : 'Guardar cobro';
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'mode') setMode(e.target.value); });

  // --- Visita asociada (opcional) ------------------------------------------------------------
  function renderVisits(selectedKey = '') {
    visits = groupStudies(state.studies).filter((g) => g.patientId === patientSel.value);
    visitSel.innerHTML = '<option value="">Sin visita: servicio suelto</option>' + visits.map((g) =>
      `<option value="${escapeHtml(g.key)}">${fmtDate(g.date)} · ${escapeHtml(g.services.join(', '))} · ${PAY_STATE[g.payState]}</option>`).join('');
    visitSel.value = visits.some((g) => g.key === selectedKey) ? selectedKey : '';
    visitSel.disabled = !visits.length;
  }
  const currentVisit = () => visits.find((g) => g.key === visitSel.value) || null;
  // Servicios propuestos para los exámenes de una visita (con el precio de cada servicio).
  const visitItems = (g) => g.studies.filter((s) => !isReportOnly(s)).map((s) => {
    const sv = serviceById(studyServiceId(s));
    return sv ? { serviceId: sv.id, price: sv.price } : { label: studyServiceName(s), price: 0 };
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
  // ya no cubre ningún cobro pagado. (Los cobros con la maquinita los marca el servidor.)
  async function syncPaid(newIds, oldIds, exceptPaymentId) {
    const covered = new Set(state.payments.filter((x) => x.id !== exceptPaymentId && isPaid(x)).flatMap((x) => x.studyIds || []));
    newIds.forEach((id) => covered.add(id));
    const release = oldIds.filter((id) => !covered.has(id));
    if (newIds.length) await backend.setStudiesPaid(newIds, true);
    if (release.length) await backend.setStudiesPaid(release, false);
  }

  // Un cobro con la maquinita ya pagado: lo cobrado y la visita no cambian.
  function lockForPoint(p) {
    const locked = !!p && isPoint(p);
    $('py-mode-field').hidden = locked;
    $('py-method-field').hidden = locked || modeOf() !== 'other';
    $('py-docnumber-field').hidden = false;
    [patientSel, visitSel, $('py-discount'), $('py-add-item')].forEach((el) => { el.disabled = locked || (el === visitSel && !visits.length); });
    items.querySelectorAll('input, select, button').forEach((el) => { el.disabled = locked; });
    const box = $('py-locked');
    box.hidden = !locked;
    box.innerHTML = locked ? `${icon('pos')}<span><strong>${p.status === 'refunded' ? 'Pago devuelto' : 'Cobrado con la maquinita'}</strong> · ${escapeHtml(p.method || '')}${p.mp && p.mp.paymentMethod ? ' (' + escapeHtml(p.mp.paymentMethod) + ')' : ''}. Lo cobrado y la visita no se pueden cambiar; sí el documento y la nota.</span>` : '';
  }

  function open(preset = {}) {
    const p = preset.payment || null;
    // Cobro con la maquinita sin terminar: se muestra su estado en vivo.
    if (p && isPoint(p) && !isPaid(p) && p.status !== 'refunded') { showWait(p.id, p); return; }
    const from = preset.copyFrom || null; // cobro con la maquinita que no se completó
    editing = p;
    replacing = from;
    appointmentId = p ? p.appointmentId : from ? from.appointmentId : preset.appointment ? preset.appointment.id : null;
    form.reset();
    form.hidden = false;
    waitEl.hidden = true;
    showError(err, '');
    $('payment-modal-title').textContent = p ? 'Editar cobro' : 'Registrar cobro';
    $('py-delete').hidden = !p;
    patientSel.innerHTML = '<option value="">Elija el paciente…</option>' + state.patients.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}${x.code ? ' · ' + escapeHtml(x.code) : ''}</option>`).join('');
    const base = p || from;
    patientSel.value = base ? base.patientId : preset.patientId || '';
    $('py-date').value = base ? base.date : preset.date || today();
    $('py-discount').value = base && base.discount ? base.discount : '';
    methodField.value = p && OTHER_METHODS.includes(p.method) ? p.method : '';
    docField.value = p ? p.docType : 'Boleta';
    $('py-docnumber').value = p ? p.docNumber || '' : '';
    $('py-note').value = base ? base.note || '' : '';

    // Visita: la del cobro, la pedida o, desde una cita, la del mismo paciente y día.
    const groups = groupStudies(state.studies);
    let key = preset.visitKey || '';
    if (base && (base.studyIds || []).length) key = (groups.find((g) => g.studies.some((s) => base.studyIds.includes(s.id))) || {}).key || '';
    else if (!base && preset.appointment) key = (groups.find((g) => g.patientId === preset.appointment.patientId && g.date === preset.appointment.date) || {}).key || '';
    renderVisits(key);

    // Servicios propuestos: los del cobro, los exámenes de la visita o el servicio de la cita.
    items.innerHTML = '';
    let proposed = base ? base.items : [];
    if (!base && currentVisit()) proposed = visitItems(currentVisit());
    else if (!base && preset.appointment) {
      const sv = serviceById(preset.appointment.exam);
      proposed = [sv ? { serviceId: sv.id, price: sv.price } : { label: examLabel(preset.appointment.exam), price: 0 }];
    }
    (proposed.length ? proposed : [{}]).forEach(itemRow);

    const ctxText = preset.appointment
      ? 'Cita del ' + fmtDate(preset.appointment.date) + ' a las ' + preset.appointment.time + ' · ' + examLabel(preset.appointment.exam)
      : from ? 'El cobro con la maquinita no se completó: regístrelo con otra forma de pago.' : '';
    context.hidden = !ctxText;
    context.innerHTML = ctxText ? icon(from ? 'pos' : 'calendar') + '<span>' + escapeHtml(ctxText) + '</span>' : '';

    setMode(p ? (p.method === 'Efectivo' ? 'cash' : 'other') : from ? 'cash' : '');
    if (p) docField.value = p.docType;
    lockForPoint(p);
    updateTotal();
    m.open();
  }
  document.querySelectorAll('[data-open="payment"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formValues(form);
    const mode = modeOf();
    const patient = ctx.patientById(v.patientId);
    showError(err, '');
    if (!editing && !mode) { showError(err, 'Elija la forma de pago: efectivo, maquinita u otro medio.'); return; }
    const visit = currentVisit();
    const studyIds = visit ? visit.studies.map((s) => s.id) : [];
    const input = { ...v, patientName: patient ? patient.name : '', appointmentId, studyIds, items: readItems(), discount: money(v.discount) };
    busy(submitBtn, true, mode === 'point' && !editing ? 'Enviando a la maquinita…' : 'Guardando…');
    try {
      if (!editing && mode === 'point') {
        const id = await backend.startPointPayment(input);
        if (replacing) await backend.deletePayment(replacing.id).catch(() => {});
        busy(submitBtn, false);
        showWait(id);
        ctx.reload();
        return;
      }
      if (editing && isPoint(editing)) {
        // Solo cambian el documento, la nota y la fecha.
        const keep = ['patientId', 'patientName', 'appointmentId', 'studyIds', 'items', 'discount', 'method'];
        await backend.savePayment(editing.id, { ...input, ...Object.fromEntries(keep.map((k) => [k, editing[k]])) });
      } else {
        const method = mode === 'cash' || (editing && !mode && editing.method === 'Efectivo') ? 'Efectivo' : v.method;
        const id = await backend.savePayment(editing ? editing.id : null, { ...input, method });
        if (replacing) await backend.deletePayment(replacing.id);
        await syncPaid(studyIds, editing ? editing.studyIds || [] : [], id);
      }
      toast((editing ? 'Cobro actualizado.' : (mode === 'cash' ? 'Pago en efectivo registrado: ' : 'Cobro registrado: ') + $('py-total').textContent + '.') +
        (!editing && visit ? ' La visita del ' + fmtDate(visit.date) + ' quedó pagada.' : ''));
      m.close();
      await ctx.reload();
    } catch (ex) { showError(err, ex.message); }
    busy(submitBtn, false);
    updateSubmit();
  });

  $('py-delete').addEventListener('click', async () => {
    if (!editing) return;
    const refundNote = isPoint(editing) && editing.status === 'paid' ? '\n\nEsto no devuelve el dinero: la devolución se hace en la app de Mercado Pago.' : '';
    if (!confirm('¿Eliminar este cobro de ' + fmtCLP(editing.total) + ' (' + editing.patientName + ')?' + refundNote)) return;
    try {
      await backend.deletePayment(editing.id);
      await syncPaid([], editing.studyIds || [], editing.id);
      toast('Cobro eliminado.');
      m.close();
      await ctx.reload();
    } catch (ex) { showError(err, ex.message); }
  });

  // --- Cobro con la maquinita: espera en vivo ----------------------------------------------
  // Cada cobro pendiente se escucha en Firestore (el servidor lo actualiza con el
  // aviso de Mercado Pago) y, por si el aviso no llega, se consulta cada POLL_MS.
  const watches = new Map();   // id → { stop, timer, last }
  let waitId = null;           // cobro que muestra la ventana
  const waitVisible = (id) => waitId === id && !waitEl.hidden && m.el.classList.contains('open');

  function watch(id) {
    if (watches.has(id)) return;
    const w = { last: null };
    watches.set(id, w);
    w.stop = backend.watchPayment(id, (p) => onPayment(id, p));
    w.timer = setInterval(() => backend.refreshPointPayment(id).catch(() => {}), POLL_MS);
  }
  function unwatch(id) {
    const w = watches.get(id);
    if (!w) return;
    clearInterval(w.timer);
    w.stop();
    watches.delete(id);
  }
  function onPayment(id, p) {
    const w = watches.get(id);
    const before = w && w.last;
    if (w) w.last = p;
    if (waitVisible(id)) renderWait(p);
    if (p && p.status === 'pending') return;
    unwatch(id);
    // Terminó mientras se esperaba: aviso (si la ventana no está a la vista) y datos al día.
    if (before && before.status === 'pending' && p) {
      if (!waitVisible(id)) {
        toast(p.status === 'paid' ? 'Pago aprobado en la maquinita: ' + fmtCLP(p.total) + ' · ' + p.patientName + '.'
          : 'El cobro de ' + fmtCLP(p.total) + ' (' + p.patientName + ') no se completó: ' + (POINT_STATUS[p.status] || p.status).toLowerCase() + '.');
      }
      ctx.reload();
    }
  }

  function showWait(id, p = null) {
    editing = null;
    replacing = null;
    waitId = id;
    form.hidden = true;
    waitEl.hidden = false;
    $('payment-modal-title').textContent = 'Cobro con la maquinita';
    renderWait(p || (watches.get(id) || {}).last || state.payments.find((x) => x.id === id) || { id, status: 'pending', total: currentTotal() });
    watch(id);
    if (!m.el.classList.contains('open')) m.open();
  }

  function renderWait(p) {
    if (!p) { waitEl.innerHTML = '<div class="empty">El cobro ya no existe.</div><div class="pos-actions"><button class="btn btn-primary" type="button" data-pos="close">Cerrar</button></div>'; return; }
    const amount = `<p class="pos-amount">${fmtCLP(p.total)}</p>`;
    const meta = `<p class="muted pos-meta">${escapeHtml(p.patientName || '')}${p.mp && p.mp.terminalId ? ' · ' + escapeHtml(terminalLabel(p.mp.terminalId)) : ''}</p>`;
    const errorBox = '<div class="form-error" role="alert"></div>';
    if (p.status === 'pending') {
      waitEl.innerHTML = `
        <div class="pos-state waiting">${icon('pos')}</div>
        <h4>Esperando el pago en la maquinita</h4>${amount}
        <p class="pos-step">${escapeHtml(ORDER_STEP[p.mp && p.mp.status] || 'Enviando el cobro a la maquinita…')}</p>${meta}${errorBox}
        <div class="pos-actions">
          <button class="btn btn-ghost" type="button" data-pos="cancel">Cancelar cobro</button>
          <button class="btn btn-outline" type="button" data-pos="close">Seguir en segundo plano</button>
        </div>
        <p class="muted pos-note">La página queda atenta: al aprobarse el pago, el cobro y la visita quedan pagados aunque cierre esta ventana.</p>
        ${isDemo && backend.demoPointResult ? '<p class="pos-demo">Demostración: <button type="button" class="link-btn" data-pos="demo-paid">simular pago aprobado</button> · <button type="button" class="link-btn" data-pos="demo-failed">simular rechazo</button></p>' : ''}`;
    } else if (p.status === 'paid') {
      const visit = (p.studyIds || []).length ? '<p>La visita quedó pagada.</p>' : '';
      waitEl.innerHTML = `
        <div class="pos-state ok">${icon('check')}</div>
        <h4>Pago aprobado</h4>${amount}
        <p class="pos-step">${escapeHtml(p.method || 'Tarjeta')}${p.mp && p.mp.paymentMethod ? ' · ' + escapeHtml(p.mp.paymentMethod) : ''}</p>${visit}${meta}
        <div class="pos-actions"><button class="btn btn-primary" type="button" data-pos="close">Listo</button></div>`;
    } else {
      const reason = (p.mp && p.mp.error) || { canceled: 'Se canceló el cobro.', expired: 'La maquinita no recibió el pago a tiempo.', failed: 'El pago fue rechazado.', refunded: 'El pago fue devuelto.' }[p.status] || '';
      waitEl.innerHTML = `
        <div class="pos-state bad">${icon('x')}</div>
        <h4>${p.status === 'refunded' ? 'Pago devuelto' : 'El cobro no se completó'}</h4>${amount}
        <p class="pos-step">${escapeHtml(reason)}</p>${meta}${errorBox}
        <div class="pos-actions">
          ${p.status === 'refunded' ? '' : `<button class="btn btn-primary" type="button" data-pos="retry">${icon('pos')} Reintentar en la maquinita</button>
          <button class="btn btn-outline" type="button" data-pos="other">${icon('cash')} Cobrar de otra forma</button>`}
          <button class="btn btn-ghost" type="button" data-pos="close">Cerrar</button>
        </div>`;
    }
  }

  waitEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pos]');
    if (!b || !waitId) return;
    const id = waitId;
    const errEl = waitEl.querySelector('.form-error');
    const action = b.dataset.pos;
    if (action === 'close') { m.close(); return; }
    if (action === 'demo-paid' || action === 'demo-failed') { backend.demoPointResult(id, action === 'demo-paid' ? 'paid' : 'failed'); return; }
    if (action === 'other') {
      const p = (watches.get(id) || {}).last || state.payments.find((x) => x.id === id);
      if (p) open({ copyFrom: p });
      return;
    }
    if (errEl) showError(errEl, '');
    busy(b, true, action === 'cancel' ? 'Cancelando…' : 'Enviando…');
    try {
      if (action === 'cancel') await backend.cancelPointPayment(id);
      if (action === 'retry') { await backend.retryPointPayment(id); watch(id); }
      backend.refreshPointPayment(id).catch(() => {});
      ctx.reload(); // la lista muestra el nuevo estado
    } catch (ex) {
      const el = waitEl.querySelector('.form-error');
      if (el) showError(el, ex.message); else toast(ex.message);
    }
    busy(b, false);
  });

  // --- Maquinita: elegir cuál usar ----------------------------------------------------------
  const pm = modal('point-modal');
  const pointList = $('point-list');
  const pointErr = pm.el.querySelector('.form-error');
  const useBtn = $('point-use');
  async function openTerminals() {
    showError(pointErr, '');
    pointList.innerHTML = '<div class="empty">Buscando las maquinitas de su cuenta de Mercado Pago…</div>';
    useBtn.disabled = true;
    pm.open();
    try {
      const { terminals, current } = await backend.pointTerminals();
      pointList.innerHTML = terminals.length ? terminals.map((t) => `
        <label class="point-option"><input type="radio" name="terminal" value="${escapeHtml(t.id)}"${t.id === current ? ' checked' : ''}>
          <span><strong>${escapeHtml(terminalLabel(t.id))}</strong><small class="mono">${escapeHtml(t.id)}</small></span>
          ${t.id === current ? '<span class="badge green">En uso</span>' : t.operatingMode === 'PDV' ? '<span class="badge blue">Integrada</span>' : '<span class="badge gray">Independiente</span>'}
        </label>`).join('')
        : '<div class="empty">No hay maquinitas en la cuenta. Vincule la maquinita a una caja en la app de Mercado Pago.</div>';
      useBtn.disabled = !pointList.querySelector('input:checked');
    } catch (ex) {
      pointList.innerHTML = '';
      showError(pointErr, ex.message);
    }
  }
  pointList.addEventListener('change', () => { useBtn.disabled = !pointList.querySelector('input:checked'); });
  useBtn.addEventListener('click', async () => {
    const r = pointList.querySelector('input:checked');
    if (!r) return;
    showError(pointErr, '');
    busy(useBtn, true, 'Configurando…');
    try {
      await backend.pointUseTerminal(r.value);
      terminalId = r.value;
      toast(terminalLabel(r.value) + ' lista para cobrar.');
      pm.close();
    } catch (ex) { showError(pointErr, ex.message); }
    busy(useBtn, false);
  });
  $('point-config').addEventListener('click', openTerminals);

  return { render, open };
}
