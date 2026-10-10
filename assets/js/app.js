// DentFrucer — punto de entrada.
// Cada página HTML declara <body data-page="..."> y aquí se carga su módulo.
//
//   pages/      lógica de cada página (landing, login, admin, portal, agenda)
//   services/   acceso a datos (Firebase o modo demostración)
//   ui/         utilidades de interfaz compartidas (iconos, modales, formatos)
//   viewer/     visor de estudios DICOM e imágenes
//   config/     configuración del proyecto Firebase

import { renderIcons } from './ui/icons.js';

const PAGES = {
  landing: () => import('./pages/landing.js'),
  login: () => import('./pages/login.js'),
  admin: () => import('./pages/admin.js'),
  portal: () => import('./pages/portal.js'),
  agenda: () => import('./pages/agenda.js')
};

renderIcons();
const load = PAGES[document.body.dataset.page];
if (load) load().then((m) => m.init());
