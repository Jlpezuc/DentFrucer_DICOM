// DentFrucer — lógica de las páginas.
// Los datos vienen de backend.js (Firebase, o modo demostración si no está configurado).

import { icon, renderIcons } from './icons.js';

const page = document.body.dataset.page;
renderIcons();
// La landing no necesita Firebase: solo se carga en las páginas con sesión.
const { backend, isDemo } = page === 'landing' ? {} : await import('./backend.js');

// ---------- Utilidades ----------
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initials(name) {
  return String(name || '?').replace(/^(Dr\.|Dra\.)\s*/, '').split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtSize(bytes) {
  if (!bytes) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3000);
}

function statusBadge(s) {
  const map = { 'Nuevo': 'blue', 'Visto': 'green' };
  return '<span class="badge ' + (map[s] || 'gray') + '">' + escapeHtml(s || '—') + '</span>';
}

function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn._label = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'Procesando…'; }
  else { btn.disabled = false; if (btn._label) btn.innerHTML = btn._label; }
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
}

// ---------- Modales ----------
function modal(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const close = () => el.classList.remove('open');
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return {
    el,
    open() { el.classList.add('open'); const f = el.querySelector('input, select, button[data-close]'); if (f) f.focus(); },
    close
  };
}

function viewerMarkup(study) {
  return '' +
    '<div class="viewer-mock">' +
      '<div class="vm-toolbar">' +
        '<span class="vm-tool active" title="Mover">' + icon('move') + '</span>' +
        '<span class="vm-tool" title="Zoom">' + icon('zoom') + '</span>' +
        '<span class="vm-tool" title="Ventana / Nivel">' + icon('contrast') + '</span>' +
        '<span class="vm-tool" title="Medir">' + icon('ruler') + '</span>' +
        '<span class="vm-tool" title="3D">' + icon('cube') + '</span>' +
        '<span class="vm-title">' + escapeHtml(study.code) + ' · ' + escapeHtml(study.modality) + '</span>' +
      '</div>' +
      '<div class="vm-body">' +
        '<div class="vm-series"><div class="vm-thumb active"></div><div class="vm-thumb"></div><div class="vm-thumb"></div></div>' +
        '<div class="vm-grid">' +
          '<div class="vm-pane"><span class="label">AXIAL</span><div class="vm-shape axial"></div><span class="xhair-h"></span><span class="xhair-v"></span></div>' +
          '<div class="vm-pane"><span class="label">CORONAL</span><div class="vm-shape"></div><span class="xhair-h"></span><span class="xhair-v"></span></div>' +
          '<div class="vm-pane"><span class="label">SAGITAL</span><div class="vm-shape"></div><span class="xhair-h"></span><span class="xhair-v"></span></div>' +
          '<div class="vm-pane three-d"><span class="label">3D</span><div class="vm-shape"></div><span class="vm-placeholder-tag">Visor en desarrollo</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="vm-status"><span>' + escapeHtml(study.patientName) + ' · ' + escapeHtml(study.patientCode) + '</span><span>' + (study.files || []).length + ' archivo(s) · ' + fmtSize(study.totalSize) + '</span></div>' +
    '</div>';
}

function initViewer() {
  const m = modal('viewer-modal');
  return (study) => {
    m.el.querySelector('.modal-head h3').textContent = study.patientName + ' — ' + study.description;
    m.el.querySelector('.modal-content').innerHTML = viewerMarkup(study);
    m.open();
  };
}

function initFilesModal() {
  const m = modal('files-modal');
  return async (study) => {
    if (isDemo) { toast('Descarga no disponible en modo demostración.'); return; }
    const list = m.el.querySelector('.file-list');
    list.innerHTML = '<li class="muted">Preparando enlaces…</li>';
    m.el.querySelector('.modal-head h3').textContent = 'Archivos · ' + study.patientName;
    m.open();
    try {
      const files = await backend.fileUrls(study);
      list.innerHTML = files.length
        ? files.map((f) => '<li><a href="' + escapeHtml(f.url) + '" target="_blank" rel="noopener" download>' + icon('download') + ' ' + escapeHtml(f.name) + '</a></li>').join('')
        : '<li class="muted">Este estudio no tiene archivos.</li>';
    } catch (e) {
      list.innerHTML = '<li class="muted">No se pudieron obtener los archivos.</li>';
    }
  };
}

// ---------- Sesión y guardas ----------
const ROUTES = {
  doctor: { login: 'login.html', home: 'portal.html' },
  admin: { login: 'admin-login.html', home: 'admin.html' }
};

async function requireRole(role) {
  let user = null;
  try { user = await backend.currentUser(); } catch (e) { user = null; }
  if (!user || user.role !== role) {
    location.replace(ROUTES[role].login);
    return null;
  }
  document.querySelectorAll('[data-user-name]').forEach((el) => { el.textContent = user.name; });
  document.querySelectorAll('[data-user-title]').forEach((el) => { el.textContent = user.title; });
  document.querySelectorAll('[data-user-initials]').forEach((el) => { el.textContent = initials(user.name); });
  document.querySelectorAll('[data-logout]').forEach((el) => el.addEventListener('click', async () => {
    await backend.signOut();
    location.href = ROUTES[role].login;
  }));
  document.body.removeAttribute('data-guard');
  return user;
}

// ---------- Landing ----------
function initLanding() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));
  }
  const contact = document.getElementById('contact-form');
  if (contact) {
    contact.addEventListener('submit', (e) => {
      e.preventDefault();
      contact.reset();
      toast('Gracias. Nos pondremos en contacto pronto.');
    });
  }
  setText('year', new Date().getFullYear());
}

// ---------- Inicio de sesión (médico o administrador según data-role) ----------
async function initLogin() {
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

// ---------- Panel de administración ----------
async function initAdmin() {
  if (!(await requireRole('admin'))) return;
  const openViewer = initViewer();
  const openFiles = initFilesModal();
  const doctorModal = modal('doctor-modal');
  const patientModal = modal('patient-modal');

  const state = { studies: [], patients: [], doctors: [], filter: 'all' };
  const doctorName = (id) => (state.doctors.find((d) => d.id === id) || {}).name;

  async function load() {
    try {
      const [studies, patients, doctors] = await Promise.all([backend.listStudies(), backend.listPatients(), backend.listDoctors()]);
      Object.assign(state, { studies, patients, doctors });
    } catch (e) {
      toast('No se pudieron cargar los datos: ' + e.message);
    }
    renderAll();
  }

  function renderAll() {
    setText('stat-studies', state.studies.length);
    setText('stat-patients', state.patients.length);
    setText('stat-doctors', state.doctors.length);
    setText('stat-unassigned', state.patients.filter((p) => !p.doctorId).length);
    renderStudies();
    renderPatients();
    renderDoctors();
    renderSelects();
  }

  // Estudios
  const tbody = document.getElementById('studies-body');
  const search = document.getElementById('admin-search');
  function renderStudies() {
    const q = search.value.trim().toLowerCase();
    const rows = state.studies.filter((s) => {
      if (state.filter === 'new' && s.status !== 'Nuevo') return false;
      if (state.filter === 'cbct' && s.modality !== 'CBCT') return false;
      return !q || [s.patientName, s.patientCode, s.code, doctorName(s.doctorId), s.modality].join(' ').toLowerCase().includes(q);
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty">' + (state.studies.length ? 'No se encontraron estudios.' : 'Todavía no hay estudios. Cargue el primero abajo.') + '</div></td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((s) => {
      const doc = s.doctorId && doctorName(s.doctorId) ? escapeHtml(doctorName(s.doctorId)) : '<span class="badge gray">Sin asignar</span>';
      return '<tr>' +
        '<td><div class="cell-patient"><span class="avatar">' + initials(s.patientName) + '</span><div><strong>' + escapeHtml(s.patientName) + '</strong><small>' + escapeHtml(s.patientCode) + (s.patientAge ? ' · ' + s.patientAge + ' años' : '') + '</small></div></div></td>' +
        '<td><span class="mono">' + escapeHtml(s.code) + '</span></td>' +
        '<td><span class="badge blue">' + escapeHtml(s.modality) + '</span></td>' +
        '<td>' + fmtDate(s.date) + '</td>' +
        '<td>' + doc + '</td>' +
        '<td><span class="mono">' + fmtSize(s.totalSize) + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button class="icon-btn" title="Ver" data-view="' + escapeHtml(s.id) + '">' + icon('eye') + '</button>' +
          '<button class="icon-btn" title="Archivos" data-files="' + escapeHtml(s.id) + '">' + icon('download') + '</button>' +
          '<button class="icon-btn" title="Eliminar" data-delete="' + escapeHtml(s.id) + '">' + icon('trash') + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }
  document.querySelectorAll('#study-tabs button').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.filter;
    document.querySelectorAll('#study-tabs button').forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
    renderStudies();
  }));
  search.addEventListener('input', renderStudies);
  tbody.addEventListener('click', async (e) => {
    const find = (attr) => { const b = e.target.closest('[' + attr + ']'); return b && state.studies.find((s) => s.id === b.getAttribute(attr)); };
    const v = find('data-view'); if (v) openViewer(v);
    const f = find('data-files'); if (f) openFiles(f);
    const d = find('data-delete');
    if (d && confirm('¿Eliminar el estudio ' + d.code + ' de ' + d.patientName + '? Se borrarán también sus archivos.')) {
      try { await backend.deleteStudy(d); toast('Estudio eliminado.'); await load(); } catch (ex) { toast('No se pudo eliminar: ' + ex.message); }
    }
  });

  // Pacientes
  const pBody = document.getElementById('patients-body');
  function doctorOptions(selected, emptyLabel) {
    return '<option value="">' + (emptyLabel || 'Sin asignar') + '</option>' +
      state.doctors.map((d) => '<option value="' + escapeHtml(d.id) + '"' + (d.id === selected ? ' selected' : '') + '>' + escapeHtml(d.name) + '</option>').join('');
  }
  function renderPatients() {
    if (!state.patients.length) { pBody.innerHTML = '<tr><td colspan="3"><div class="empty">Aún no hay pacientes.</div></td></tr>'; return; }
    pBody.innerHTML = state.patients.map((p) => {
      const n = state.studies.filter((s) => s.patientId === p.id).length;
      return '<tr><td><div class="cell-patient"><span class="avatar">' + initials(p.name) + '</span><div><strong>' + escapeHtml(p.name) + '</strong><small>' + escapeHtml(p.code) + (p.age ? ' · ' + p.age + ' años' : '') + '</small></div></div></td>' +
        '<td>' + n + '</td>' +
        '<td><label class="sr-only" for="pd-' + escapeHtml(p.id) + '">Médico de ' + escapeHtml(p.name) + '</label><select class="input select input-sm" id="pd-' + escapeHtml(p.id) + '" data-patient="' + escapeHtml(p.id) + '">' + doctorOptions(p.doctorId) + '</select></td></tr>';
    }).join('');
  }
  pBody.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-patient]');
    if (!sel) return;
    sel.disabled = true;
    try {
      await backend.setPatientDoctor(sel.dataset.patient, sel.value);
      toast('Médico actualizado. Sus estudios ahora son visibles para ' + (doctorName(sel.value) || 'nadie') + '.');
      await load();
    } catch (ex) { toast('No se pudo actualizar: ' + ex.message); sel.disabled = false; }
  });

  // Médicos
  const dBody = document.getElementById('doctors-body');
  function renderDoctors() {
    if (!state.doctors.length) { dBody.innerHTML = '<tr><td colspan="3"><div class="empty">Aún no hay médicos registrados.</div></td></tr>'; return; }
    dBody.innerHTML = state.doctors.map((d) => {
      const n = state.patients.filter((p) => p.doctorId === d.id).length;
      return '<tr><td><div class="cell-patient"><span class="avatar" style="background:var(--green-600)">' + initials(d.name) + '</span><div><strong>' + escapeHtml(d.name) + '</strong><small>' + escapeHtml(d.email) + '</small></div></div></td>' +
        '<td>' + escapeHtml(d.specialty || '—') + '</td><td>' + n + '</td></tr>';
    }).join('');
  }

  function renderSelects() {
    const up = document.getElementById('u-patient');
    const cur = up.value;
    up.innerHTML = '<option value="">Seleccione un paciente…</option>' + state.patients.map((p) =>
      '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + ' · ' + escapeHtml(p.code) + (p.doctorId ? ' — ' + escapeHtml(doctorName(p.doctorId) || '') : ' — sin médico') + '</option>').join('');
    up.value = cur;
    document.getElementById('np-doctor').innerHTML = doctorOptions('', 'Asignar más tarde');
  }

  // Nuevo médico
  document.querySelectorAll('[data-open="doctor"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); doctorModal.open(); }));
  const dForm = document.getElementById('doctor-form');
  dForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = dForm.querySelector('.form-error');
    const btn = dForm.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(dForm));
    showError(err, '');
    if (!data.name.trim() || !data.email.trim() || data.password.length < 6) { showError(err, 'Complete nombre, correo y una contraseña de al menos 6 caracteres.'); return; }
    busy(btn, true, 'Creando…');
    try {
      await backend.createDoctor(data);
      dForm.reset();
      doctorModal.close();
      toast('Cuenta creada para ' + data.name + '. Comparta sus credenciales de forma segura.');
      await load();
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  // Nuevo paciente
  document.querySelectorAll('[data-open="patient"]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); patientModal.open(); }));
  const pForm = document.getElementById('patient-form');
  pForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = pForm.querySelector('.form-error');
    const btn = pForm.querySelector('button[type=submit]');
    const data = Object.fromEntries(new FormData(pForm));
    showError(err, '');
    if (!data.name.trim()) { showError(err, 'Escriba el nombre del paciente.'); return; }
    busy(btn, true, 'Guardando…');
    try {
      const id = await backend.createPatient(data);
      pForm.reset();
      patientModal.close();
      toast('Paciente registrado.');
      await load();
      document.getElementById('u-patient').value = id;
    } catch (ex) { showError(err, ex.message); }
    busy(btn, false);
  });

  // Carga de estudios
  const uForm = document.getElementById('upload-form');
  const dz = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const folderInput = document.getElementById('folder-input');
  const fileSummary = document.getElementById('file-summary');
  const progress = document.getElementById('upload-progress');
  let files = [];
  document.getElementById('u-date').value = today();

  function setFiles(list) {
    files = Array.from(list || []).filter((f) => !f.name.startsWith('.'));
    fileSummary.textContent = files.length ? files.length + ' archivo(s) · ' + fmtSize(files.reduce((n, f) => n + f.size, 0)) : '';
  }
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => setFiles(e.dataTransfer && e.dataTransfer.files));
  fileInput.addEventListener('change', () => setFiles(fileInput.files));
  folderInput.addEventListener('change', () => setFiles(folderInput.files));
  document.getElementById('pick-folder').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); folderInput.click(); });

  uForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = uForm.querySelector('.form-error');
    const btn = uForm.querySelector('button[type=submit]');
    const patient = state.patients.find((p) => p.id === document.getElementById('u-patient').value);
    showError(err, '');
    if (!patient) { showError(err, 'Seleccione un paciente (o regístrelo primero).'); return; }
    if (!files.length) { showError(err, 'Agregue los archivos del estudio.'); return; }
    busy(btn, true, 'Subiendo…');
    progress.hidden = false;
    const bar = progress.querySelector('span');
    bar.style.width = '0%';
    try {
      await backend.uploadStudy({
        patient,
        modality: document.getElementById('u-modality').value,
        description: document.getElementById('u-desc').value.trim() || document.getElementById('u-modality').value,
        date: document.getElementById('u-date').value || today(),
        files,
        onProgress: (p) => { bar.style.width = Math.round(p * 100) + '%'; }
      });
      toast('Estudio cargado' + (patient.doctorId ? ' y visible para ' + doctorName(patient.doctorId) : '') + '.');
      uForm.reset();
      document.getElementById('u-date').value = today();
      setFiles([]);
      await load();
    } catch (ex) { showError(err, 'No se pudo cargar: ' + ex.message); }
    progress.hidden = true;
    busy(btn, false);
  });

  await load();
}

// ---------- Portal del médico ----------
async function initPortal() {
  const user = await requireRole('doctor');
  if (!user) return;
  const openViewer = initViewer();
  const openFiles = initFilesModal();
  let mine = [];
  let patients = [];

  const grid = document.getElementById('study-grid');
  const search = document.getElementById('portal-search');
  const mod = document.getElementById('modality-filter');

  function render() {
    setText('stat-my-patients', patients.length);
    setText('stat-my-studies', mine.length);
    setText('stat-my-new', mine.filter((s) => s.status === 'Nuevo').length);

    const q = search.value.trim().toLowerCase();
    const rows = mine.filter((s) => (!mod.value || s.modality === mod.value) && (!q || [s.patientName, s.patientCode, s.description].join(' ').toLowerCase().includes(q)));
    grid.innerHTML = rows.length ? rows.map((s) => {
      const shape = s.modality === 'Panorámica' ? 'pano' : (s.modality === 'CBCT' ? 'axial' : '');
      return '<article class="study-card">' +
        '<div class="study-thumb"><span class="badge blue mod">' + escapeHtml(s.modality) + '</span><div class="vm-shape ' + shape + '"></div></div>' +
        '<div class="study-body">' +
          '<h3>' + escapeHtml(s.patientName) + '</h3>' +
          '<div class="meta">' + escapeHtml(s.description) + '</div>' +
          '<div class="meta">' + fmtDate(s.date) + ' · ' + (s.files || []).length + ' archivo(s) · ' + fmtSize(s.totalSize) + '</div>' +
        '</div>' +
        '<div class="study-foot">' + statusBadge(s.status) +
          '<div class="row-actions">' +
            '<button class="icon-btn" title="Descargar" data-files="' + escapeHtml(s.id) + '">' + icon('download') + '</button>' +
            '<button class="btn btn-primary btn-sm" data-view="' + escapeHtml(s.id) + '">' + icon('eye') + ' Abrir</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('') : '<div class="empty">' + (mine.length ? 'No hay estudios que coincidan.' : 'Aún no tiene estudios disponibles. Aparecerán aquí en cuanto DentFrucer los cargue.') + '</div>';

    const pBody = document.getElementById('patients-body');
    pBody.innerHTML = patients.length ? patients.map((p) => {
      const ps = mine.filter((s) => s.patientId === p.id);
      const last = ps.reduce((m, s) => (s.date > m ? s.date : m), '');
      return '<tr><td><div class="cell-patient"><span class="avatar">' + initials(p.name) + '</span><div><strong>' + escapeHtml(p.name) + '</strong><small>' + escapeHtml(p.code) + (p.age ? ' · ' + p.age + ' años' : '') + '</small></div></div></td>' +
        '<td>' + ps.length + '</td><td>' + fmtDate(last) + '</td></tr>';
    }).join('') : '<tr><td colspan="3"><div class="empty">Aún no tiene pacientes asignados.</div></td></tr>';
  }

  search.addEventListener('input', render);
  mod.addEventListener('change', render);
  grid.addEventListener('click', async (e) => {
    const find = (attr) => { const b = e.target.closest('[' + attr + ']'); return b && mine.find((s) => s.id === b.getAttribute(attr)); };
    const f = find('data-files'); if (f) openFiles(f);
    const v = find('data-view');
    if (v) {
      openViewer(v);
      if (v.status === 'Nuevo') {
        try { await backend.markSeen(v.id); v.status = 'Visto'; render(); } catch (ex) { /* no crítico */ }
      }
    }
  });

  try {
    [mine, patients] = await Promise.all([backend.listStudies({ doctorId: user.uid }), backend.listPatients({ doctorId: user.uid })]);
  } catch (e) {
    toast('No se pudieron cargar sus estudios: ' + e.message);
  }
  render();
}

// ---------- Arranque ----------
if (page === 'landing') initLanding();
if (page === 'login') initLogin();
if (page === 'admin') initAdmin();
if (page === 'portal') initPortal();
