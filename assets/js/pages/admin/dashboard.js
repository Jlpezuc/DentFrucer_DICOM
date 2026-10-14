// Resumen: ingresos, medios de pago, exámenes y citas de un período (desde /
// hasta, con atajos: hoy, esta semana, este mes, mes anterior, este año).
//
//   Indicadores   ingresos (y cambio frente al período anterior de igual largo),
//                 exámenes, citas y citas atendidas sin cobro
//   Gráficos      ingresos en el tiempo (columnas por día, semana o mes),
//                 anillos (pastel) de ingresos por medio de pago y por servicio, y
//                 barras horizontales de exámenes por servicio y por médico
//   Por cobrar    visitas del período que no están pagadas y citas atendidas sin
//                 visita ni cobro
//
// Las barras usan un solo color: comparan magnitudes, no identifican series.
// En los anillos cada color identifica un medio de pago o servicio: el color va
// con el elemento (no con su lugar en el orden) y la leyenda muestra nombre,
// monto y porcentaje, así que nada depende solo del color.
// Cada gráfico tiene su tabla o lista equivalente para lectores de pantalla.

import { addDays, examLabel, isoDate, parseIso } from '../../services/agenda.js';
import { groupStudies, isReportOnly, PAY_STATE } from '../../services/groups.js';
import { fmtCLP, PAYMENT_METHODS } from '../../services/payments.js';
import { activeServices, studyServiceName } from '../../services/settings.js';
import { escapeHtml } from '../../ui/dom.js';
import { fmtDate, today } from '../../ui/format.js';
import { icon } from '../../ui/icons.js';
import { doctorNames } from './common.js';

const DAY_MS = 86400000;
const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / DAY_MS) + 1;
const mondayOf = (iso) => addDays(iso, -((parseIso(iso).getDay() + 6) % 7));

// Colores de los anillos, en orden fijo (validados para daltonismo); "Otros" va en gris.
const SLICE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];
const OTHER_COLOR = '#9aa5ae';
const MAX_SLICES = SLICE_COLORS.length;

// Deja las porciones mayores y junta el resto en "Otros". Cada porción toma el
// color de su lugar en `order` (lista fija: medios de pago, servicios), así un
// mismo elemento conserva su color al cambiar el período; las demás toman los
// colores libres.
function slices(rows, order) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const keep = sorted.length > MAX_SLICES ? sorted.slice(0, MAX_SLICES - 1) : sorted;
  const rest = sorted.slice(keep.length);
  const used = new Set();
  const out = keep.map((r) => ({ ...r }));
  out.forEach((r) => {
    const i = order.indexOf(r.label);
    if (i >= 0 && i < MAX_SLICES) { r.color = SLICE_COLORS[i]; used.add(i); }
  });
  out.filter((r) => !r.color).forEach((r) => {
    const i = SLICE_COLORS.findIndex((_, k) => !used.has(k));
    used.add(i);
    r.color = SLICE_COLORS[i];
  });
  if (rest.length) out.push({ label: 'Otros', value: rest.reduce((n, r) => n + r.value, 0), note: rest.length + ' más', color: OTHER_COLOR });
  return out;
}

// $1.250.000 -> "$1,3 M"; $85.000 -> "$85 mil".
function compactCLP(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: n >= 1e7 ? 0 : 1 }) + ' M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CL') + ' mil';
  return fmtCLP(n);
}

function presetRange(id) {
  const t = today();
  const d = parseIso(t);
  if (id === 'today') return [t, t];
  if (id === 'week') return [mondayOf(t), t];
  if (id === 'month') return [t.slice(0, 8) + '01', t];
  if (id === 'last-month') {
    const first = isoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    return [first, isoDate(new Date(d.getFullYear(), d.getMonth(), 0))];
  }
  if (id === 'year') return [t.slice(0, 5) + '01-01', t];
  return [t, t];
}

// Agrupa fechas en columnas: por día (hasta un mes), semana (hasta 4 meses) o mes.
function buckets(from, to) {
  const n = daysBetween(from, to);
  const unit = n <= 31 ? 'day' : n <= 124 ? 'week' : 'month';
  const keyOf = (iso) => (unit === 'day' ? iso : unit === 'week' ? mondayOf(iso) : iso.slice(0, 7));
  const list = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = keyOf(d);
    if (!list.length || list[list.length - 1].key !== k) list.push({ key: k, from: d, to: d, total: 0, count: 0 });
    list[list.length - 1].to = d;
  }
  const label = (b) => (unit === 'day' ? parseIso(b.from).getDate() + ''
    : unit === 'week' ? parseIso(b.from).toLocaleDateString('es', { day: 'numeric', month: 'short' })
      : parseIso(b.from).toLocaleDateString('es', { month: 'short' }));
  const title = (b) => (unit === 'day' ? fmtDate(b.from) : unit === 'week' ? 'Semana del ' + fmtDate(b.from) : parseIso(b.from).toLocaleDateString('es', { month: 'long', year: 'numeric' }));
  return { unit, list, keyOf, label, title };
}

export function createDashboard(ctx) {
  const { state } = ctx;
  const $ = (id) => document.getElementById(id);
  const out = $('dash-body');
  const fromInput = $('dash-from');
  const toInput = $('dash-to');
  const presets = document.querySelectorAll('#dash-presets [data-range]');
  [fromInput.value, toInput.value] = presetRange('month');

  function pick(id) {
    [fromInput.value, toInput.value] = presetRange(id);
    presets.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === id)));
    render();
  }
  presets.forEach((b) => b.addEventListener('click', () => pick(b.dataset.range)));
  [fromInput, toInput].forEach((el) => el.addEventListener('change', () => {
    if (fromInput.value && toInput.value && fromInput.value > toInput.value) [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
    presets.forEach((b) => b.setAttribute('aria-selected', 'false'));
    render();
  }));

  // --- Piezas -----------------------------------------------------------------------------
  const tile = (label, value, sub = '', cls = '') => `
    <div class="kpi ${cls}"><span class="kpi-label">${label}</span><strong class="kpi-value">${value}</strong>${sub ? `<span class="kpi-sub">${sub}</span>` : ''}</div>`;

  function delta(now, before) {
    if (!before) return now ? '<span class="delta">Sin ingresos en el período anterior</span>' : '';
    const pct = Math.round(((now - before) / before) * 100);
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
    return `<span class="delta ${cls}">${pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : ''}${pct}% vs. período anterior</span>`;
  }

  // Barras horizontales ordenadas de mayor a menor, con el valor y la parte del total.
  function barList(title, rows, { format = (v) => v, share = true, empty = 'Sin datos en el período.' } = {}) {
    const max = Math.max(...rows.map((r) => r.value), 0);
    const total = rows.reduce((n, r) => n + r.value, 0);
    return `<section class="dash-card">
      <h3>${title}</h3>
      ${rows.length ? `<ul class="bar-list">${rows.map((r) => `
        <li title="${escapeHtml(r.label)}: ${escapeHtml(String(format(r.value)))}${r.note ? ' · ' + escapeHtml(r.note) : ''}">
          <span class="bl-label">${escapeHtml(r.label)}${r.note ? `<small>${escapeHtml(r.note)}</small>` : ''}</span>
          <span class="bl-track"><span class="bl-bar" style="width:${max ? Math.max(2, (r.value / max) * 100) : 0}%"></span></span>
          <span class="bl-value">${format(r.value)}${share && total ? `<small>${Math.round((r.value / total) * 100)}%</small>` : ''}</span>
        </li>`).join('')}</ul>` : `<p class="muted dash-empty">${empty}</p>`}
    </section>`;
  }

  // Anillo (pastel) con leyenda: color, nombre, monto y parte del total.
  function pieChart(title, rows, { format = (v) => v, empty = 'Sin datos en el período.' } = {}) {
    const total = rows.reduce((n, r) => n + r.value, 0);
    if (!rows.length || !total) return `<section class="dash-card"><h3>${title}</h3><p class="muted dash-empty">${empty}</p></section>`;
    const C = 90;
    const R = 84;
    const r = 54;
    const pt = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
    // Sector del anillo entre dos ángulos (0 = arriba, sentido horario).
    const arc = (a0, a1) => {
      const large = a1 - a0 > Math.PI ? 1 : 0;
      return `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${large} 0 ${pt(r, a0)}Z`;
    };
    let a = -Math.PI / 2;
    const paths = rows.map((x, i) => {
      const sweep = (x.value / total) * Math.PI * 2;
      const a0 = a;
      a += sweep;
      // Una sola porción (100 %): dos mitades, porque un arco no puede cerrarse sobre sí mismo.
      const d = sweep >= Math.PI * 2 - 1e-6 ? arc(a0, a0 + Math.PI) + arc(a0 + Math.PI, a0 + Math.PI * 2) : arc(a0, a);
      return `<path class="pie-slice" data-i="${i}" d="${d}" fill="${x.color}"></path>`;
    }).join('');
    const pct = (v) => Math.round((v / total) * 100) + '%';
    pieData.push({ rows, total, format });
    return `<section class="dash-card">
      <h3>${title}</h3>
      <div class="pie-chart" data-pie="${pieData.length - 1}">
        <div class="pie-figure">
          <svg viewBox="0 0 ${C * 2} ${C * 2}" role="img" aria-label="${escapeHtml(title)}: ${rows.map((x) => escapeHtml(x.label) + ' ' + pct(x.value)).join(', ')}">
            ${paths}
            <text class="pie-total" x="${C}" y="${C + 2}" text-anchor="middle">${compactCLP(total)}</text>
            <text class="pie-caption" x="${C}" y="${C + 20}" text-anchor="middle">total</text>
          </svg>
          <div class="tc-tip" hidden></div>
        </div>
        <ul class="pie-legend">${rows.map((x, i) => `
          <li data-i="${i}" title="${escapeHtml(x.label)}"><span class="pie-swatch" style="background:${x.color}"></span>
            <span class="bl-label">${escapeHtml(x.label)}${x.note ? `<small>${escapeHtml(x.note)}</small>` : ''}</span>
            <span class="bl-value">${format(x.value)}<small>${pct(x.value)}</small></span></li>`).join('')}</ul>
      </div>
    </section>`;
  }

  // Columnas de ingresos en el tiempo (SVG), con su tabla para lectores de pantalla.
  function timeChart(b) {
    const W = 720;
    const H = 220;
    const pad = { l: 64, r: 8, t: 12, b: 26 };
    const max = Math.max(...b.list.map((x) => x.total), 0);
    const top = max ? niceMax(max) : 1;
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const slot = iw / b.list.length;
    const bw = Math.min(24, Math.max(3, slot * 0.6));
    const y = (v) => pad.t + ih - (v / top) * ih;
    const ticks = [0, top / 2, top];
    const every = Math.ceil(b.list.length / 12);
    const bars = b.list.map((x, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const h = (x.total / top) * ih;
      const r = Math.min(4, h, bw / 2);
      const x0 = cx - bw / 2;
      const y0 = pad.t + ih;
      // Extremo de datos redondeado; la base queda recta.
      const path = h > 0 ? `M${x0},${y0}V${y0 - h + r}Q${x0},${y0 - h} ${x0 + r},${y0 - h}H${x0 + bw - r}Q${x0 + bw},${y0 - h} ${x0 + bw},${y0 - h + r}V${y0}Z` : '';
      return `<g class="tc-col" data-i="${i}">
        <rect class="tc-hit" x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${ih}"></rect>
        ${path ? `<path class="tc-bar" d="${path}"></path>` : ''}
        ${i % every === 0 ? `<text class="tc-x" x="${cx}" y="${H - 8}" text-anchor="middle">${escapeHtml(b.label(x))}</text>` : ''}
      </g>`;
    }).join('');
    return `<section class="dash-card dash-wide">
      <h3>Ingresos ${b.unit === 'day' ? 'por día' : b.unit === 'week' ? 'por semana' : 'por mes'}</h3>
      <div class="time-chart">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos ${b.unit === 'day' ? 'por día' : b.unit === 'week' ? 'por semana' : 'por mes'} del período">
          ${ticks.map((t) => `<line class="tc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"></line><text class="tc-y" x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${compactCLP(t)}</text>`).join('')}
          ${bars}
        </svg>
        <div class="tc-tip" hidden></div>
      </div>
      <table class="sr-only"><caption>Ingresos del período</caption><thead><tr><th>Período</th><th>Ingresos</th><th>Cobros</th></tr></thead>
        <tbody>${b.list.map((x) => `<tr><td>${escapeHtml(b.title(x))}</td><td>${fmtCLP(x.total)}</td><td>${x.count}</td></tr>`).join('')}</tbody></table>
    </section>`;
  }

  // --- Dibujo ---------------------------------------------------------------------------------
  let currentBuckets = null;
  let pieData = [];

  function render() {
    const from = fromInput.value || today();
    const to = toInput.value || today();
    const inRange = (d) => d >= from && d <= to;
    const len = daysBetween(from, to);
    const prevFrom = addDays(from, -len);
    const prevTo = addDays(from, -1);

    const pays = state.payments.filter((x) => inRange(x.date));
    const prevPays = state.payments.filter((x) => x.date >= prevFrom && x.date <= prevTo);
    const income = pays.reduce((n, x) => n + x.total, 0);
    const prevIncome = prevPays.reduce((n, x) => n + x.total, 0);
    const exams = state.studies.filter((s) => inRange(s.date) && !isReportOnly(s));
    const appts = state.appointments.filter((a) => inRange(a.date));
    const byStatus = (st) => appts.filter((a) => a.status === st).length;
    // Por cobrar: visitas no pagadas y citas atendidas que no tienen visita ni cobro.
    const unpaidVisits = groupStudies(state.studies).filter((g) => inRange(g.date) && g.payState !== 'paid');
    const paidAppts = new Set(state.payments.map((x) => x.appointmentId).filter(Boolean));
    const paidDays = new Set(state.payments.map((x) => x.patientId + '|' + x.date));
    const visitDays = new Set(state.studies.map((x) => x.patientId + '|' + x.date));
    const unpaidAppts = appts.filter((a) => a.status === 'Atendida' && !paidAppts.has(a.id) && !paidDays.has(a.patientId + '|' + a.date) && !visitDays.has(a.patientId + '|' + a.date));
    const pending = unpaidVisits.length + unpaidAppts.length;
    const canPay = ctx.can('cobros');
    const seeMoney = ctx.can('cobros') || ctx.can('resumen');

    // Ingresos por medio de pago y por servicio; exámenes por servicio y por médico.
    const methodRows = PAYMENT_METHODS.map((m) => {
      const list = pays.filter((x) => x.method === m);
      return { label: m, value: list.reduce((n, x) => n + x.total, 0), note: list.length ? list.length + (list.length === 1 ? ' cobro' : ' cobros') : '' };
    }).filter((r) => r.value > 0);
    const services = new Map();
    pays.forEach((x) => {
      const share = x.items.length ? x.discount / x.items.length : 0;
      x.items.forEach((it) => services.set(it.label, (services.get(it.label) || 0) + Math.max(0, it.price - share)));
    });
    const serviceRows = [...services.entries()].map(([label, value]) => ({ label, value })).filter((r) => r.value > 0);
    const byService = new Map();
    exams.forEach((s) => { const n = studyServiceName(s); byService.set(n, (byService.get(n) || 0) + 1); });
    const examServiceRows = [...byService.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const doctors = new Map();
    exams.forEach((s) => (s.doctorIds.length ? s.doctorIds : ['']).forEach((id) => doctors.set(id, (doctors.get(id) || 0) + 1)));
    const doctorRows = [...doctors.entries()].map(([id, value]) => ({ label: id ? doctorNames(state.doctors, [id]) : 'Sin médico', value })).sort((a, b) => b.value - a.value);

    currentBuckets = buckets(from, to);
    pieData = [];
    const index = new Map(currentBuckets.list.map((b, i) => [b.key, i]));
    pays.forEach((x) => { const b = currentBuckets.list[index.get(currentBuckets.keyOf(x.date))]; if (b) { b.total += x.total; b.count++; } });

    const period = from === to ? fmtDate(from) : fmtDate(from) + ' – ' + fmtDate(to);
    out.innerHTML = `
      <p class="dash-period">${icon('calendar')} ${escapeHtml(period)} <span class="muted">· ${len} ${len === 1 ? 'día' : 'días'}</span></p>
      <div class="kpis">
        ${seeMoney ? tile('Ingresos', fmtCLP(income), delta(income, prevIncome), 'kpi-hero') : ''}
        ${seeMoney ? tile('Cobros', String(pays.length), pays.length ? 'Promedio ' + fmtCLP(income / pays.length) : '') : ''}
        ${tile('Exámenes realizados', String(exams.length), new Set(exams.map((s) => s.patientId)).size + ' pacientes')}
        ${tile('Citas', String(appts.filter((a) => a.status !== 'Cancelada').length), byStatus('Atendida') + ' atendidas · ' + byStatus('No asistió') + ' no asistieron · ' + byStatus('Cancelada') + ' canceladas')}
        ${tile('Por cobrar', String(pending), pending ? (unpaidVisits.length + ' visitas' + (unpaidAppts.length ? ' · ' + unpaidAppts.length + ' citas' : '') + ' · ver abajo') : 'Todo cobrado', pending ? 'kpi-warn' : '')}
      </div>
      <div class="dash-grid">
        ${seeMoney ? timeChart(currentBuckets) : ''}
        ${seeMoney ? pieChart('Ingresos por medio de pago', slices(methodRows, PAYMENT_METHODS), { format: fmtCLP, empty: 'Sin cobros en el período.' }) : ''}
        ${seeMoney ? pieChart('Ingresos por servicio', slices(serviceRows, activeServices().map((x) => x.label)), { format: fmtCLP, empty: 'Sin cobros en el período.' }) : ''}
        ${barList('Exámenes por servicio', examServiceRows, { empty: 'Sin exámenes en el período.' })}
        ${barList('Exámenes por médico', doctorRows, { share: false, empty: 'Sin exámenes en el período.' })}
      </div>
      <section class="dash-card dash-wide">
        <h3>Por cobrar</h3>
        ${pending ? `<table class="data compact"><thead><tr><th>Fecha</th><th>Paciente</th><th>Exámenes o servicio</th><th>Estado</th><th></th></tr></thead><tbody>${unpaidVisits.map((g) => `
          <tr><td>${fmtDate(g.date)}</td><td>${escapeHtml(g.patientName)}</td><td>${escapeHtml(g.services.join(', '))}</td><td><span class="badge ${g.payState === 'partial' ? 'amber' : 'gray'}">${PAY_STATE[g.payState]}</span></td>
          <td><div class="row-actions">${canPay ? `<button class="btn btn-outline btn-sm" type="button" data-pay-visit="${escapeHtml(g.key)}">${icon('cash')} Cobrar</button>` : ''}</div></td></tr>`).join('')}${unpaidAppts.map((a) => `
          <tr><td>${fmtDate(a.date)} <span class="muted">${escapeHtml(a.time)}</span></td><td>${escapeHtml(a.name)}</td><td>${escapeHtml(examLabel(a.exam))}</td><td><span class="badge gray">Cita sin cobro</span></td>
          <td><div class="row-actions">${canPay ? `<button class="btn btn-outline btn-sm" type="button" data-pay-appt="${escapeHtml(a.id)}">${icon('cash')} Cobrar</button>` : ''}</div></td></tr>`).join('')}</tbody></table>`
        : '<p class="muted dash-empty">Todas las visitas y citas atendidas del período están cobradas.</p>'}
      </section>`;
  }

  // Tooltip: junto al puntero, sin salirse de su recuadro.
  function showTip(tip, html, e) {
    tip.innerHTML = html;
    const box = tip.parentElement.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = Math.min(box.width - tip.offsetWidth, Math.max(0, e.clientX - box.left - tip.offsetWidth / 2)) + 'px';
    tip.style.top = Math.max(0, e.clientY - box.top - tip.offsetHeight - 12) + 'px';
  }
  function hideTips() {
    out.querySelectorAll('.tc-tip').forEach((t) => { t.hidden = true; });
    out.querySelectorAll('.tc-col.on, .pie-chart .on').forEach((c) => c.classList.remove('on'));
  }

  // Anillos: al pasar sobre una porción o su fila de la leyenda se destacan ambas.
  function pieHover(e) {
    const chart = e.target.closest('.pie-chart');
    const item = e.target.closest('.pie-slice, .pie-legend li');
    out.querySelectorAll('.pie-chart .on').forEach((c) => { if (!item || c.closest('.pie-chart') !== chart || c.dataset.i !== item.dataset.i) c.classList.remove('on'); });
    out.querySelectorAll('.pie-chart').forEach((c) => c.classList.toggle('focus', c === chart && !!item));
    out.querySelectorAll('.pie-chart .tc-tip').forEach((t) => { if (!item || !t.closest('.pie-chart').contains(item) || !item.matches('.pie-slice')) t.hidden = true; });
    if (!item) return;
    const { rows, total, format } = pieData[Number(chart.dataset.pie)];
    const x = rows[Number(item.dataset.i)];
    chart.querySelectorAll(`[data-i="${item.dataset.i}"]`).forEach((c) => c.classList.add('on'));
    if (item.matches('.pie-slice')) showTip(chart.querySelector('.tc-tip'), `<strong>${escapeHtml(x.label)}</strong><span>${format(x.value)}</span><small>${Math.round((x.value / total) * 100)}% del total${x.note ? ' · ' + escapeHtml(x.note) : ''}</small>`, e);
  }

  out.addEventListener('pointermove', (e) => {
    pieHover(e);
    const col = e.target.closest('.tc-col');
    const tip = out.querySelector('.time-chart .tc-tip');
    if (!tip) return;
    out.querySelectorAll('.tc-col.on').forEach((c) => { if (c !== col) c.classList.remove('on'); });
    if (!col || !currentBuckets) { tip.hidden = true; return; }
    col.classList.add('on');
    const b = currentBuckets.list[Number(col.dataset.i)];
    showTip(tip, `<strong>${escapeHtml(currentBuckets.title(b))}</strong><span>${fmtCLP(b.total)}</span><small>${b.count} ${b.count === 1 ? 'cobro' : 'cobros'}</small>`, e);
  });
  out.addEventListener('pointerleave', () => { hideTips(); out.querySelectorAll('.pie-chart.focus').forEach((c) => c.classList.remove('focus')); });
  out.addEventListener('click', (e) => {
    const v = e.target.closest('[data-pay-visit]');
    const g = v && groupStudies(state.studies).find((x) => x.key === v.dataset.payVisit);
    if (g) { ctx.openPayment({ patientId: g.patientId, date: g.date, visitKey: g.key }); return; }
    const b = e.target.closest('[data-pay-appt]');
    if (!b) return;
    const a = state.appointments.find((x) => x.id === b.dataset.payAppt);
    if (a) ctx.openPayment({ patientId: a.patientId, date: a.date, appointment: a });
  });

  return { render };
}

// Máximo "redondo" para el eje (1, 2, 2,5 o 5 por una potencia de 10).
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
