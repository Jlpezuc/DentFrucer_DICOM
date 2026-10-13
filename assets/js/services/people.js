// Datos de personas (pacientes): limpieza y validación compartidas por la
// agenda pública, el panel de administración y el backend.

export const LIMITS = { name: 60, email: 120, phone: 30, referrer: 80, code: 30 };

// Nombres: se respetan mayúsculas escritas a propósito; si todo está en
// minúsculas o en mayúsculas se pasa a "Nombre Propio".
export function tidyName(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s && (s === s.toLowerCase() || s === s.toUpperCase())) {
    s = s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  }
  return s;
}

// Nombre, apellido, correo y teléfono. Devuelve { data } o { error }.
export function normalizePerson(input) {
  const firstName = tidyName(input.firstName);
  const lastName = tidyName(input.lastName);
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').replace(/\s+/g, ' ').trim();
  if (!firstName || !lastName) return { error: 'Escriba el nombre y el apellido.' };
  if (firstName.length > LIMITS.name || lastName.length > LIMITS.name) return { error: 'El nombre o el apellido es demasiado largo.' };
  if (email && (email.length > LIMITS.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) return { error: 'El correo no es válido. Puede dejarlo en blanco.' };
  if (phone.length > LIMITS.phone || (phone && !/^[0-9+()\-. ]{6,}$/.test(phone))) return { error: 'El teléfono no es válido. Puede dejarlo en blanco.' };
  return { data: { firstName, lastName, name: firstName + ' ' + lastName, email, phone } };
}

// Ficha de paciente (panel): persona + expediente y edad. Los pacientes no
// tienen médico: el médico se asigna a cada examen.
export function normalizePatient(input) {
  const { data, error } = normalizePerson(input);
  if (error) return { error };
  const code = String(input.code || '').trim();
  if (code.length > LIMITS.code) return { error: 'El número de expediente es demasiado largo.' };
  const age = input.age === '' || input.age == null ? null : Number(input.age);
  if (age !== null && !(Number.isInteger(age) && age >= 0 && age <= 120)) return { error: 'La edad no es válida.' };
  return { data: { ...data, code, age } };
}

// Nombre visible de una cuenta (administración o médico). Devuelve { data } o { error }.
export function normalizeAccountName(input) {
  const name = String(input || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2) return { error: 'Escriba el nombre de la cuenta.' };
  if (name.length > LIMITS.name) return { error: 'El nombre es demasiado largo.' };
  return { data: name };
}

// Para comparar nombres sin tildes ni mayúsculas.
export const plainText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
