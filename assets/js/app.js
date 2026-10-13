// DentFrucer — punto de entrada.
// Cada página HTML declara <body data-page="..."> y aquí se carga su módulo.
//
//   pages/      lógica de cada página (landing, login, admin, portal, agenda, results)
//   services/   acceso a datos (Firebase o modo demostración)
//   ui/         utilidades de interfaz compartidas (iconos, modales, formatos)
//   viewer/     visor de exámenes DICOM e imágenes
//   config/     configuración de Firebase, la agenda y el acceso de pacientes

import { renderIcons } from './ui/icons.js';

const PAGES = {
  landing: () => import('./pages/landing.js'),
  login: () => import('./pages/login.js'),
  admin: () => import('./pages/admin/index.js'),
  portal: () => import('./pages/portal.js'),
  agenda: () => import('./pages/agenda.js'),
  results: () => import('./pages/results.js')
};

renderIcons();
const load = PAGES[document.body.dataset.page];
if (load) load().then((m) => m.init());
