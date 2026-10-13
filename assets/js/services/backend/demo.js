// Backend de demostración: datos de ejemplo, sin Firebase. Misma interfaz que
// firebase.js. Los cambios (citas, pacientes, exámenes) se guardan en la
// sesión del navegador, para poder pasar de agendar.html al panel y ver lo
// agendado; al cerrar la pestaña se vuelve a los datos de ejemplo.

import { isoDate, agendaPatientId, APPOINTMENT_STATUSES, appointmentCode, isActive, normalizeBooking, slotId, SlotTakenError } from '../agenda.js';
import { normalizeAccountName, normalizePatient } from '../people.js';
import { agendaPatient, appointmentFields, byDateDesc, byDateTime, byName, cleanFileName, sizeOf, studyEdits, studyPatientFields } from './shared.js';

const SESSION_KEY = 'dentfrucer.demo.session';
const DB_KEY = 'dentfrucer.demo.db.v2'; // cambia la versión si cambian los datos de ejemplo
const MB = 1024 * 1024;

const USERS = {
  'admin@dentfrucer.com': { uid: 'admin', name: 'Administración', role: 'admin', specialty: '' },
  'doctor@dentfrucer.com': { uid: 'D-01', name: 'Dra. Laura Méndez', role: 'doctor', specialty: 'Ortodoncia' }
};

// --- Datos de ejemplo ---------------------------------------------------------------
function seed() {
  const doctors = [
    { id: 'D-01', name: 'Dra. Laura Méndez', specialty: 'Ortodoncia', email: 'doctor@dentfrucer.com' },
    { id: 'D-02', name: 'Dr. Carlos Rivas', specialty: 'Implantología', email: 'crivas@clinica.com' },
    { id: 'D-03', name: 'Dra. Ana Torres', specialty: 'Endodoncia', email: 'atorres@clinica.com' }
  ];
  const person = (id, firstName, lastName, extra = {}) => ({ id, firstName, lastName, name: firstName + ' ' + lastName, email: '', phone: '', code: '', age: null, ...extra });
  const patients = [
    person('p1', 'Martina', 'Gómez', { code: 'P-1042', age: 14 }),
    person('p2', 'Julián', 'Pérez', { code: 'P-1037', age: 11 }),
    person('p3', 'Sofía', 'Herrera', { code: 'P-1029', age: 32 }),
    person('p4', 'Tomás', 'Aguilar', { code: 'P-1021', age: 45 }),
    person('p5', 'Valentina', 'Ruiz', { code: 'P-1018', age: 27 }),
    person('p6', 'Diego', 'Castro', { code: 'P-1011', age: 9 }),
    person('p7', 'Lucía', 'Fernández', { code: 'P-1006', age: 52 }),
    person('ag_demo1', 'Andrés', 'Molina', { email: 'amolina@correo.com', source: 'agenda' }),
    person('ag_demo2', 'Camila', 'Rojas', { phone: '300 555 0192', source: 'agenda' })
  ];
  const patient = (id) => patients.find((p) => p.id === id);
  const study = (id, pid, doctorId, modality, description, date, mb, images, status, names) => ({
    id, code: id, patientId: pid, ...studyPatientFields(patient(pid)), doctorId,
    modality, description, date, status, totalSize: mb * MB,
    files: Array.from({ length: Math.min(images, 3) }, (_, i) => ({ name: names ? names[i] : 'IMG' + String(i + 1).padStart(4, '0') + '.dcm', path: 'demo/' + id + '/' + i, size: (mb * MB) / images }))
  });
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  const appointment = (id, pid, exam, date, time, referrer) => {
    const p = patient(pid);
    return {
      id, code: appointmentCode(id), ...appointmentFields({ ...p, referrer, exam, date, time }),
      slotId: slotId(date, time), patientId: pid
    };
  };
  return {
    doctors,
    patients,
    studies: [
      study('EST-2026-0418', 'p1', 'D-01', 'CBCT', 'Tomografía Cone Beam · maxilar completo', '2026-10-08', 412, 512, 'Nuevo'),
      study('EST-2026-0415', 'p1', 'D-01', 'Panorámica', 'Ortopantomografía digital', '2026-10-08', 18, 1, 'Visto'),
      study('EST-2026-0416', 'p1', 'D-01', 'Informe', 'Informe radiológico', '2026-10-08', 0.2, 1, 'Nuevo', ['Informe EST-2026-0418.pdf']),
      study('EST-2026-0310', 'p1', 'D-02', 'Periapical', 'Control periapical 21', '2026-06-15', 4, 2, 'Visto'),
      study('EST-2026-0409', 'p2', 'D-01', 'Cefalometría', 'Telerradiografía lateral de cráneo', '2026-10-06', 22, 1, 'Visto'),
      study('EST-2026-0402', 'p3', 'D-01', 'CBCT', 'Cone Beam · ATM bilateral', '2026-10-03', 388, 480, 'Nuevo'),
      study('EST-2026-0397', 'p4', 'D-02', 'CBCT', 'Cone Beam · zona implante 36', '2026-10-02', 296, 384, 'Visto'),
      study('EST-2026-0391', 'p5', 'D-03', 'Periapical', 'Serie periapical completa', '2026-09-30', 36, 14, 'Nuevo'),
      study('EST-2026-0385', 'p6', 'D-01', 'Panorámica', 'Ortopantomografía digital', '2026-09-29', 17, 1, 'Visto'),
      study('EST-2026-0380', 'p7', 'D-02', 'CBCT', 'Cone Beam · seno maxilar', '2026-09-27', 402, 500, 'Visto')
    ],
    appointments: [
      appointment('demoa1', 'ag_demo1', 'Panorámica', day(0), '10:20', 'Dra. Laura Méndez'),
      appointment('demoa2', 'ag_demo2', 'CBCT', day(0), '11:00', 'Dr. Carlos Rivas'),
      appointment('demoa3', 'p2', 'Cefalometría', day(1), '09:00', 'Dra. Laura Méndez')
    ]
  };
}

export function createDemoBackend() {
  const store = (() => { try { return JSON.parse(sessionStorage.getItem(DB_KEY)); } catch (e) { return null; } })() || seed();
  const { doctors, patients, studies, appointments } = store;
  const save = () => { try { sessionStorage.setItem(DB_KEY, JSON.stringify(store)); } catch (e) { /* modo privado */ } };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const newId = (prefix) => prefix + Math.random().toString(36).slice(2, 12);
  const fail = (result) => { if (result.error) throw new Error(result.error); return result.data; };
  const slotTaken = (sid, exceptId) => appointments.some((a) => a.slotId === sid && isActive(a) && a.id !== exceptId);
  const session = {
    read: () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } },
    write: (v) => { try { v ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)) : sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* modo privado */ } }
  };

  return {
    mode: 'demo',

    // --- Sesión -----------------------------------------------------------------
    async currentUser() { return session.read(); },
    async signIn(email, password) {
      await wait(250);
      const key = email.trim().toLowerCase();
      const u = USERS[key];
      if (!u || password !== 'demo1234') throw new Error('Correo o contraseña incorrectos.');
      const name = (store.accountNames || {})[key] || u.name;
      const profile = { ...u, name, email: key, title: u.role === 'admin' ? 'Administrador' : u.specialty };
      session.write(profile);
      return profile;
    },
    async signOut() { session.write(null); },
    async updateMyName(input) {
      const { data: name, error } = normalizeAccountName(input);
      if (error) throw new Error(error);
      const me = session.read();
      if (!me) throw new Error('La sesión expiró. Vuelva a ingresar.');
      store.accountNames = { ...store.accountNames, [me.email]: name };
      save();
      const profile = { ...me, name };
      session.write(profile);
      return profile;
    },
    async resetPassword() { await wait(200); },

    // --- Médicos ----------------------------------------------------------------
    async listDoctors() { return doctors.slice().sort(byName); },
    async createDoctor({ name, email, specialty }) {
      const id = 'D-' + String(doctors.length + 1).padStart(2, '0');
      doctors.push({ id, name, email, specialty });
      save();
      return id;
    },

    // --- Pacientes -----------------------------------------------------------------
    async listPatients() { return patients.slice().sort(byName); },
    async createPatient(input) {
      const id = newId('p');
      patients.push({ id, ...fail(normalizePatient(input)), source: 'panel' });
      save();
      return id;
    },
    async updatePatient(id, input) {
      const data = fail(normalizePatient(input));
      Object.assign(patients.find((p) => p.id === id), data);
      studies.filter((s) => s.patientId === id).forEach((s) => Object.assign(s, studyPatientFields(data)));
      save();
    },

    // --- Exámenes ----------------------------------------------------------------
    async listStudies({ doctorId } = {}) {
      return studies.filter((s) => !doctorId || s.doctorId === doctorId).sort(byDateDesc);
    },
    async uploadStudy({ patient, doctorId, modality, description, date, files, onProgress }) {
      for (let i = 1; i <= 10; i++) { await wait(80); if (onProgress) onProgress(i / 10); }
      const id = 'EST-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
      studies.push({
        id, code: id, patientId: patient.id, ...studyPatientFields(patient), doctorId: doctorId || null,
        modality, description, date, status: 'Nuevo',
        files: files.map((f) => ({ name: f.name, path: 'demo/' + newId('f'), size: f.size })), totalSize: sizeOf(files)
      });
      save();
      return id;
    },
    async setStudyDoctor(studyId, doctorId) { studies.find((s) => s.id === studyId).doctorId = doctorId || null; save(); },
    async updateStudy(study, changes) { Object.assign(studies.find((s) => s.id === study.id), studyEdits(changes)); save(); },
    // Archivos de demostración: solo nombre y tamaño (no hay nada que descargar).
    async addStudyFiles(study, files, onProgress) {
      for (let i = 1; i <= 5; i++) { await wait(60); if (onProgress) onProgress(i / 5); }
      const s = studies.find((x) => x.id === study.id);
      s.files = [...s.files, ...files.map((f) => ({ name: f.name, path: 'demo/' + newId('f'), size: f.size }))];
      s.totalSize = sizeOf(s.files);
      save();
      return s.files;
    },
    async renameStudyFile(study, path, name) {
      const s = studies.find((x) => x.id === study.id);
      s.files = s.files.map((f) => (f.path === path ? { ...f, name: cleanFileName(name) } : f));
      save();
      return s.files;
    },
    async deleteStudyFile(study, path) {
      const s = studies.find((x) => x.id === study.id);
      s.files = s.files.filter((f) => f.path !== path);
      s.totalSize = sizeOf(s.files);
      save();
      return s.files;
    },
    fileUrl: async () => null,
    async deleteStudy(study) { studies.splice(studies.findIndex((s) => s.id === study.id), 1); save(); },
    async markSeen(studyId) { const s = studies.find((x) => x.id === studyId); if (s) s.status = 'Visto'; save(); },
    async fileUrls() { return []; },

    // --- Agenda: público -----------------------------------------------------------
    async listBusySlots(from, to) {
      return new Set(appointments.filter((a) => isActive(a) && a.date >= from && a.date <= to).map((a) => a.slotId));
    },
    async bookAppointment(input) {
      await wait(400);
      const data = fail(normalizeBooking(input));
      const id = newId('d');
      await this.createAppointment(data, { id });
      return appointments.find((a) => a.id === id);
    },

    // --- Agenda: administración ------------------------------------------------------
    async listAppointments() { return appointments.map((a) => ({ ...a })).sort(byDateTime); },
    async createAppointment(input, { patientId, id = newId('d') } = {}) {
      const data = fail(normalizeBooking(input));
      const sid = slotId(data.date, data.time);
      if (slotTaken(sid)) throw new SlotTakenError();
      const pid = patientId || await agendaPatientId(data, id);
      if (!patients.some((p) => p.id === pid)) patients.push({ id: pid, ...agendaPatient(data) });
      appointments.push({ id, code: appointmentCode(id), ...appointmentFields({ ...data, status: input.status }), slotId: sid, patientId: pid });
      save();
      return id;
    },
    async updateAppointment(prev, changes) {
      const next = { ...prev, ...changes };
      const data = fail(normalizeBooking(next));
      if (!APPOINTMENT_STATUSES.includes(next.status)) throw new Error('Estado de cita no válido.');
      const sid = slotId(data.date, data.time);
      if (isActive(next) && slotTaken(sid, prev.id)) throw new SlotTakenError();
      Object.assign(appointments.find((a) => a.id === prev.id), appointmentFields({ ...data, status: next.status }), { slotId: sid });
      save();
    },
    async deleteAppointment(appt) { appointments.splice(appointments.findIndex((a) => a.id === appt.id), 1); save(); },

    // --- Resultados para pacientes ------------------------------------------------------
    // En demostración el "token" es el código del examen de ejemplo.
    async getSharedStudy(token) {
      await wait(300);
      const study = studies.find((s) => s.id === token);
      if (!study) throw new Error('El enlace no es válido o ya caducó.');
      return { study: { ...study }, files: [] };
    }
  };
}
