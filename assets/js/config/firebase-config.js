// Configuración de Firebase.
// Cópiela desde Firebase Console → Configuración del proyecto → Tus apps → App web.
// Mientras apiKey empiece por "TU_", el sitio funciona en MODO DEMOSTRACIÓN
// (datos de ejemplo, sin conexión a Firebase).
//
// Estos valores no son secretos: identifican el proyecto. La seguridad la dan
// las reglas de firestore.rules y storage.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyDE7JZx8HhVqjF5bpihQ8fmkKE8zIFw488',
  authDomain: 'dentfrucer-28e0f.firebaseapp.com',
  projectId: 'dentfrucer-28e0f',
  storageBucket: 'dentfrucer-28e0f.firebasestorage.app',
  messagingSenderId: '1015219486315',
  appId: '1:1015219486315:web:02321e259e20fa9112fb2e',
  measurementId: 'G-426TXLH7YV'
};

// Región de las funciones del servidor (functions/index.js): cobros con la
// maquinita de Mercado Pago. Santiago de Chile.
export const functionsRegion = 'southamerica-west1';
