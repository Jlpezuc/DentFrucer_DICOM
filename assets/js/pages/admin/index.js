// Panel de administración. Cada sección vive en su propio módulo:
//   agenda.js    citas: lista, alta, edición, cambio de estado y borrado
//   studies.js   estudios: lista, médico de cada estudio, ver, archivos, borrar
//   upload.js    carga de un estudio (paciente + médico + archivos)
//   people.js    pacientes (alta y edición) y médicos
//
// Todas comparten el mismo estado y se vuelven a dibujar con ctx.reload().

import { backend } from '../../services/backend.js';
import { setText, toast } from '../../ui/dom.js';
import { today } from '../../ui/format.js';
import { requireRole } from '../session.js';
import { createAgenda } from './agenda.js';
import { createPeople } from './people.js';
import { createStudies } from './studies.js';
import { createUpload } from './upload.js';

export async function init() {
  if (!(await requireRole('admin'))) return;

  const state = { studies: [], patients: [], doctors: [], appointments: [] };
  const ctx = {
    state,
    reload: load,
    doctorName: (id) => (state.doctors.find((d) => d.id === id) || {}).name,
    patientById: (id) => state.patients.find((p) => p.id === id)
  };

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
