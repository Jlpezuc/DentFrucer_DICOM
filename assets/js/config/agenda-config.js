// Agenda pública de DentFrucer: horarios, exámenes y textos de la cita.
// Edite estos valores para cambiar lo que ven los pacientes en agendar.html.
// Las horas son la hora local de la clínica.

export const agendaConfig = {
  // Duración de cada turno (minutos). Un paciente por turno.
  slotMinutes: 20,

  // Horario por día de la semana (0 = domingo … 6 = sábado): rangos [inicio, fin).
  // Un día sin entrada está cerrado.
  hours: {
    1: [['09:00', '13:00'], ['14:00', '19:00']],
    2: [['09:00', '13:00'], ['14:00', '19:00']],
    3: [['09:00', '13:00'], ['14:00', '19:00']],
    4: [['09:00', '13:00'], ['14:00', '19:00']],
    5: [['09:00', '13:00'], ['14:00', '19:00']]
  },

  // Cuántos días hacia adelante se puede agendar y con cuánta anticipación mínima.
  daysAhead: 45,
  minNoticeMinutes: 120,

  // Días sin atención (feriados, vacaciones): 'AAAA-MM-DD'.
  closedDates: ['2026-12-25', '2027-01-01'],

  // Tipos de examen. "id" coincide con la modalidad al cargar el estudio.
  // Si agrega o renombra un id, actualice también la lista "exam in [...]" de firestore.rules.
  exams: [
    { id: 'CBCT', label: 'Tomografía Cone Beam (CBCT)', detail: 'Volumen 3D de maxilar, mandíbula, ATM o senos maxilares.' },
    { id: 'Panorámica', label: 'Radiografía panorámica', detail: 'Ortopantomografía digital de toda la boca.' },
    { id: 'Cefalometría', label: 'Cefalometría', detail: 'Telerradiografía de cráneo para ortodoncia.' },
    { id: 'Periapical', label: 'Radiografías intraorales', detail: 'Periapicales, aleta de mordida o serie completa.' },
    { id: 'Otro', label: 'Otro examen', detail: 'Si no sabe cuál, elija este y lo orientamos en la clínica.' }
  ],

  // Datos que se muestran en la confirmación y en el archivo de calendario.
  clinic: {
    name: 'DentFrucer · Imagenología Dento Maxilo Facial',
    address: '[Dirección del centro]',
    phone: '[000 000 0000]'
  },
  instructions: [
    'Llegue 10 minutos antes de su hora.',
    'Traiga la orden de su médico y estudios anteriores, si los tiene.',
    'Antes del examen se le pedirá retirar aretes, piercings, lentes y prótesis removibles.'
  ]
};
