// Backend con Firebase: Authentication + Firestore + Storage.
// Modelo de datos: ver services/backend.js.

import { firebaseConfig } from '../../config/firebase-config.js';
import { patientAccess } from '../../config/patient-access.js';
import { agendaPatientId, APPOINTMENT_STATUSES, appointmentCode, isActive, normalizeBooking, slotId, SlotTakenError } from '../agenda.js';
import { normalizePayment } from '../payments.js';
import { normalizeAccountName, normalizePatient } from '../people.js';
import { toStored, validateSettings } from '../settings.js';
import {
  AccessDisabledError, agendaPatient, appointmentFields, byDateDesc, byDateTime, byName, cleanFileName, friendlyAuthError, normalizeAdmin,
  sizeOf, studyCode, studyDoctors, studyEdits, studyPatientFields, withDoctors
} from './shared.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function createFirebaseBackend() {
  const [appMod, authMod, fsMod, stMod] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
    import(SDK + 'firebase-storage.js')
  ]);
  const { initializeApp } = appMod;
  const {
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
    sendPasswordResetEmail, createUserWithEmailAndPassword
  } = authMod;
  const {
    getFirestore, collection, doc, getDoc, getDocs, query, where,
    setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, runTransaction
  } = fsMod;
  const { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } = stMod;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const list = async (q) => (await getDocs(q)).docs.map((s) => ({ id: s.id, ...s.data() }));
  const isDenied = (e) => String((e && e.code) || '').includes('permission-denied');
  const fail = (result) => { if (result.error) throw new Error(result.error); return result.data; };

  // Sube archivos a studies/{id}/; si el nombre ya existe en el examen se le
  // agrega un prefijo para no sobrescribir el anterior.
  async function uploadFiles(studyId, files, existing, onProgress) {
    const taken = new Set(existing.map((f) => f.path));
    const total = files.reduce((n, f) => n + f.size, 0) || 1;
    const done = new Array(files.length).fill(0);
    const uploaded = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      let path = 'studies/' + studyId + '/' + (f.webkitRelativePath || f.name);
      if (taken.has(path)) path = 'studies/' + studyId + '/' + Date.now().toString(36) + '-' + f.name;
      taken.add(path);
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, path), f, { contentType: f.type || 'application/dicom' });
        task.on('state_changed', (s) => {
          done[i] = s.bytesTransferred;
          if (onProgress) onProgress(done.reduce((a, b) => a + b, 0) / total);
        }, reject, resolve);
      });
      uploaded.push({ name: f.name, path, size: f.size });
    }
    return uploaded;
  }

  // Cambio hecho por la clínica en un examen: queda la fecha de la última
  // modificación (los exámenes de un grupo se ordenan por ella).
  const editStudy = (id, changes) => updateDoc(doc(db, 'studies', id), { ...changes, updatedAt: serverTimestamp() });

  // Espera la primera respuesta de Auth (sesión restaurada o ninguna).
  const authReady = new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });

  // Perfil de la cuenta en sesión (null si no tiene perfil o está desactivada).
  async function profileOf(user) {
    if (!user) return null;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (d.disabled) return null;
    return {
      uid: user.uid,
      email: user.email,
      name: d.name || user.email,
      role: d.role,
      specialty: d.specialty || '',
      description: d.description || '',
      superadmin: d.superadmin === true,
      permissions: d.permissions || null,
      title: d.role === 'admin' ? (d.description || 'Administrador') : (d.specialty || 'Médico')
    };
  }

  // Crea una cuenta con una segunda instancia de la app, para no cerrar la
  // sesión de quien la crea, y guarda su perfil en users/{uid}.
  async function createAccount(email, password, profile) {
    const secondary = initializeApp(firebaseConfig, 'secondary-' + Date.now());
    const secAuth = getAuth(secondary);
    try {
      const cred = await createUserWithEmailAndPassword(secAuth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), { ...profile, email, createdAt: serverTimestamp() });
      await signOut(secAuth);
      return cred.user.uid;
    } catch (e) {
      throw new Error(friendlyAuthError(e));
    }
  }

  return {
    mode: 'firebase',

    // --- Sesión -----------------------------------------------------------------
    async currentUser() {
      await authReady;
      return profileOf(auth.currentUser);
    },

    async signIn(email, password) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const profile = await profileOf(cred.user);
        if (!profile) {
          await signOut(auth);
          throw new Error('Su cuenta no tiene acceso (sin perfil o desactivada). Contacte al administrador de DentFrucer.');
        }
        return profile;
      } catch (e) {
        throw new Error(friendlyAuthError(e));
      }
    },

    signOut: () => signOut(auth),

    // Cambia el nombre visible de la cuenta en sesión (users/{uid}.name).
    async updateMyName(input) {
      const { data: name, error } = normalizeAccountName(input);
      if (error) throw new Error(error);
      if (!auth.currentUser) throw new Error('La sesión expiró. Vuelva a ingresar.');
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { name });
      return profileOf(auth.currentUser);
    },

    async resetPassword(email) {
      try { await sendPasswordResetEmail(auth, email); } catch (e) { throw new Error(friendlyAuthError(e)); }
    },

    // --- Médicos ----------------------------------------------------------------
    async listDoctors() {
      return (await list(query(collection(db, 'users'), where('role', '==', 'doctor')))).sort(byName);
    },

    createDoctor: ({ name, email, password, specialty }) => createAccount(email, password, { name, specialty: specialty || '', role: 'doctor' }),

    // --- Cuentas de administración (solo el administrador general) ----------------
    async listAdmins() {
      return (await list(query(collection(db, 'users'), where('role', '==', 'admin')))).sort(byName);
    },

    async createAdmin(input) {
      const data = fail(normalizeAdmin(input));
      return createAccount(String(input.email || '').trim(), input.password, { ...data, role: 'admin' });
    },

    // Sin permissions en input (la propia cuenta) solo cambian nombre y descripción.
    async updateAdmin(uid, input) {
      const data = fail(normalizeAdmin(input));
      await updateDoc(doc(db, 'users', uid), input.permissions === undefined ? { name: data.name, description: data.description } : data);
    },

    // Desactivar no borra la cuenta: deja de poder entrar hasta que se reactive.
    setAdminDisabled: (uid, disabled) => updateDoc(doc(db, 'users', uid), { disabled: !!disabled }),

    // --- Pacientes (solo administración) -------------------------------------------
    async listPatients() {
      return (await list(collection(db, 'patients'))).sort(byName);
    },

    async createPatient(input) {
      const data = fail(normalizePatient(input));
      const r = doc(collection(db, 'patients'));
      await setDoc(r, { ...data, source: 'panel', createdAt: serverTimestamp() });
      return r.id;
    },

    // Actualiza la ficha y los datos del paciente copiados en sus exámenes.
    async updatePatient(id, input) {
      const data = fail(normalizePatient(input));
      const batch = writeBatch(db);
      batch.update(doc(db, 'patients', id), data);
      const studies = await list(query(collection(db, 'studies'), where('patientId', '==', id)));
      studies.forEach((s) => batch.update(doc(db, 'studies', s.id), studyPatientFields(data)));
      await batch.commit();
    },

    // --- Exámenes: cada uno tiene su paciente y uno o varios médicos ---------------
    // Un médico solo puede pedir los suyos: los que lo incluyen en doctorIds y,
    // por los exámenes anteriores a doctorIds, los que tienen su doctorId.
    async listStudies({ doctorId } = {}) {
      const c = collection(db, 'studies');
      if (!doctorId) return (await list(c)).map(withDoctors).sort(byDateDesc);
      const [many, one] = await Promise.all([
        list(query(c, where('doctorIds', 'array-contains', doctorId))),
        list(query(c, where('doctorId', '==', doctorId)))
      ]);
      const byId = new Map([...one, ...many].map((s) => [s.id, s]));
      return [...byId.values()].map(withDoctors).sort(byDateDesc);
    },

    // Un examen (documento de "studies") = modalidad + archivos. Los exámenes del mismo
    // paciente, médico y fecha forman un grupo (ver services/groups.js).
    async uploadStudy({ patient, doctorIds, modality, description, date, files, onProgress }) {
      const r = doc(collection(db, 'studies'));
      const uploaded = await uploadFiles(r.id, files, [], onProgress);
      await setDoc(r, {
        code: studyCode(r.id),
        patientId: patient.id, ...studyPatientFields(patient),
        ...studyDoctors(doctorIds),
        modality, description, date,
        files: uploaded, totalSize: sizeOf(uploaded),
        status: 'Nuevo', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      return r.id;
    },

    setStudyDoctors: (studyId, doctorIds) => editStudy(studyId, studyDoctors(doctorIds)),

    // Datos del examen: modalidad, descripción, fecha y médico.
    updateStudy: (study, changes) => editStudy(study.id, studyEdits(changes)),

    // Archivos de un examen: agregar (p. ej. el informe PDF), renombrar y eliminar.
    async addStudyFiles(study, files, onProgress) {
      const current = study.files || [];
      const uploaded = await uploadFiles(study.id, files, current, onProgress);
      const all = [...current, ...uploaded];
      await editStudy(study.id, { files: all, totalSize: sizeOf(all) });
      return all;
    },

    async renameStudyFile(study, path, name) {
      const all = (study.files || []).map((f) => (f.path === path ? { ...f, name: cleanFileName(name) } : f));
      await editStudy(study.id, { files: all });
      return all;
    },

    async deleteStudyFile(study, path) {
      await deleteObject(ref(storage, path)).catch(() => {});
      const all = (study.files || []).filter((f) => f.path !== path);
      await editStudy(study.id, { files: all, totalSize: sizeOf(all) });
      return all;
    },

    async deleteStudy(study) {
      await Promise.all((study.files || []).map((f) => deleteObject(ref(storage, f.path)).catch(() => {})));
      await deleteDoc(doc(db, 'studies', study.id));
    },

    markSeen: (studyId) => updateDoc(doc(db, 'studies', studyId), { status: 'Visto' }),

    // Enlace de descarga de un archivo (o null si no hay archivo real).
    fileUrl: (file) => (file.path ? getDownloadURL(ref(storage, file.path)) : null),

    async fileUrls(study) {
      return Promise.all((study.files || []).map(async (f) => ({ name: f.name, url: await getDownloadURL(ref(storage, f.path)) })));
    },

    // --- Servicios y horario (settings/agenda; lectura pública) ------------------------
    async getAgendaSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'agenda'));
        return snap.exists() ? snap.data() : null;
      } catch (e) { return null; }
    },

    async saveAgendaSettings(cfg) {
      const data = fail(validateSettings(cfg));
      await setDoc(doc(db, 'settings', 'agenda'), { ...toStored(data), updatedAt: serverTimestamp() });
      return data;
    },

    // --- Cobros ------------------------------------------------------------------------
    async listPayments() {
      return (await list(collection(db, 'payments'))).sort(byDateDesc);
    },

    // Crea (id vacío) o reemplaza un cobro.
    async savePayment(id, input) {
      const data = fail(normalizePayment(input));
      if (id) {
        await updateDoc(doc(db, 'payments', id), { ...data, updatedAt: serverTimestamp() });
        return id;
      }
      const r = doc(collection(db, 'payments'));
      await setDoc(r, { ...data, createdBy: auth.currentUser ? auth.currentUser.uid : null, createdAt: serverTimestamp() });
      return r.id;
    },

    deletePayment: (id) => deleteDoc(doc(db, 'payments', id)),

    // --- Agenda: público -----------------------------------------------------------
    // Turnos ocupados entre dos fechas (públicos: no contienen datos personales).
    async listBusySlots(from, to) {
      const q = query(collection(db, 'slots'), where('date', '>=', from), where('date', '<=', to));
      return new Set((await getDocs(q)).docs.map((d) => d.id));
    },

    // Reserva pública, sin cuenta: crea en un solo lote la cita, el turno ocupado
    // y (si no existía) el paciente. Las reglas solo permiten crear, nunca leer.
    async bookAppointment(input) {
      const data = fail(normalizeBooking(input));
      const apptRef = doc(collection(db, 'appointments'));
      const sid = slotId(data.date, data.time);
      const patientId = await agendaPatientId(data, apptRef.id);
      const code = appointmentCode(apptRef.id);
      const commit = (withPatient) => {
        const batch = writeBatch(db);
        if (withPatient) batch.set(doc(db, 'patients', patientId), { ...agendaPatient(data), createdAt: serverTimestamp() });
        batch.set(apptRef, { ...appointmentFields(data), code, slotId: sid, patientId, createdAt: serverTimestamp() });
        batch.set(doc(db, 'slots', sid), { date: data.date, time: data.time, appointmentId: apptRef.id });
        return batch.commit();
      };
      const slotTaken = async () => (await getDoc(doc(db, 'slots', sid))).exists();
      try {
        await commit(true);
      } catch (e) {
        if (!isDenied(e)) throw new Error(friendlyAuthError(e));
        if (await slotTaken()) throw new SlotTakenError();
        // El paciente ya existía (agendó antes con los mismos datos): solo la cita.
        try { await commit(false); } catch (e2) {
          if (isDenied(e2) && await slotTaken()) throw new SlotTakenError();
          throw new Error('No se pudo agendar la cita. Intente de nuevo o llámenos.');
        }
      }
      return { id: apptRef.id, code, ...data };
    },

    // --- Agenda: administración ------------------------------------------------------
    async listAppointments() {
      return (await list(collection(db, 'appointments'))).sort(byDateTime);
    },

    // Cita creada desde el panel. patientId: paciente existente; si falta, se usa
    // (o se crea) la ficha que corresponde a los datos, igual que en la agenda pública.
    async createAppointment(input, { patientId } = {}) {
      const data = fail(normalizeBooking(input));
      const apptRef = doc(collection(db, 'appointments'));
      const pid = patientId || await agendaPatientId(data, apptRef.id);
      const sid = slotId(data.date, data.time);
      await runTransaction(db, async (tx) => {
        const slotRef = doc(db, 'slots', sid);
        const patientRef = doc(db, 'patients', pid);
        if ((await tx.get(slotRef)).exists()) throw new SlotTakenError();
        const patientExists = (await tx.get(patientRef)).exists();
        if (!patientExists) tx.set(patientRef, { ...agendaPatient(data), createdAt: serverTimestamp() });
        tx.set(apptRef, { ...appointmentFields({ ...data, status: input.status }), code: appointmentCode(apptRef.id), slotId: sid, patientId: pid, createdAt: serverTimestamp() });
        tx.set(slotRef, { date: data.date, time: data.time, appointmentId: apptRef.id });
      });
      return apptRef.id;
    },

    // Edita una cita. Si cambia el día/hora o pasa a cancelada (o vuelve de
    // cancelada), el turno ocupado se mueve, se libera o se vuelve a ocupar.
    async updateAppointment(prev, changes) {
      const next = { ...prev, ...changes };
      const data = fail(normalizeBooking(next));
      if (!APPOINTMENT_STATUSES.includes(next.status)) throw new Error('Estado de cita no válido.');
      const oldSid = prev.slotId;
      const newSid = slotId(data.date, data.time);
      const wasActive = isActive(prev);
      const nowActive = isActive(next);
      const takeNew = nowActive && (!wasActive || newSid !== oldSid);
      const freeOld = wasActive && (!nowActive || newSid !== oldSid);
      await runTransaction(db, async (tx) => {
        const newRef = doc(db, 'slots', newSid);
        if (takeNew) {
          const s = await tx.get(newRef);
          if (s.exists() && s.data().appointmentId !== prev.id) throw new SlotTakenError();
        }
        if (freeOld && oldSid) tx.delete(doc(db, 'slots', oldSid));
        if (takeNew) tx.set(newRef, { date: data.date, time: data.time, appointmentId: prev.id });
        tx.update(doc(db, 'appointments', prev.id), { ...appointmentFields({ ...data, status: next.status }), slotId: newSid });
      });
    },

    // Borra la cita (y libera su turno). La ficha del paciente se conserva.
    async deleteAppointment(appt) {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'appointments', appt.id));
      if (isActive(appt) && appt.slotId) batch.delete(doc(db, 'slots', appt.slotId));
      await batch.commit();
    },

    // --- Resultados para pacientes ------------------------------------------------------
    // Examen que un paciente abre con el enlace recibido por correo:
    //   { study, files: [{ name, url }] }
    // Desactivado (config/patient-access.js). Para activarlo se planea guardar, al
    // enviar el correo, un documento shares/{token} con un token aleatorio largo,
    // los datos del examen y los enlaces de descarga; las reglas permitirían
    // "get" (nunca "list") de ese documento, y el enlace caducaría (expiresAt).
    async getSharedStudy() {
      if (!patientAccess.enabled) throw new AccessDisabledError();
      throw new Error('El acceso de pacientes está activado, pero falta implementar getSharedStudy en el backend.');
    }
  };
}
