// Panel de administración. Cada sección vive en su propio módulo:
//   dashboard.js resumen: ingresos, medios de pago, exámenes y citas por período
//   agenda.js    citas: lista, calendario, alta, edición, estado y borrado
//   calendar.js  calendario de la agenda (semana y mes)
//   studies.js   exámenes agrupados por visita (paciente + médicos + fecha)
//   explorer.js  explorador: médico → paciente → visita → exámenes y archivos
//   upload.js    carga de exámenes (paciente + médicos + fecha + archivos)
//   people.js    pacientes (alta, edición, sus visitas) y médicos
//   payments.js  cobros: registro, edición y lista con filtros
//   schedule.js  servicios (precios) y horario de la agenda en línea
//   users.js     cuentas de administración y sus permisos (administrador general)
//   account.js   mi cuenta: correo y nombre de la cuenta en sesión
//
// Todas comparten el mismo estado y se vuelven a dibujar con ctx.reload().
// El menú lateral muestra una sección a la vez (views.js) y solo las que
// permite la cuenta (services/permissions.js); las reglas de Firestore aplican
// los mismos permisos.

import { backend } from '../../services/backend.js';
import { can, canRead, SECTION_PERMISSION } from '../../services/permissions.js';
import { applySettings } from '../../services/settings.js';
import { setText, toast } from '../../ui/dom.js';
import { today } from '../../ui/format.js';
import { requireRole } from '../session.js';
import { initTwoFactor } from '../two-factor.js';
import { initViews } from '../views.js';
import { createAccount } from './account.js';
import { createAgenda } from './agenda.js';
import { createDashboard } from './dashboard.js';
import { createExplorer } from './explorer.js';
import { createPayments } from './payments.js';
import { createPeople } from './people.js';
import { createSchedule } from './schedule.js';
import { createStudies } from './studies.js';
import { createUpload } from './upload.js';
import { createUsers } from './users.js';

export async function init() {
  const user = await requireRole('admin');
  if (!user) return;
  createAccount(user);
  initTwoFactor({ banner: document.getElementById('mfa-banner') });
  applySettings(await backend.getAgendaSettings());

  const allowed = (p) => can(user, p);
  const state = { studies: [], patients: [], doctors: [], appointments: [], payments: [], admins: [] };
  const ctx = {
    state,
    user,
    can: allowed,
    canRead: (data) => canRead(user, data),
    reload: load,
    go: (view) => views.go(view),
    doctorName: (id) => (state.doctors.find((d) => d.id === id) || {}).name,
    patientById: (id) => state.patients.find((p) => p.id === id)
  };

  ctx.explorer = createExplorer(ctx);
  const upload = createUpload(ctx);
  ctx.startUploadFor = (appt) => upload.startFor(appt);
  const payments = createPayments(ctx);
  ctx.openPayment = (preset) => payments.open(preset);
  const sections = [createDashboard(ctx), createAgenda(ctx), createStudies(ctx), upload, createPeople(ctx), payments, createSchedule(ctx), createUsers(ctx)];

  // Solo lo permitido: se quitan del menú y de la página las secciones y los
  // botones sin permiso (los módulos ya tomaron sus elementos y no fallan).
  const sectionAllowed = (name) => allowed(SECTION_PERMISSION[name] || '*');
  document.querySelectorAll('[data-section]').forEach((el) => { if (!sectionAllowed(el.dataset.section)) el.remove(); });
  document.querySelectorAll('.side-nav a[href^="#"]').forEach((a) => { if (!sectionAllowed(a.getAttribute('href').slice(1))) a.remove(); });
  document.querySelectorAll('.side-nav .label').forEach((label) => {
    const next = label.nextElementSibling;
    if (!next || next.classList.contains('label')) label.remove();
  });
  document.querySelectorAll('[data-perm]').forEach((el) => { if (!allowed(el.dataset.perm)) el.remove(); });

  const first = Object.keys(SECTION_PERMISSION).find(sectionAllowed);
  if (!first) {
    document.querySelector('.main').innerHTML = '<div class="empty" style="margin-top:80px"><h2>Su cuenta no tiene permisos</h2><p>Pida al administrador general que le asigne las secciones que necesita.</p></div>';
    return;
  }
  const views = initViews({ fallback: allowed('agenda') ? 'agenda' : first, title: document.getElementById('view-title'), subtitle: document.getElementById('view-desc') });

  // Solo se cargan los datos que la cuenta puede leer (DATA_ACCESS).
  async function load() {
    const when = (data, fn) => (ctx.canRead(data) ? fn() : []);
    try {
      const [studies, patients, doctors, appointments, pays, admins] = await Promise.all([
        when('studies', backend.listStudies), when('patients', backend.listPatients), backend.listDoctors(),
        when('appointments', backend.listAppointments), when('payments', backend.listPayments),
        allowed('*') ? backend.listAdmins() : []
      ]);
      Object.assign(state, { studies, patients, doctors, appointments, payments: pays, admins });
    } catch (e) {
      toast('No se pudieron cargar los datos: ' + e.message);
    }
    render();
  }

  function render() {
    setText('stat-today', state.appointments.filter((a) => a.date === today() && a.status !== 'Cancelada').length);
    setText('stat-studies', state.studies.length);
    setText('stat-patients', state.patients.length);
    setText('stat-doctors', state.doctors.length);
    setText('stat-unassigned', state.studies.filter((s) => !s.doctorIds.length).length);
    // Un error en una sección no impide dibujar las demás.
    sections.forEach((s) => { try { s.render(); } catch (e) { console.error(e); } });
    ctx.explorer.refresh();
  }

  await load();
}
