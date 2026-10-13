// Grupos de exámenes: los exámenes (estudios) de un mismo paciente, para un
// mismo médico y en la misma fecha forman un grupo, se hayan subido juntos o
// por separado. El grupo no se guarda: se calcula a partir de los estudios,
// así que si un examen cambia de médico o de fecha pasa solo a su nuevo grupo.

export const groupKey = (s) => [s.patientId, s.doctorId || '', s.date].join('|');

const isPdf = (f) => /\.pdf$/i.test(f.name || '');
export const fileKind = (f) => (isPdf(f) ? 'pdf' : 'image');

// [{ key, patientId, patientName, patientCode, patientAge, doctorId, date,
//    studies, fileCount, totalSize, hasNew, hasReport, modalities }] (más recientes primero)
export function groupStudies(studies) {
  const map = new Map();
  for (const s of studies) {
    const key = groupKey(s);
    let g = map.get(key);
    if (!g) {
      g = { key, patientId: s.patientId, patientName: s.patientName, patientCode: s.patientCode, patientAge: s.patientAge, doctorId: s.doctorId || null, date: s.date, studies: [] };
      map.set(key, g);
    }
    g.studies.push(s);
  }
  return [...map.values()].map((g) => {
    const files = g.studies.flatMap((s) => s.files || []);
    return {
      ...g,
      fileCount: files.length,
      totalSize: g.studies.reduce((n, s) => n + (s.totalSize || 0), 0),
      hasNew: g.studies.some((s) => s.status === 'Nuevo'),
      hasReport: files.some(isPdf),
      modalities: [...new Set(g.studies.map((s) => s.modality))]
    };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.patientName || '').localeCompare(b.patientName || '', 'es'));
}

// Texto con el que se puede buscar un grupo: paciente, expediente, médico,
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
