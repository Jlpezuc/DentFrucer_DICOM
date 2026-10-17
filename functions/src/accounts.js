// Cuentas de médicos y de administración creadas por el servidor. Así se puede
// desactivar en Firebase el registro abierto (cualquiera podía crear una cuenta
// con la clave pública de la página, aunque sin perfil no tuviera acceso).
// La página guarda después el perfil en users/{uid} (lo validan las reglas).

import { FriendlyError } from './errors.js';
import { adminCan } from './point.js';

export const MIN_PASSWORD = 10;

// Igual que passwordProblem() en la página (services/backend/shared.js).
export function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD) return 'La contraseña debe tener al menos ' + MIN_PASSWORD + ' caracteres.';
  if (!/[a-zA-ZñÑáéíóúÁÉÍÓÚ]/.test(p) || !/\d/.test(p)) return 'La contraseña debe tener letras y números.';
  return '';
}

// Administradores: solo el administrador general. Médicos: también quien tiene "medicos".
export async function createAccount(db, auth, callerUid, { email, password, role } = {}) {
  if (role !== 'admin' && role !== 'doctor') throw new FriendlyError('invalid-argument', 'Tipo de cuenta no válido.');
  const allowed = role === 'admin' ? await adminCan(db, callerUid, '*') : await adminCan(db, callerUid, 'medicos');
  if (!allowed) throw new FriendlyError('permission-denied', 'Su cuenta no puede crear este tipo de cuenta.');
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || mail.length > 120) throw new FriendlyError('invalid-argument', 'El correo no es válido.');
  const problem = passwordProblem(password);
  if (problem) throw new FriendlyError('invalid-argument', problem);
  try {
    const user = await auth.createUser({ email: mail, password: String(password) });
    return { uid: user.uid };
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw new FriendlyError('already-exists', 'Ya existe una cuenta con ese correo.');
    if (e.code === 'auth/invalid-password' || e.code === 'auth/password-does-not-meet-requirements') throw new FriendlyError('invalid-argument', 'La contraseña no cumple la política de seguridad.');
    throw e;
  }
}
