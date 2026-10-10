/* DentFrucer — comportamiento de la maqueta.
   NOTA: no hay backend ni base de datos todavía. El inicio de sesión es una
   simulación (sessionStorage) y los datos de pacientes/estudios son de ejemplo. */

(function () {
  'use strict';

  // ---------- Iconos (trazos 24x24, estilo lineal) ----------
  const ICONS = {
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="4"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
    devices: '<rect x="2" y="4" width="14" height="10" rx="2"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    zoom: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>',
    contrast: '<circle cx="12" cy="12" r="10"/><path d="M12 2v20" /><path d="M12 2a10 10 0 0 1 0 20Z" fill="currentColor"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
    move: '<path d="m5 9-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    cube: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    stethoscope: '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>'
  };

  function icon(name, extra) {
    const body = ICONS[name] || '';
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra ? ' ' + extra : '') + '>' + body + '</svg>';
  }

  function renderIcons(root) {
    (root || document).querySelectorAll('i[data-icon]').forEach(function (el) {
      el.outerHTML = icon(el.getAttribute('data-icon'));
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initials(name) {
    return name.replace(/^(Dr\.|Dra\.)\s*/, '').split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase();
  }

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- Sesión simulada ----------
  const SESSION_KEY = 'dentfrucer.session';
  const Session = {
    get: function () {
      try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
    },
    set: function (s) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* modo privado */ }
    },
    clear: function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* noop */ }
    }
  };

  // Usuarios de demostración (se reemplazarán por la base de datos)
  const DEMO_USERS = {
    admin: { email: 'admin@dentfrucer.com', name: 'Administración', role: 'admin', title: 'Administrador' },
    doctor: { email: 'doctor@dentfrucer.com', name: 'Dra. Laura Méndez', role: 'doctor', title: 'Odontóloga · Ortodoncia', id: 'D-01' }
  };

  // ---------- Datos de ejemplo ----------
  const DOCTORS = [
    { id: 'D-01', name: 'Dra. Laura Méndez', specialty: 'Ortodoncia', email: 'doctor@dentfrucer.com', patients: 4 },
    { id: 'D-02', name: 'Dr. Carlos Rivas', specialty: 'Implantología', email: 'crivas@clinica.com', patients: 3 },
    { id: 'D-03', name: 'Dra. Ana Torres', specialty: 'Endodoncia', email: 'atorres@clinica.com', patients: 2 }
  ];

  const STUDIES = [
    { id: 'EST-2026-0418', patient: 'Martina Gómez', pid: 'P-1042', age: 14, modality: 'CBCT', desc: 'Tomografía Cone Beam · maxilar completo', date: '2026-10-08', doctor: 'D-01', size: '412 MB', images: 512, status: 'Nuevo' },
    { id: 'EST-2026-0415', patient: 'Martina Gómez', pid: 'P-1042', age: 14, modality: 'Panorámica', desc: 'Ortopantomografía digital', date: '2026-10-08', doctor: 'D-01', size: '18 MB', images: 1, status: 'Visto' },
    { id: 'EST-2026-0409', patient: 'Julián Pérez', pid: 'P-1037', age: 11, modality: 'Cefalometría', desc: 'Telerradiografía lateral de cráneo', date: '2026-10-06', doctor: 'D-01', size: '22 MB', images: 1, status: 'Visto' },
    { id: 'EST-2026-0402', patient: 'Sofía Herrera', pid: 'P-1029', age: 32, modality: 'CBCT', desc: 'Cone Beam · ATM bilateral', date: '2026-10-03', doctor: 'D-01', size: '388 MB', images: 480, status: 'Nuevo' },
    { id: 'EST-2026-0397', patient: 'Tomás Aguilar', pid: 'P-1021', age: 45, modality: 'CBCT', desc: 'Cone Beam · zona implante 36', date: '2026-10-02', doctor: 'D-02', size: '296 MB', images: 384, status: 'Visto' },
    { id: 'EST-2026-0391', patient: 'Valentina Ruiz', pid: 'P-1018', age: 27, modality: 'Periapical', desc: 'Serie periapical completa', date: '2026-09-30', doctor: 'D-03', size: '36 MB', images: 14, status: 'Pendiente' },
    { id: 'EST-2026-0385', patient: 'Diego Castro', pid: 'P-1011', age: 9, modality: 'Panorámica', desc: 'Ortopantomografía digital', date: '2026-09-29', doctor: 'D-01', size: '17 MB', images: 1, status: 'Visto' },
    { id: 'EST-2026-0380', patient: 'Lucía Fernández', pid: 'P-1006', age: 52, modality: 'CBCT', desc: 'Cone Beam · seno maxilar', date: '2026-09-27', doctor: 'D-02', size: '402 MB', images: 500, status: 'Sin asignar' }
  ];

  function doctorName(id) {
    const d = DOCTORS.find(function (x) { return x.id === id; });
    return d ? d.name : '—';
  }

  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function statusBadge(s) {
    const map = { 'Nuevo': 'blue', 'Visto': 'green', 'Pendiente': 'amber', 'Sin asignar': 'gray' };
    return '<span class="badge ' + (map[s] || 'gray') + '">' + escapeHtml(s) + '</span>';
  }

  // ---------- Landing ----------
  function initLanding() {
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        const open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); });
      });
    }
    const contact = document.getElementById('contact-form');
    if (contact) {
      contact.addEventListener('submit', function (e) {
        e.preventDefault();
        contact.reset();
        toast('Gracias. Nos pondremos en contacto pronto.');
      });
    }
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  }

  // ---------- Login ----------
  function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    const tabs = document.querySelectorAll('.role-switch button');
    const emailInput = document.getElementById('email');
    const title = document.getElementById('login-title');
    const sub = document.getElementById('login-sub');
    const err = document.getElementById('login-error');
    let role = new URLSearchParams(location.search).get('rol') === 'admin' ? 'admin' : 'doctor';

    const copy = {
      doctor: { title: 'Acceso para médicos', sub: 'Consulte los estudios de sus pacientes.', ph: 'doctor@dentfrucer.com' },
      admin: { title: 'Acceso administrativo', sub: 'Gestione estudios, pacientes y médicos.', ph: 'admin@dentfrucer.com' }
    };

    function setRole(r) {
      role = r;
      tabs.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.role === r ? 'true' : 'false'); });
      title.textContent = copy[r].title;
      sub.textContent = copy[r].sub;
      emailInput.placeholder = copy[r].ph;
      err.classList.remove('show');
    }
    tabs.forEach(function (b) { b.addEventListener('click', function () { setRole(b.dataset.role); }); });
    setRole(role);

    document.getElementById('fill-demo').addEventListener('click', function () {
      emailInput.value = DEMO_USERS[role].email;
      document.getElementById('password').value = 'demo1234';
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = emailInput.value.trim().toLowerCase();
      const pass = document.getElementById('password').value;
      const user = DEMO_USERS[role];
      // Validación simulada: se reemplazará por autenticación real en el servidor.
      if (email !== user.email || pass !== 'demo1234') {
        err.textContent = 'Credenciales incorrectas. Use “Rellenar datos de demostración”.';
        err.classList.add('show');
        return;
      }
      Session.set(user);
      location.href = role === 'admin' ? 'admin.html' : 'portal.html';
    });
  }

  // ---------- Guardas de rol ----------
  function requireRole(role) {
    const s = Session.get();
    if (!s || s.role !== role) {
      location.replace('login.html' + (role === 'admin' ? '?rol=admin' : ''));
      return null;
    }
    document.querySelectorAll('[data-user-name]').forEach(function (el) { el.textContent = s.name; });
    document.querySelectorAll('[data-user-title]').forEach(function (el) { el.textContent = s.title; });
    document.querySelectorAll('[data-user-initials]').forEach(function (el) { el.textContent = initials(s.name); });
    document.querySelectorAll('[data-logout]').forEach(function (el) {
      el.addEventListener('click', function () { Session.clear(); location.href = 'login.html'; });
    });
    return s;
  }

  // ---------- Modal visor (placeholder) ----------
  function viewerMarkup(study) {
    return '' +
      '<div class="viewer-mock">' +
        '<div class="vm-toolbar">' +
          '<span class="vm-tool active" title="Mover">' + icon('move') + '</span>' +
          '<span class="vm-tool" title="Zoom">' + icon('zoom') + '</span>' +
          '<span class="vm-tool" title="Ventana / Nivel">' + icon('contrast') + '</span>' +
          '<span class="vm-tool" title="Medir">' + icon('ruler') + '</span>' +
          '<span class="vm-tool" title="3D">' + icon('cube') + '</span>' +
          '<span class="vm-title">' + escapeHtml(study.id) + ' · ' + escapeHtml(study.modality) + '</span>' +
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
        '<div class="vm-status"><span>' + escapeHtml(study.patient) + ' · ' + escapeHtml(study.pid) + '</span><span>' + study.images + ' imágenes · ' + escapeHtml(study.size) + '</span></div>' +
      '</div>';
  }

  function initModal() {
    const backdrop = document.getElementById('viewer-modal');
    if (!backdrop) return { open: function () {} };
    const body = backdrop.querySelector('.modal-content');
    const title = backdrop.querySelector('.modal-head h3');
    function close() { backdrop.classList.remove('open'); }
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return {
      open: function (study) {
        title.textContent = study.patient + ' — ' + study.desc;
        body.innerHTML = viewerMarkup(study);
        backdrop.classList.add('open');
        backdrop.querySelector('[data-close]').focus();
      }
    };
  }

  // ---------- Panel de administración ----------
  function initAdmin() {
    if (!requireRole('admin')) return;
    const modal = initModal();

    // Estadísticas
    const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-studies', STUDIES.length);
    set('stat-patients', new Set(STUDIES.map(function (s) { return s.pid; })).size);
    set('stat-doctors', DOCTORS.length);
    set('stat-unassigned', STUDIES.filter(function (s) { return s.status === 'Sin asignar'; }).length);

    // Tabla de estudios
    const tbody = document.getElementById('studies-body');
    const search = document.getElementById('admin-search');
    const tabs = document.querySelectorAll('#study-tabs button');
    let filter = 'all';

    function render() {
      const q = (search.value || '').trim().toLowerCase();
      const rows = STUDIES.filter(function (s) {
        if (filter === 'unassigned' && s.status !== 'Sin asignar') return false;
        if (filter === 'cbct' && s.modality !== 'CBCT') return false;
        if (!q) return true;
        return (s.patient + ' ' + s.pid + ' ' + s.id + ' ' + doctorName(s.doctor) + ' ' + s.modality).toLowerCase().indexOf(q) !== -1;
      });
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="empty">No se encontraron estudios.</div></td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (s) {
        const doc = s.status === 'Sin asignar' ? '<span class="badge gray">Sin asignar</span>' : escapeHtml(doctorName(s.doctor));
        return '<tr>' +
          '<td><div class="cell-patient"><span class="avatar">' + initials(s.patient) + '</span><div><strong>' + escapeHtml(s.patient) + '</strong><small>' + escapeHtml(s.pid) + ' · ' + s.age + ' años</small></div></div></td>' +
          '<td><span class="mono">' + escapeHtml(s.id) + '</span></td>' +
          '<td><span class="badge blue">' + escapeHtml(s.modality) + '</span></td>' +
          '<td>' + fmtDate(s.date) + '</td>' +
          '<td>' + doc + '</td>' +
          '<td><span class="mono">' + escapeHtml(s.size) + '</span></td>' +
          '<td><div class="row-actions">' +
            '<button class="icon-btn" title="Ver" data-view="' + s.id + '">' + icon('eye') + '</button>' +
            '<button class="icon-btn" title="Asignar a médico" data-assign="' + s.id + '">' + icon('link') + '</button>' +
            '<button class="icon-btn" title="Eliminar" data-delete="' + s.id + '">' + icon('trash') + '</button>' +
          '</div></td>' +
        '</tr>';
      }).join('');
    }

    tabs.forEach(function (b) {
      b.addEventListener('click', function () {
        filter = b.dataset.filter;
        tabs.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        render();
      });
    });
    search.addEventListener('input', render);
    tbody.addEventListener('click', function (e) {
      const v = e.target.closest('[data-view]');
      const a = e.target.closest('[data-assign]');
      const d = e.target.closest('[data-delete]');
      if (v) modal.open(STUDIES.find(function (s) { return s.id === v.dataset.view; }));
      if (a) toast('Asignación de médicos: disponible al conectar la base de datos.');
      if (d) toast('Eliminación de estudios: disponible al conectar la base de datos.');
    });
    render();

    // Médicos
    const docs = document.getElementById('doctors-body');
    docs.innerHTML = DOCTORS.map(function (d) {
      return '<tr>' +
        '<td><div class="cell-patient"><span class="avatar" style="background:var(--green-600)">' + initials(d.name) + '</span><div><strong>' + escapeHtml(d.name) + '</strong><small>' + escapeHtml(d.email) + '</small></div></div></td>' +
        '<td>' + escapeHtml(d.specialty) + '</td>' +
        '<td>' + d.patients + '</td>' +
        '<td><span class="badge green">Activo</span></td>' +
      '</tr>';
    }).join('');

    // Zona de carga (placeholder)
    const dz = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
    dz.addEventListener('drop', function (e) {
      const n = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files.length : 0;
      toast(n + ' archivo(s) recibidos. La carga se habilitará al conectar el servidor.');
    });
    fileInput.addEventListener('change', function () {
      toast(fileInput.files.length + ' archivo(s) seleccionados. La carga se habilitará al conectar el servidor.');
      fileInput.value = '';
    });

    document.querySelectorAll('[data-soon]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); toast(el.dataset.soon); });
    });
  }

  // ---------- Portal del médico ----------
  function initPortal() {
    const user = requireRole('doctor');
    if (!user) return;
    const modal = initModal();
    // Solo los estudios de pacientes asignados a este médico
    const mine = STUDIES.filter(function (s) { return s.doctor === user.id && s.status !== 'Sin asignar'; });

    const set = function (id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-my-patients', new Set(mine.map(function (s) { return s.pid; })).size);
    set('stat-my-studies', mine.length);
    set('stat-my-new', mine.filter(function (s) { return s.status === 'Nuevo'; }).length);

    const grid = document.getElementById('study-grid');
    const search = document.getElementById('portal-search');
    const mod = document.getElementById('modality-filter');

    function render() {
      const q = (search.value || '').trim().toLowerCase();
      const m = mod.value;
      const rows = mine.filter(function (s) {
        if (m && s.modality !== m) return false;
        return !q || (s.patient + ' ' + s.pid + ' ' + s.desc).toLowerCase().indexOf(q) !== -1;
      });
      if (!rows.length) { grid.innerHTML = '<div class="empty">No hay estudios que coincidan.</div>'; return; }
      grid.innerHTML = rows.map(function (s) {
        const shape = s.modality === 'Panorámica' ? 'pano' : (s.modality === 'CBCT' ? 'axial' : '');
        return '<article class="study-card">' +
          '<div class="study-thumb"><span class="badge blue mod">' + escapeHtml(s.modality) + '</span><div class="vm-shape ' + shape + '"></div></div>' +
          '<div class="study-body">' +
            '<h3>' + escapeHtml(s.patient) + '</h3>' +
            '<div class="meta">' + escapeHtml(s.desc) + '</div>' +
            '<div class="meta">' + fmtDate(s.date) + ' · ' + s.images + ' imágenes · ' + escapeHtml(s.size) + '</div>' +
          '</div>' +
          '<div class="study-foot">' + statusBadge(s.status) +
            '<div class="row-actions">' +
              '<button class="icon-btn" title="Descargar" data-download="' + s.id + '">' + icon('download') + '</button>' +
              '<button class="btn btn-primary btn-sm" data-view="' + s.id + '">' + icon('eye') + ' Abrir</button>' +
            '</div>' +
          '</div>' +
        '</article>';
      }).join('');
    }
    search.addEventListener('input', render);
    mod.addEventListener('change', render);
    grid.addEventListener('click', function (e) {
      const v = e.target.closest('[data-view]');
      const d = e.target.closest('[data-download]');
      if (v) modal.open(mine.find(function (s) { return s.id === v.dataset.view; }));
      if (d) toast('La descarga se habilitará al conectar el servidor.');
    });
    render();

    // Lista de pacientes
    const pBody = document.getElementById('patients-body');
    const byPatient = {};
    mine.forEach(function (s) {
      const p = byPatient[s.pid] || (byPatient[s.pid] = { name: s.patient, pid: s.pid, age: s.age, count: 0, last: s.date });
      p.count++;
      if (s.date > p.last) p.last = s.date;
    });
    pBody.innerHTML = Object.keys(byPatient).map(function (k) {
      const p = byPatient[k];
      return '<tr><td><div class="cell-patient"><span class="avatar">' + initials(p.name) + '</span><div><strong>' + escapeHtml(p.name) + '</strong><small>' + escapeHtml(p.pid) + ' · ' + p.age + ' años</small></div></div></td>' +
        '<td>' + p.count + '</td><td>' + fmtDate(p.last) + '</td></tr>';
    }).join('');

    document.querySelectorAll('[data-soon]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); toast(el.dataset.soon); });
    });
  }

  // ---------- Arranque ----------
  document.addEventListener('DOMContentLoaded', function () {
    renderIcons();
    const page = document.body.dataset.page;
    if (page === 'landing') initLanding();
    if (page === 'login') initLogin();
    if (page === 'admin') initAdmin();
    if (page === 'portal') initPortal();
  });
})();
