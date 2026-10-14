// Visitas (grupos de exámenes): los exámenes (documentos de studies) de un mismo
// paciente, para los mismos médicos y en la misma fecha forman una visita, se
// hayan subido juntos o por separado. La visita no se guarda: se calcula a partir
// de los exámenes, así que si un examen cambia de médicos o de fecha pasa solo a
// la visita que corresponde.
//
// Un examen puede ser de varios médicos (doctorIds). Los exámenes antiguos solo
// tienen doctorId: doctorsOf() los trata igual.

export const doctorsOf = (s) => (Array.isArray(s.doctorIds) && s.doctorIds.length ? s.doctorIds : s.doctorId ? [s.doctorId] : []);
// Médicos sin repetir ni vacíos, en el orden elegido.
export const cleanDoctorIds = (ids) => [...new Set((ids || []).filter(Boolean))];

export const groupKey = (s, { byDoctor = true } = {}) => [s.patientId, byDoctor ? [...doctorsOf(s)].sort().join(',') : '', s.date].join('|');

const isPdf = (f) => /\.pdf$/i.test(f.name || '');
export const fileKind = (f) => (isPdf(f) ? 'pdf' : 'image');

// Momento de la última modificación de un examen (subida, archivos agregados,
// renombrados o borrados, o datos editados), en milisegundos. Firestore guarda
// Timestamp; el modo demostración, números.
const millis = (t) => (!t ? 0 : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : (t.seconds || 0) * 1000);
export const modifiedAt = (s) => millis(s.updatedAt) || millis(s.createdAt);

// [{ key, patientId, patientName, patientCode, patientAge, doctorIds, date,
//    studies, fileCount, totalSize, hasNew, hasReport, missingReports, modalities,
//    payState: 'paid' | 'partial' | 'unpaid' }] (más recientes primero).
// payState: la visita está pagada si todos sus exámenes tienen paid: true (se
// marcan al registrar un cobro de la visita o a mano desde el explorador).
// Dentro de cada visita, los exámenes van del modificado más recientemente al más antiguo.
// byDoctor: false agrupa solo por paciente y fecha (portal del médico).
export function groupStudies(studies, { byDoctor = true } = {}) {
  const map = new Map();
  for (const s of studies) {
    const key = groupKey(s, { byDoctor });
    let g = map.get(key);
    if (!g) {
      g = { key, patientId: s.patientId, patientName: s.patientName, patientCode: s.patientCode, patientAge: s.patientAge, doctorIds: byDoctor ? doctorsOf(s) : [], date: s.date, studies: [] };
      map.set(key, g);
    }
    g.studies.push(s);
  }
  return [...map.values()].map((g) => {
    g.studies.sort((a, b) => modifiedAt(b) - modifiedAt(a));
    const files = g.studies.flatMap((s) => s.files || []);
    return {
      ...g,
      fileCount: files.length,
      totalSize: g.studies.reduce((n, s) => n + (s.totalSize || 0), 0),
      hasNew: g.studies.some((s) => s.status === 'Nuevo'),
      hasReport: files.some(isPdf),
      missingReports: g.studies.filter((s) => s.modality !== 'Informe' && !(s.files || []).some(isPdf)).length,
      payState: payStateOf(g.studies),
      modalities: [...new Set(g.studies.map((s) => s.modality))]
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.patientName || '').localeCompare(b.patientName || '', 'es'));
}

export function payStateOf(studies) {
  const paid = studies.filter((s) => s.paid === true).length;
  return paid === 0 ? 'unpaid' : paid === studies.length ? 'paid' : 'partial';
}
export const PAY_STATE = { paid: 'Pagada', partial: 'Pago parcial', unpaid: 'Por cobrar' };

// Texto con el que se puede buscar una visita: paciente, expediente, médicos,
// códigos y modalidades, y la fecha en varios formatos (2026-10-08, 08/10/2026, 8 oct 2026).
export function groupSearchText(g, doctorName = '') {
  const d = g.date ? new Date(g.date + 'T12:00:00') : null;
  const dates = d ? [
    g.date,
    d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }),
    d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
  ] : [];
  return [g.patientName, g.patientCode, doctorName, ...g.studies.map((s) => s.code + ' ' + s.modality + ' ' + (s.description || '')), ...dates]
    .join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const searchTerm = (q) => String(q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Modalidades de un examen al cargarlo o editarlo. "Informe" es el PDF del informe.
export const STUDY_MODALITIES = ['CBCT', 'Panorámica', 'Cefalometría', 'Periapical', 'Informe', 'Otro'];
