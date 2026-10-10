// ¿Modo demostración? Sin configuración de Firebase, o forzado con ?demo=1 en la
// URL (útil para probar la interfaz sin tocar datos reales; ?demo=0 lo
// desactiva). Solo usa datos de ejemplo: nunca da acceso a Firebase.
// Módulo aparte para poder saberlo sin cargar el backend.

import { firebaseConfig } from '../config/firebase-config.js';

function demoForced() {
  try {
    const q = new URLSearchParams(location.search).get('demo');
    if (q === '1') sessionStorage.setItem('dentfrucer.forceDemo', '1');
    if (q === '0') sessionStorage.removeItem('dentfrucer.forceDemo');
    return sessionStorage.getItem('dentfrucer.forceDemo') === '1';
  } catch (e) { return false; }
}

export const isDemo = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('TU_') || demoForced();
