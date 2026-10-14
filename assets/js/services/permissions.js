// Permisos de las cuentas de administración.
//
// El administrador general puede hacer todo y es el único que administra las
// cuentas (sección Usuarios). Es general quien tiene superadmin: true o una
// cuenta antigua sin mapa de permisos (el primer administrador, creado a mano).
// Los demás administradores tienen un mapa permissions: { agenda: true, … }.
// Las reglas de Firestore aplican lo mismo (firestore.rules).

export const PERMISSIONS = [
  { id: 'resumen', label: 'Resumen', hint: 'Ingresos, medios de pago y cantidad de exámenes.' },
  { id: 'agenda', label: 'Agenda', hint: 'Ver, crear, mover y cancelar citas.' },
  { id: 'examenes', label: 'Exámenes', hint: 'Ver, cargar, editar y eliminar exámenes y archivos.' },
  { id: 'pacientes', label: 'Pacientes', hint: 'Registrar y editar fichas de pacientes.' },
  { id: 'medicos', label: 'Médicos', hint: 'Crear cuentas de médicos.' },
  { id: 'cobros', label: 'Cobros', hint: 'Registrar, editar y eliminar cobros.' },
  { id: 'config', label: 'Servicios y horarios', hint: 'Servicios, precios y horario de la agenda en línea.' }
];

// Permiso que necesita cada sección del panel ('*' = solo el administrador general).
export const SECTION_PERMISSION = {
  resumen: 'resumen', agenda: 'agenda', examenes: 'examenes', carga: 'examenes',
  pacientes: 'pacientes', medicos: 'medicos', cobros: 'cobros', servicios: 'config', usuarios: '*'
};

export const isSuperAdmin = (u) => !!u && u.role === 'admin' && (u.superadmin === true || !u.permissions);

export function can(u, permission) {
  if (!u || u.role !== 'admin' || u.disabled) return false;
  if (isSuperAdmin(u)) return true;
  return permission !== '*' && !!(u.permissions && u.permissions[permission]);
}

// Mapa completo { permiso: true/false } a partir de lo que llegue del formulario.
export function normalizePermissions(input = {}) {
  return Object.fromEntries(PERMISSIONS.map((p) => [p.id, input[p.id] === true || input[p.id] === 'on']));
}
