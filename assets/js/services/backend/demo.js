// Backend de demostración: datos de ejemplo, sin Firebase. Misma interfaz que
// firebase.js. Los cambios (citas, pacientes, exámenes) se guardan en la
// sesión del navegador, para poder pasar de agendar.html al panel y ver lo
// agendado; al cerrar la pestaña se vuelve a los datos de ejemplo.

import { isoDate, agendaPatientId, APPOINTMENT_STATUSES, appointmentCode, isActive, normalizeBooking, slotId, SlotTakenError } from '../agenda.js';
import { doctorsOf } from '../groups.js';
import { normalizePayment } from '../payments.js';
import { normalizeAccountName, normalizePatient } from '../people.js';
import { currentSettings, studyServiceName, toStored, validateSettings } from '../settings.js';
import {
  agendaPatient, appointmentFields, byDateDesc, byDateTime, byName, cleanFileName, normalizeAdmin, passwordProblem, sizeOf, studyDoctors, studyEdits,
  studyPatientFields, studyServiceFields, TwoFactorRequiredError, withDoctors
} from './shared.js';
import { otpauthUri, randomSecret, verifyTotp } from './totp.js';

const SESSION_KEY = 'dentfrucer.demo.session';
const DB_KEY = 'dentfrucer.demo.db.v6'; // cambia la versión si cambian los datos de ejemplo
const MB = 1024 * 1024;
const PASSWORD = 'demo1234';

// Médico de ejemplo (las cuentas de administración están en los datos: store.admins).
const DOCTOR_LOGIN = { 'doctor@dentfrucer.com': { uid: 'D-01', name: 'Dra. Laura Méndez', role: 'doctor', specialty: 'Ortodoncia' } };
// Precios de ejemplo de los servicios.
const DEMO_PRICES = { CBCT: 65000, 'Panorámica': 18000, 'Cefalometría': 15000, Periapical: 8000, Otro: 10000 };
// Maquinitas de ejemplo (Mercado Pago Point simulado).
const DEMO_TERMINALS = [
  { id: 'NEWLAND_N950__DEMO0001', operatingMode: 'PDV' },
  { id: 'NEWLAND_N950__DEMO0002', operatingMode: 'STANDALONE' }
];

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
  const settings = currentSettings();
  settings.exams.forEach((e) => { e.price = DEMO_PRICES[e.id] || 0; });
  const labelOf = (id) => (settings.exams.find((e) => e.id === id) || { label: id }).label;
  // Examen de ejemplo: hasta 3 imágenes y, si report, su informe PDF.
  const study = (id, pid, doctorIds, serviceId, description, date, mb, images, status, report = false) => {
    const files = Array.from({ length: Math.min(images, 3) }, (_, i) => ({ name: 'IMG' + String(i + 1).padStart(4, '0') + '.dcm', path: 'demo/' + id + '/' + i, size: (mb * MB) / images }));
    if (report) files.push({ name: 'Informe ' + id + '.pdf', path: 'demo/' + id + '/informe', size: 0.2 * MB });
    return {
      id, code: id, patientId: pid, ...studyPatientFields(patient(pid)), ...studyDoctors([].concat(doctorIds)),
      serviceId, service: labelOf(serviceId), description, date, status, totalSize: mb * MB + (report ? 0.2 * MB : 0), files
    };
  };
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  const appointment = (id, pid, exam, date, time, referrer, status) => {
    const p = patient(pid);
    return {
      id, code: appointmentCode(id), ...appointmentFields({ ...p, referrer, exam, date, time, status }),
      slotId: slotId(date, time), patientId: pid
    };
  };
  const studies = [
    study('EST-2026-0418', 'p1', 'D-01', 'CBCT', 'Maxilar completo', day(-6), 412, 512, 'Nuevo', true),
    study('EST-2026-0415', 'p1', 'D-01', 'Panorámica', '', day(-6), 18, 1, 'Visto'),
    study('EST-2026-0310', 'p1', 'D-02', 'Periapical', 'Control pieza 21', day(-121), 4, 2, 'Visto', true),
    study('EST-2026-0409', 'p2', 'D-01', 'Cefalometría', 'Lateral de cráneo', day(-8), 22, 1, 'Visto', true),
    study('EST-2026-0402', 'p3', ['D-01', 'D-03'], 'CBCT', 'ATM bilateral', day(-11), 388, 480, 'Nuevo'),
    study('EST-2026-0397', 'p4', 'D-02', 'CBCT', 'Zona implante 36', day(-12), 296, 384, 'Visto'),
    study('EST-2026-0391', 'p5', 'D-03', 'Periapical', 'Serie completa', day(-14), 36, 14, 'Nuevo'),
    study('EST-2026-0385', 'p6', 'D-01', 'Panorámica', '', day(-15), 17, 1, 'Visto', true),
    study('EST-2026-0380', 'p7', 'D-02', 'CBCT', 'Seno maxilar', day(-17), 402, 500, 'Visto'),
    study('EST-2026-0371', 'p2', 'D-01', 'Panorámica', '', day(-24), 17, 1, 'Visto', true),
    study('EST-2026-0364', 'p5', 'D-02', 'CBCT', 'Zona implante 46', day(-31), 301, 390, 'Visto', true),
    study('EST-2026-0358', 'p3', 'D-03', 'Periapical', 'Pieza 36', day(-38), 3, 1, 'Visto', true),
    study('EST-2026-0352', 'p7', 'D-01', 'Cefalometría', 'Lateral de cráneo', day(-45), 21, 1, 'Visto', true),
    study('EST-2026-0347', 'p4', 'D-02', 'Panorámica', '', day(-52), 18, 1, 'Visto', true),
    study('EST-2026-0341', 'p6', 'D-01', 'Otro', 'Fotografías clínicas', day(-60), 9, 6, 'Visto')
  ];

  // Cobros de ejemplo: uno por visita (paciente + día), con los precios de ejemplo.
  const methods = ['Débito', 'Crédito', 'Efectivo', 'Transferencia', 'Débito', 'Convenio', 'Crédito'];
  const docFor = (m) => (m === 'Débito' || m === 'Crédito' ? 'Voucher (boleta)' : m === 'Convenio' ? 'Factura' : 'Boleta');
  const visits = new Map();
  studies.forEach((x) => {
    const k = x.patientId + '|' + x.date;
    if (!visits.has(k)) visits.set(k, []);
    visits.get(k).push(x);
  });
  const payments = [...visits.values()].map((list, i) => {
    const method = methods[i % methods.length];
    const items = list.map((x) => ({ serviceId: x.serviceId, label: labelOf(x.serviceId), price: DEMO_PRICES[x.serviceId] || 0 }));
    const total = items.reduce((n, it) => n + it.price, 0);
    list.forEach((x) => { x.paid = true; }); // la visita cobrada queda pagada
    return { id: 'pay' + (i + 1), date: list[0].date, patientId: list[0].patientId, patientName: list[0].patientName, appointmentId: null, studyIds: list.map((x) => x.id), items, discount: 0, total, method, docType: docFor(method), docNumber: String(48210 + i), note: '' };
  }).filter((x, i) => i % 6 !== 5); // algunas visitas quedan por cobrar
  studies.forEach((x) => { if (!payments.some((p) => p.studyIds.includes(x.id))) x.paid = false; });
  payments.push({ id: 'pay-today', date: day(0), patientId: 'p3', patientName: 'Sofía Herrera', appointmentId: 'demoa4', studyIds: [], items: [{ serviceId: 'Periapical', label: 'Radiografías intraorales', price: 8000 }], discount: 0, total: 8000, method: 'Débito', docType: 'Voucher (boleta)', docNumber: '48290', note: '' });

  // Cuentas de administración: la general, una secretaria y un tecnólogo con permisos limitados.
  const all = { resumen: true, agenda: true, examenes: true, pacientes: true, medicos: true, cobros: true, config: true };
  const admins = [
    { uid: 'admin', email: 'admin@dentfrucer.com', name: 'Administración', description: 'Dirección', superadmin: true, permissions: all },
    { uid: 'adm-sec', email: 'secretaria@dentfrucer.com', name: 'Paula Soto', description: 'Secretaria', superadmin: false,
      permissions: { ...all, resumen: false, examenes: false, medicos: false, config: false } },
    { uid: 'adm-tec', email: 'tecnologo@dentfrucer.com', name: 'Matías Rojas', description: 'Tecnólogo médico', superadmin: false,
      permissions: { ...all, resumen: false, medicos: false, cobros: false, config: false } }
  ];

  return {
    doctors,
    patients,
    studies,
    payments,
    admins,
    settings: toStored(settings),
    point: { terminalId: DEMO_TERMINALS[0].id },
    appointments: [
      appointment('demoa1', 'ag_demo1', 'Panorámica', day(0), '10:20', 'Dra. Laura Méndez'),
      appointment('demoa2', 'ag_demo2', 'CBCT', day(0), '11:00', 'Dr. Carlos Rivas'),
      appointment('demoa3', 'p2', 'Cefalometría', day(1), '09:00', 'Dra. Laura Méndez'),
      appointment('demoa4', 'p3', 'Periapical', day(0), '09:20', 'Dra. Ana Torres', 'Atendida'),
      appointment('demoa5', 'p4', 'CBCT', day(1), '15:40', 'Dr. Carlos Rivas'),
      appointment('demoa6', 'p5', 'Panorámica', day(2), '10:00', ''),
      appointment('demoa7', 'p6', 'Panorámica', day(2), '16:20', 'Dra. Laura Méndez', 'Cancelada'),
      appointment('demoa8', 'p7', 'CBCT', day(3), '11:40', 'Dr. Carlos Rivas'),
      appointment('demoa9', 'p1', 'Otro', day(-1), '12:00', 'Dra. Laura Méndez', 'No asistió'),
      appointment('demoa10', 'p4', 'Cefalometría', day(6), '09:40', '')
    ]
  };
}

export function createDemoBackend() {
  const store = (() => { try { return JSON.parse(sessionStorage.getItem(DB_KEY)); } catch (e) { return null; } })() || seed();
  const { doctors, patients, studies, appointments, payments, admins } = store;
  const save = () => { try { sessionStorage.setItem(DB_KEY, JSON.stringify(store)); } catch (e) { /* modo privado */ } };
  // Examen modificado por la clínica: queda la fecha del cambio (orden dentro del grupo).
  const edited = (id) => { const s = studies.find((x) => x.id === id); s.updatedAt = Date.now(); return s; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const newId = (prefix) => prefix + Math.random().toString(36).slice(2, 12);
  const fail = (result) => { if (result.error) throw new Error(result.error); return result.data; };

  let pendingLogin = null;   // ingreso que espera el código de dos pasos
  let pendingSecret = null;  // clave en preparación al activar los dos pasos

  // Maquinita simulada: el estado del cobro sigue al de la "orden" como en functions/src/point.js.
  const watchers = new Map();
  const notify = (id) => {
    const p = payments.find((x) => x.id === id);
    (watchers.get(id) || []).forEach((cb) => cb(p ? JSON.parse(JSON.stringify(p)) : null));
  };
  function setOrder(p, orderStatus, type = 'debit_card') {
    p.mp = { ...p.mp, status: orderStatus };
    if (orderStatus === 'processed') {
      Object.assign(p, { status: 'paid', method: type === 'credit_card' ? 'Crédito' : 'Débito' });
      Object.assign(p.mp, { paymentType: type, paymentMethod: type === 'credit_card' ? 'visa' : 'debvisa', paymentId: newId('PAY') });
      studies.filter((s) => p.studyIds.includes(s.id)).forEach((s) => { s.paid = true; });
    } else if (['canceled', 'expired', 'failed'].includes(orderStatus)) {
      p.status = orderStatus;
      if (orderStatus === 'failed') p.mp.error = 'Pago rechazado por el banco (simulación).';
    }
    save();
    notify(p.id);
  }
  function tick(p) {
    if (p.status !== 'pending' || !p.mp) return;
    const t = Date.now() - p.mp.sentAt;
    if (t >= 8000) setOrder(p, 'processed');
    else if (t >= 2000 && p.mp.status === 'created') setOrder(p, 'at_terminal');
  }
  function sendToTerminal(p) {
    p.status = 'pending';
    p.mp = { orderId: newId('ORD'), attempt: ((p.mp && p.mp.attempt) || 0) + 1, terminalId: store.point.terminalId, status: 'created', sentAt: Date.now() };
    save();
    notify(p.id);
    [2050, 8050].forEach((ms) => setTimeout(() => tick(p), ms));
  }
  const slotTaken = (sid, exceptId) => appointments.some((a) => a.slotId === sid && isActive(a) && a.id !== exceptId);
  const session = {
    read: () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } },
    write: (v) => { try { v ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)) : sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* modo privado */ } }
  };
  // Perfil como el de Firebase (null si la cuenta está desactivada).
  function profileOf(email) {
    const a = admins.find((x) => x.email === email);
    if (a) {
      if (a.disabled) return null;
      return { uid: a.uid, email, name: a.name, role: 'admin', specialty: '', description: a.description || '', superadmin: a.superadmin === true, permissions: a.permissions, title: a.description || 'Administrador' };
    }
    const d = DOCTOR_LOGIN[email];
    if (!d) return null;
    return { ...d, email, name: (store.accountNames || {})[email] || d.name, description: '', superadmin: false, permissions: null, title: d.specialty };
  }

  return {
    mode: 'demo',

    // --- Sesión -----------------------------------------------------------------
    // La sesión guarda el correo; el perfil se lee de los datos, así los cambios
    // de permisos se ven al recargar, como en Firebase.
    async currentUser() {
      const s = session.read();
      return s ? profileOf(s.email) : null;
    },
    async signIn(email, password) {
      await wait(250);
      const key = email.trim().toLowerCase();
      const known = admins.some((a) => a.email === key) || DOCTOR_LOGIN[key];
      if (!known || password !== PASSWORD) throw new Error('Correo o contraseña incorrectos.');
      const profile = profileOf(key);
      if (!profile) throw new Error('Su cuenta no tiene acceso (sin perfil o desactivada). Contacte al administrador de DentFrucer.');
      if ((store.mfa || {})[key]) { pendingLogin = key; throw new TwoFactorRequiredError(); }
      session.write({ email: key });
      return profile;
    },
    async completeTwoFactor(code) {
      await wait(200);
      const key = pendingLogin || (session.read() || {}).email;
      if (!key) throw new Error('Vuelva a ingresar su correo y contraseña.');
      if (!(await verifyTotp(store.mfa[key], code))) throw new Error('El código no es correcto o ya venció. Use el código que muestra ahora su app.');
      pendingLogin = null;
      session.write({ email: key });
      return profileOf(key);
    },
    async signOut() { session.write(null); },

    // --- Verificación en dos pasos (simulada con una app de autenticación real) ----------
    async twoFactorStatus() {
      const me = session.read();
      if (!me) throw new Error('La sesión expiró. Vuelva a ingresar.');
      return { enrolled: !!(store.mfa || {})[me.email], emailVerified: true, email: me.email };
    },
    async confirmPassword(password) {
      await wait(200);
      if (password !== PASSWORD) throw new Error('Correo o contraseña incorrectos.');
    },
    async sendVerificationEmail() {},
    async emailVerifiedNow() { return true; },
    async startTwoFactor() {
      pendingSecret = randomSecret();
      return { secretKey: pendingSecret, uri: otpauthUri(pendingSecret, session.read().email) };
    },
    async finishTwoFactor(code) {
      if (!pendingSecret || !(await verifyTotp(pendingSecret, code))) throw new Error('El código no es correcto o ya venció. Use el código que muestra ahora su app.');
      store.mfa = { ...store.mfa, [session.read().email]: pendingSecret };
      pendingSecret = null;
      save();
    },
    async disableTwoFactor() {
      const mfa = { ...store.mfa };
      delete mfa[session.read().email];
      store.mfa = mfa;
      save();
    },
    async updateMyName(input) {
      const { data: name, error } = normalizeAccountName(input);
      if (error) throw new Error(error);
      const me = session.read();
      if (!me) throw new Error('La sesión expiró. Vuelva a ingresar.');
      const admin = admins.find((a) => a.email === me.email);
      if (admin) admin.name = name;
      else store.accountNames = { ...store.accountNames, [me.email]: name };
      save();
      return profileOf(me.email);
    },

    // --- Cuentas de administración -------------------------------------------------
    async listAdmins() { return admins.map((a) => ({ ...a, id: a.uid, role: 'admin' })).sort(byName); },
    async createAdmin(input) {
      const data = fail(normalizeAdmin(input));
      const email = String(input.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('El correo no es válido.');
      if (admins.some((a) => a.email === email) || DOCTOR_LOGIN[email]) throw new Error('Ya existe una cuenta con ese correo.');
      if (passwordProblem(input.password)) throw new Error(passwordProblem(input.password));
      const uid = newId('adm-');
      admins.push({ uid, email, ...data });
      save();
      return uid;
    },
    async updateAdmin(uid, input) {
      const data = fail(normalizeAdmin(input));
      Object.assign(admins.find((a) => a.uid === uid), input.permissions === undefined ? { name: data.name, description: data.description } : data);
      save();
    },
    async setAdminDisabled(uid, disabled) {
      admins.find((a) => a.uid === uid).disabled = !!disabled;
      save();
    },
    async resetPassword() { await wait(200); },

    // --- Médicos ----------------------------------------------------------------
    async listDoctors() { return doctors.slice().sort(byName); },
    async createDoctor({ name, email, specialty, password }) {
      if (passwordProblem(password)) throw new Error(passwordProblem(password));
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
      return studies.filter((s) => !doctorId || doctorsOf(s).includes(doctorId)).map(withDoctors).sort(byDateDesc);
    },
    async uploadStudy({ patient, doctorIds, serviceId, service, description, date, files, onProgress }) {
      const serviceFields = studyServiceFields(serviceId, service);
      for (let i = 1; i <= 10; i++) { await wait(80); if (onProgress) onProgress(i / 10); }
      const id = 'EST-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
      studies.push({
        id, code: id, patientId: patient.id, ...studyPatientFields(patient), ...studyDoctors(doctorIds),
        ...serviceFields, description: String(description || '').trim().slice(0, 120), date, status: 'Nuevo', createdAt: Date.now(), updatedAt: Date.now(),
        files: files.map((f) => ({ name: f.name, path: 'demo/' + newId('f'), size: f.size })), totalSize: sizeOf(files)
      });
      save();
      return id;
    },
    async setStudyDoctors(studyId, doctorIds) { Object.assign(edited(studyId), studyDoctors(doctorIds)); save(); },
    async setStudiesPaid(ids, paid) {
      studies.filter((s) => ids.includes(s.id)).forEach((s) => { s.paid = !!paid; });
      save();
    },
    async updateStudy(study, changes) { Object.assign(edited(study.id), studyEdits(changes)); save(); },
    // Archivos de demostración: solo nombre y tamaño (no hay nada que descargar).
    async addStudyFiles(study, files, onProgress) {
      for (let i = 1; i <= 5; i++) { await wait(60); if (onProgress) onProgress(i / 5); }
      const s = edited(study.id);
      s.files = [...s.files, ...files.map((f) => ({ name: f.name, path: 'demo/' + newId('f'), size: f.size }))];
      s.totalSize = sizeOf(s.files);
      save();
      return s.files;
    },
    async renameStudyFile(study, path, name) {
      const s = edited(study.id);
      s.files = s.files.map((f) => (f.path === path ? { ...f, name: cleanFileName(name) } : f));
      save();
      return s.files;
    },
    async deleteStudyFile(study, path) {
      const s = edited(study.id);
      s.files = s.files.filter((f) => f.path !== path);
      s.totalSize = sizeOf(s.files);
      save();
      return s.files;
    },
    fileUrl: async () => null,
    async deleteStudy(study) { studies.splice(studies.findIndex((s) => s.id === study.id), 1); save(); },
    async markSeen(studyId) { const s = studies.find((x) => x.id === studyId); if (s) s.status = 'Visto'; save(); },
    async fileUrls() { return []; },

    // --- Servicios y horario ------------------------------------------------------------
    async getAgendaSettings() { return store.settings || null; },
    async saveAgendaSettings(cfg) {
      const data = fail(validateSettings(cfg));
      store.settings = toStored(data);
      save();
      return data;
    },

    // --- Cobros ------------------------------------------------------------------------
    async listPayments() { return payments.map((x) => ({ ...x })).sort(byDateDesc); },
    async savePayment(id, input) {
      const data = fail(normalizePayment(input));
      if (id) Object.assign(payments.find((x) => x.id === id), data);
      else { id = newId('pay'); payments.push({ id, ...data, createdBy: (session.read() || {}).email || null }); }
      save();
      return id;
    },
    async deletePayment(id) { payments.splice(payments.findIndex((x) => x.id === id), 1); save(); },

    // --- Registro de accesos a exámenes ---------------------------------------------------
    logAccess(study, action) {
      const me = session.read();
      if (!me || !study) return;
      const uid = (profileOf(me.email) || {}).uid;
      if (!store.accessLogs) store.accessLogs = [];
      store.accessLogs.unshift({ id: newId('log'), uid, studyId: study.id, action, at: Date.now(), patientName: study.patientName || '', serviceName: studyServiceName(study), files: (study.files || []).length });
      store.accessLogs.length = Math.min(store.accessLogs.length, 300);
      save();
    },
    async listAccessLogs(max = 300) { return (store.accessLogs || []).slice(0, max).map((x) => ({ ...x })); },

    // --- Maquinita (simulada) -------------------------------------------------------------
    // La orden llega a la maquinita, a los 2 s el "paciente" está pagando y a
    // los 8 s queda pagada con débito. demoPointResult() fuerza el resultado.
    async pointSettings() { return store.point || null; },
    async pointTerminals() {
      await wait(300);
      return { terminals: DEMO_TERMINALS.map((t) => ({ ...t })), current: (store.point || {}).terminalId || '' };
    },
    async pointUseTerminal(terminalId) {
      await wait(300);
      const t = DEMO_TERMINALS.find((x) => x.id === terminalId);
      if (!t) throw new Error('Mercado Pago no encuentra la maquinita.');
      t.operatingMode = 'PDV';
      store.point = { terminalId };
      save();
      return { terminalId };
    },
    async startPointPayment(input) {
      const data = fail(normalizePayment(input, { terminal: true }));
      if (!store.point) throw new Error('Primero elija la maquinita en Cobros → Maquinita.');
      await wait(400);
      const p = { id: newId('pay'), ...data, channel: 'point', status: 'pending', createdBy: (session.read() || {}).email || null };
      payments.push(p);
      sendToTerminal(p);
      return p.id;
    },
    async retryPointPayment(id) {
      const p = payments.find((x) => x.id === id);
      if (!p || !['canceled', 'expired', 'failed'].includes(p.status)) throw new Error('Este cobro ya está en la maquinita.');
      await wait(300);
      sendToTerminal(p);
      return { status: 'pending' };
    },
    async refreshPointPayment(id) {
      const p = payments.find((x) => x.id === id);
      if (p) tick(p);
      return { status: p ? p.status : null };
    },
    async cancelPointPayment(id) {
      const p = payments.find((x) => x.id === id);
      if (!p || p.status !== 'pending') return { status: p && p.status };
      if (p.mp.status !== 'created') throw new Error('La maquinita ya tomó el cobro: cancélelo en la maquinita.');
      setOrder(p, 'canceled');
      return { status: 'canceled' };
    },
    watchPayment(id, onChange) {
      if (!watchers.has(id)) watchers.set(id, new Set());
      watchers.get(id).add(onChange);
      setTimeout(() => notify(id), 0);
      return () => watchers.get(id).delete(onChange);
    },
    demoPointResult(id, result) {
      const p = payments.find((x) => x.id === id);
      if (p && p.status === 'pending') setOrder(p, result === 'paid' ? 'processed' : 'failed', 'credit_card');
    },

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
