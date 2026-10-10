// Perfil de visualización según el tipo de examen: título, herramientas,
// herramienta inicial, preajustes de contraste y avisos para el médico.

const NAV = ['pan', 'zoom', 'wl', 'magnify'];

// Preajustes de ventana. "auto" usa la ventana calculada para cada imagen.
const HU_PRESETS = [
  { id: 'auto', label: 'Auto' },
  { id: 'bone', label: 'Hueso', c: 500, w: 2500 },
  { id: 'dental', label: 'Dental', c: 1200, w: 4000 },
  { id: 'soft', label: 'Tejido blando', c: 50, w: 450 },
  { id: 'air', label: 'Vía aérea', c: -500, w: 1400 }
];

const RELATIVE_PRESETS = [
  { id: 'auto', label: 'Auto' },
  { id: 'contrast', label: 'Alto contraste', scale: 0.55 },
  { id: 'soft', label: 'Suave', scale: 1.6 }
];

export const PROFILES = {
  cbct: {
    title: 'Tomografía Cone Beam',
    tools: ['crosshair', ...NAV, '|', 'distance', 'angle', 'roi', 'probe', 'arrow', '|', 'curve'],
    defaultTool: 'crosshair'
  },
  pano: {
    title: 'Radiografía panorámica',
    tools: [...NAV, '|', 'distance', 'angle', 'roi', 'probe', 'arrow', 'calibrate'],
    defaultTool: 'pan',
    note: 'En una panorámica la magnificación no es uniforme: las medidas lineales son orientativas.'
  },
  ceph: {
    title: 'Cefalometría',
    tools: [...NAV, '|', 'angle', 'distance', 'roi', 'probe', 'arrow', 'calibrate'],
    defaultTool: 'pan',
    note: 'Para el análisis cefalométrico use Ángulo y Distancia. Si la imagen incluye la regla del cefalostato, verifique la escala con Calibrar.'
  },
  intraoral: {
    title: 'Radiografía intraoral',
    tools: [...NAV, '|', 'distance', 'angle', 'roi', 'probe', 'arrow', 'calibrate'],
    defaultTool: 'pan'
  },
  image: {
    title: 'Imágenes',
    tools: [...NAV, '|', 'distance', 'angle', 'roi', 'probe', 'arrow', 'calibrate'],
    defaultTool: 'pan'
  }
};

// Elige el perfil a partir de lo que se cargó y de la modalidad indicada al subir el estudio.
export function pickProfile(studyModality, data) {
  if (data.volumes.length) return 'cbct';
  const m = (studyModality || '').toLowerCase();
  if (m.startsWith('panor')) return 'pano';
  if (m.startsWith('cefal')) return 'ceph';
  if (m.startsWith('periap') || m.startsWith('intra')) return 'intraoral';
  const dicomMod = data.images[0] && data.images[0].meta.dataset ? data.images[0].meta.dataset.string('00080060') : '';
  if (dicomMod === 'PX') return 'pano';
  if (dicomMod === 'IO') return 'intraoral';
  return 'image';
}

export function windowPresets(target) {
  const hu = target.units === 'HU';
  return hu ? HU_PRESETS : RELATIVE_PRESETS;
}

// Ventana resultante de aplicar un preajuste a un frame o volumen.
export function applyPreset(preset, target) {
  if (preset.c !== undefined) return { c: preset.c, w: preset.w };
  const base = target.wl;
  if (preset.scale) return { c: base.c, w: base.w * preset.scale };
  return { ...base };
}
