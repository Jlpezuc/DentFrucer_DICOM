// Configuración de Firebase.
// Cópiela desde Firebase Console → Configuración del proyecto → Tus apps → App web.
// Mientras apiKey empiece por "TU_", el sitio funciona en MODO DEMOSTRACIÓN
// (datos de ejemplo, sin conexión a Firebase).
//
// Estos valores no son secretos: identifican el proyecto. La seguridad la dan
// las reglas de firestore.rules y storage.rules.
export const firebaseConfig = {
  apiKey: 'TU_API_KEY',
  authDomain: 'TU_PROYECTO.firebaseapp.com',
  projectId: 'TU_PROYECTO',
  storageBucket: 'TU_PROYECTO.appspot.com',
  messagingSenderId: '000000000000',
  appId: 'TU_APP_ID'
};
