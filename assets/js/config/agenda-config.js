// Agenda de DentFrucer: horarios, servicios y textos de la cita.
// Horario y servicios son valores iniciales: se editan desde el panel
// (Servicios y horarios, ver services/settings.js). Las horas son la hora local
// de la clínica.

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

  // Servicios (tipos de examen) que se pueden agendar y cobrar. Son los valores
  // iniciales: desde el panel (Servicios y horarios) se editan, y lo guardado
  // allí reemplaza esta lista y el horario de arriba.
  //   id      no cambia nunca (lo guardan las citas y los exámenes)
  //   label   nombre del servicio: es lo que se ve en toda la página
  //   price   valor en pesos, para los cobros
  //   active  false = no aparece en la agenda en línea
  exams: [
    { id: 'CBCT', label: 'Tomografía Cone Beam (CBCT)', detail: 'Volumen 3D de maxilar, mandíbula, ATM o senos maxilares.', price: 0, active: true },
    { id: 'Panorámica', label: 'Radiografía panorámica', detail: 'Ortopantomografía digital de toda la boca.', price: 0, active: true },
    { id: 'Cefalometría', label: 'Cefalometría', detail: 'Telerradiografía de cráneo para ortodoncia.', price: 0, active: true },
    { id: 'Periapical', label: 'Radiografías intraorales', detail: 'Periapicales, aleta de mordida o serie completa.', price: 0, active: true },
    { id: 'Otro', label: 'Otro examen', detail: 'Si no sabe cuál, elija este y lo orientamos en la clínica.', price: 0, active: true }
  ],

  // Datos que se muestran en la confirmación y en el archivo de calendario.
  clinic: {
    name: 'DentFrucer · Imagenología Dento Maxilo Facial',
    address: '[Dirección del centro]',
    phone: '[000 000 0000]'
  },
  instructions: [
    'Llegue 10 minutos antes de su hora.',
    'Traiga la orden de su médico y exámenes anteriores, si los tiene.',
    'Antes del examen se le pedirá retirar aretes, piercings, lentes y prótesis removibles.'
  ]
};
