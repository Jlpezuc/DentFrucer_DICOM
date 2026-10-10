// Configuración de Firebase.
// Cópiela desde Firebase Console → Configuración del proyecto → Tus apps → App web.
// Mientras apiKey empiece por "TU_", el sitio funciona en MODO DEMOSTRACIÓN
// (datos de ejemplo, sin conexión a Firebase).
//
// Estos valores no son secretos: identifican el proyecto. La seguridad la dan
// las reglas de firestore.rules y storage.rules.
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDE7JZx8HhVqjF5bpihQ8fmkKE8zIFw488",
  authDomain: "dentfrucer-28e0f.firebaseapp.com",
  projectId: "dentfrucer-28e0f",
  storageBucket: "dentfrucer-28e0f.firebasestorage.app",
  messagingSenderId: "1015219486315",
  appId: "1:1015219486315:web:02321e259e20fa9112fb2e",
  measurementId: "G-426TXLH7YV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
