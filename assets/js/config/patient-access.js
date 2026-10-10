// Acceso de los pacientes a sus resultados (resultados.html?t=…).
//
// La página y el visor de solo lectura ya están hechos, pero el acceso está
// DESACTIVADO: con enabled = false, resultados.html no muestra ningún estudio
// real (solo los de ejemplo en modo demostración).
//
// Para activarlo falta el envío del enlace por correo y la resolución del
// enlace en el backend (ver getSharedStudy en services/backend/firebase.js y
// la sección "Acceso de pacientes" de FIREBASE.md).
export const patientAccess = {
  enabled: false
};
