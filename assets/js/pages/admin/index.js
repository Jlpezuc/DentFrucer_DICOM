// Panel de administración. Cada sección vive en su propio módulo:
//   agenda.js    citas: lista, alta, edición, cambio de estado y borrado
//   studies.js   exámenes agrupados (paciente + médico + fecha) con búsqueda
//   explorer.js  explorador: médico → paciente → grupo → exámenes y archivos
//   upload.js    carga de exámenes (paciente + médico + fecha + archivos)
//   people.js    pacientes (alta, edición, sus visitas) y médicos
//   account.js   mi cuenta: correo y nombre del administrador en sesión
//
// Todas comparten el mismo estado y se vuelven a dibujar con ctx.reload().
// El menú lateral muestra una sección a la vez (views.js): #agenda, #examenes,
// #carga, #pacientes, #medicos.

import { backend } from '../../services/backend.js';
import { setText, toast } from '../../ui/dom.js';
import { today } from '../../ui/format.js';
import { requireRole } from '../session.js';
import { initViews } from '../views.js';
import { createAccount } from './account.js';
import { createAgenda } from './agenda.js';
import { createExplorer } from './explorer.js';
import { createPeople } from './people.js';
import { createStudies } from './studies.js';
import { createUpload } from './upload.js';

export async function init() {
  const user = await requireRole('admin');
  if (!user) return;
  createAccount(user);

  const views = initViews({ fallback: 'agenda', title: document.getElementById('view-title'), subtitle: document.getElementById('view-desc') });
  const state = { studies: [], patients: [], doctors: [], appointments: [] };
  const ctx = {
    state,
    reload: load,
    go: (view) => views.go(view),
    doctorName: (id) => (state.doctors.find((d) => d.id === id) || {}).name,
    patientById: (id) => state.patients.find((p) => p.id === id)
  };

  ctx.explorer = createExplorer(ctx);
  const upload = createUpload(ctx);
  ctx.startUploadFor = (appt) => upload.startFor(appt);
  const sections = [createAgenda(ctx), createStudies(ctx), upload, createPeople(ctx)];

  async function load() {
    try {
      const [studies, patients, doctors, appointments] = await Promise.all([
        backend.listStudies(), backend.listPatients(), backend.listDoctors(), backend.listAppointments()
      ]);
      Object.assign(state, { studies, patients, doctors, appointments });
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
    setText('stat-unassigned', state.studies.filter((s) => !s.doctorId).length);
    sections.forEach((s) => s.render());
  }

  await load();
}
