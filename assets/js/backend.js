// Capa de datos de DentFrucer.
//
// Dos implementaciones con la misma interfaz:
//  - Firebase: Authentication + Firestore + Storage (cuando firebase-config.js está completo).
//  - Demo: datos de ejemplo en memoria, para ver la interfaz sin Firebase.
//
// Modelo en Firestore:
//  users/{uid}        { name, email, role: 'admin' | 'doctor', specialty }
//  patients/{id}      { name, code, age, doctorId, createdAt }
//  studies/{id}       { code, patientId, patientName, patientCode, patientAge, doctorId,
//                       modality, description, date: 'YYYY-MM-DD', files: [{ name, path, size }],
//                       totalSize, status: 'Nuevo' | 'Visto', createdAt }
// Archivos en Storage: studies/{studyId}/{nombre de archivo}

import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('TU_');

function byDateDesc(a, b) { return (b.date || '').localeCompare(a.date || ''); }
function byName(a, b) { return (a.name || '').localeCompare(b.name || '', 'es'); }
function studyCode(id) { return 'EST-' + new Date().getFullYear() + '-' + id.slice(0, 5).toUpperCase(); }

function friendlyAuthError(err) {
  const code = (err && err.code) || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
  if (code.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo.';
  if (code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.includes('invalid-email')) return 'El correo no es válido.';
  if (code.includes('permission-denied')) return 'No tiene permiso para esta acción.';
  if (code.includes('api-key-not-valid') || code.includes('invalid-api-key')) return 'La configuración de Firebase no es válida (revise firebase-config.js).';
  if (code.includes('configuration-not-found') || code.includes('operation-not-allowed')) return 'El inicio de sesión con correo no está activado en Firebase (Authentication → Método de acceso).';
  if (code.includes('network')) return 'Sin conexión. Revise su internet.';
  return (err && err.message) || 'Ocurrió un error inesperado.';
}

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
async function createFirebaseBackend() {
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
    setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch
  } = fsMod;
  const { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } = stMod;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  // Espera la primera respuesta de Auth (sesión restaurada o ninguna).
  const authReady = new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });

  async function profileOf(user) {
    if (!user) return null;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: user.uid,
      email: user.email,
      name: d.name || user.email,
      role: d.role,
      specialty: d.specialty || '',
      title: d.role === 'admin' ? 'Administrador' : (d.specialty || 'Médico')
    };
  }

  const list = async (q) => (await getDocs(q)).docs.map((s) => ({ id: s.id, ...s.data() }));

  return {
    mode: 'firebase',

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
          throw new Error('Su cuenta no tiene un perfil asignado. Contacte a DentFrucer.');
        }
        return profile;
      } catch (e) {
        throw new Error(friendlyAuthError(e));
      }
    },

    signOut: () => signOut(auth),

    async resetPassword(email) {
      try { await sendPasswordResetEmail(auth, email); } catch (e) { throw new Error(friendlyAuthError(e)); }
    },

    // Las reglas exigen el filtro por doctorId para los médicos.
    async listStudies({ doctorId } = {}) {
      const c = collection(db, 'studies');
      return (await list(doctorId ? query(c, where('doctorId', '==', doctorId)) : c)).sort(byDateDesc);
    },

    async listPatients({ doctorId } = {}) {
      const c = collection(db, 'patients');
      return (await list(doctorId ? query(c, where('doctorId', '==', doctorId)) : c)).sort(byName);
    },

    async listDoctors() {
      return (await list(query(collection(db, 'users'), where('role', '==', 'doctor')))).sort(byName);
    },

    // Crea la cuenta del médico con una segunda instancia de la app, para no
    // cerrar la sesión del administrador.
    async createDoctor({ name, email, password, specialty }) {
      const secondary = initializeApp(firebaseConfig, 'secondary-' + Date.now());
      const secAuth = getAuth(secondary);
      try {
        const cred = await createUserWithEmailAndPassword(secAuth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          name, email, specialty: specialty || '', role: 'doctor', createdAt: serverTimestamp()
        });
        await signOut(secAuth);
        return cred.user.uid;
      } catch (e) {
        throw new Error(friendlyAuthError(e));
      }
    },

    async createPatient({ name, code, age, doctorId }) {
      const r = doc(collection(db, 'patients'));
      await setDoc(r, { name, code, age: Number(age) || null, doctorId, createdAt: serverTimestamp() });
      return r.id;
    },

    // Cambia el médico de un paciente y de todos sus estudios.
    async setPatientDoctor(patientId, doctorId) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'patients', patientId), { doctorId });
      const studies = await list(query(collection(db, 'studies'), where('patientId', '==', patientId)));
      studies.forEach((s) => batch.update(doc(db, 'studies', s.id), { doctorId }));
      await batch.commit();
    },

    async uploadStudy({ patient, modality, description, date, files, onProgress }) {
      const r = doc(collection(db, 'studies'));
      const total = files.reduce((n, f) => n + f.size, 0) || 1;
      const done = new Array(files.length).fill(0);
      const uploaded = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = 'studies/' + r.id + '/' + (f.webkitRelativePath || f.name);
        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(ref(storage, path), f, { contentType: f.type || 'application/dicom' });
          task.on('state_changed', (s) => {
            done[i] = s.bytesTransferred;
            if (onProgress) onProgress(done.reduce((a, b) => a + b, 0) / total);
          }, reject, resolve);
        });
        uploaded.push({ name: f.name, path, size: f.size });
      }
      await setDoc(r, {
        code: studyCode(r.id),
        patientId: patient.id, patientName: patient.name, patientCode: patient.code, patientAge: patient.age || null,
        doctorId: patient.doctorId,
        modality, description, date,
        files: uploaded, totalSize: uploaded.reduce((n, f) => n + f.size, 0),
        status: 'Nuevo', createdAt: serverTimestamp()
      });
      return r.id;
    },

    async deleteStudy(study) {
      await Promise.all((study.files || []).map((f) => deleteObject(ref(storage, f.path)).catch(() => {})));
      await deleteDoc(doc(db, 'studies', study.id));
    },

    markSeen: (studyId) => updateDoc(doc(db, 'studies', studyId), { status: 'Visto' }),

    async fileUrls(study) {
      return Promise.all((study.files || []).map(async (f) => ({ name: f.name, url: await getDownloadURL(ref(storage, f.path)) })));
    }
  };
}

// ---------------------------------------------------------------------------
// Demo (sin Firebase)
// ---------------------------------------------------------------------------
function createDemoBackend() {
  const KEY = 'dentfrucer.demo.session';
  const MB = 1024 * 1024;
  const users = {
    'admin@dentfrucer.com': { uid: 'admin', name: 'Administración', role: 'admin', specialty: '' },
    'doctor@dentfrucer.com': { uid: 'D-01', name: 'Dra. Laura Méndez', role: 'doctor', specialty: 'Ortodoncia' }
  };
  const doctors = [
    { id: 'D-01', name: 'Dra. Laura Méndez', specialty: 'Ortodoncia', email: 'doctor@dentfrucer.com' },
    { id: 'D-02', name: 'Dr. Carlos Rivas', specialty: 'Implantología', email: 'crivas@clinica.com' },
    { id: 'D-03', name: 'Dra. Ana Torres', specialty: 'Endodoncia', email: 'atorres@clinica.com' }
  ];
  const patients = [
    { id: 'p1', name: 'Martina Gómez', code: 'P-1042', age: 14, doctorId: 'D-01' },
    { id: 'p2', name: 'Julián Pérez', code: 'P-1037', age: 11, doctorId: 'D-01' },
    { id: 'p3', name: 'Sofía Herrera', code: 'P-1029', age: 32, doctorId: 'D-01' },
    { id: 'p4', name: 'Tomás Aguilar', code: 'P-1021', age: 45, doctorId: 'D-02' },
    { id: 'p5', name: 'Valentina Ruiz', code: 'P-1018', age: 27, doctorId: 'D-03' },
    { id: 'p6', name: 'Diego Castro', code: 'P-1011', age: 9, doctorId: 'D-01' },
    { id: 'p7', name: 'Lucía Fernández', code: 'P-1006', age: 52, doctorId: 'D-02' }
  ];
  const mk = (id, pid, modality, description, date, mb, images, status) => {
    const p = patients.find((x) => x.id === pid);
    return {
      id, code: id, patientId: pid, patientName: p.name, patientCode: p.code, patientAge: p.age, doctorId: p.doctorId,
      modality, description, date, status, totalSize: mb * MB,
      files: Array.from({ length: Math.min(images, 3) }, (_, i) => ({ name: 'IMG' + String(i + 1).padStart(4, '0') + '.dcm', path: '', size: (mb * MB) / images }))
    };
  };
  const studies = [
    mk('EST-2026-0418', 'p1', 'CBCT', 'Tomografía Cone Beam · maxilar completo', '2026-10-08', 412, 512, 'Nuevo'),
    mk('EST-2026-0415', 'p1', 'Panorámica', 'Ortopantomografía digital', '2026-10-08', 18, 1, 'Visto'),
    mk('EST-2026-0409', 'p2', 'Cefalometría', 'Telerradiografía lateral de cráneo', '2026-10-06', 22, 1, 'Visto'),
    mk('EST-2026-0402', 'p3', 'CBCT', 'Cone Beam · ATM bilateral', '2026-10-03', 388, 480, 'Nuevo'),
    mk('EST-2026-0397', 'p4', 'CBCT', 'Cone Beam · zona implante 36', '2026-10-02', 296, 384, 'Visto'),
    mk('EST-2026-0391', 'p5', 'Periapical', 'Serie periapical completa', '2026-09-30', 36, 14, 'Nuevo'),
    mk('EST-2026-0385', 'p6', 'Panorámica', 'Ortopantomografía digital', '2026-09-29', 17, 1, 'Visto'),
    mk('EST-2026-0380', 'p7', 'CBCT', 'Cone Beam · seno maxilar', '2026-09-27', 402, 500, 'Visto')
  ];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } };
  const write = (v) => { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch (e) { /* modo privado */ } };
  const forDoctor = (arr, doctorId) => (doctorId ? arr.filter((x) => x.doctorId === doctorId) : arr.slice());

  return {
    mode: 'demo',
    async currentUser() { return read(); },
    async signIn(email, password) {
      await wait(250);
      const u = users[email.trim().toLowerCase()];
      if (!u || password !== 'demo1234') throw new Error('Correo o contraseña incorrectos.');
      const profile = { ...u, email, title: u.role === 'admin' ? 'Administrador' : u.specialty };
      write(profile);
      return profile;
    },
    async signOut() { write(null); },
    async resetPassword() { await wait(200); },
    async listStudies({ doctorId } = {}) { return forDoctor(studies, doctorId).sort(byDateDesc); },
    async listPatients({ doctorId } = {}) { return forDoctor(patients, doctorId).sort(byName); },
    async listDoctors() { return doctors.slice().sort(byName); },
    async createDoctor({ name, email, specialty }) {
      const id = 'D-' + String(doctors.length + 1).padStart(2, '0');
      doctors.push({ id, name, email, specialty });
      return id;
    },
    async createPatient(p) {
      const id = 'p' + (patients.length + 1);
      patients.push({ id, ...p, age: Number(p.age) || null });
      return id;
    },
    async setPatientDoctor(patientId, doctorId) {
      patients.filter((p) => p.id === patientId).forEach((p) => { p.doctorId = doctorId; });
      studies.filter((s) => s.patientId === patientId).forEach((s) => { s.doctorId = doctorId; });
    },
    async uploadStudy({ patient, modality, description, date, files, onProgress }) {
      for (let i = 1; i <= 10; i++) { await wait(80); if (onProgress) onProgress(i / 10); }
      const id = 'EST-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
      studies.push({
        id, code: id, patientId: patient.id, patientName: patient.name, patientCode: patient.code, patientAge: patient.age,
        doctorId: patient.doctorId, modality, description, date, status: 'Nuevo',
        files: files.map((f) => ({ name: f.name, path: '', size: f.size })), totalSize: files.reduce((n, f) => n + f.size, 0)
      });
      return id;
    },
    async deleteStudy(study) {
      const i = studies.findIndex((s) => s.id === study.id);
      if (i >= 0) studies.splice(i, 1);
    },
    async markSeen(studyId) { const s = studies.find((x) => x.id === studyId); if (s) s.status = 'Visto'; },
    async fileUrls() { return []; }
  };
}

export const backend = isDemo ? createDemoBackend() : await createFirebaseBackend();
