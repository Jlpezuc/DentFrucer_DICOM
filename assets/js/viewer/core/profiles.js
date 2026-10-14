// Perfil de visualización según el tipo de examen: título, herramientas,
// herramienta inicial, preajustes de contraste y avisos para el médico.
// hints: textos de ayuda propios del perfil que reemplazan a los de core/tools.js.

// El contraste no es una herramienta de arrastre: se ajusta con los controles
// deslizantes de brillo y contraste del pie (y los preajustes).
const NAV = ['pan', 'zoom', 'magnify'];

// Visor de solo lectura (pacientes): navegar y ver, sin medir ni anotar.
export const VIEW_ONLY = {
  tools: new Set(['crosshair', 'pan', 'zoom', 'magnify']),
  actions: ['rotate', 'invert', 'fit', 'reset']
};

// Herramientas de un perfil que quedan en el visor de solo lectura (sin separadores sobrantes).
export function viewOnlyTools(tools) {
  const out = [];
  for (const t of tools) {
    if (t === '|') { if (out.length && out[out.length - 1] !== '|') out.push(t); } else if (VIEW_ONLY.tools.has(t)) out.push(t);
  }
  if (out[out.length - 1] === '|') out.pop();
  return out;
}

// En un CBCT los valores de gris dependen del equipo, del campo de visión y de la
// posición: no son unidades Hounsfield fiables para estimar densidad ósea.
const CBCT_DENSITY_NOTE = 'En tomografía Cone Beam los valores de gris no son unidades Hounsfield calibradas: úselos para comparar zonas del mismo examen, no como densidad absoluta.';

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
    tools: ['crosshair', ...NAV, '|', 'distance', 'angle', 'roi', 'probe', 'arrow', '|', 'curve', 'implant'],
    defaultTool: 'crosshair',
    hints: {
      roi: 'Arrastre para dibujar una elipse: muestra el área y el valor medio. ' + CBCT_DENSITY_NOTE,
      probe: 'Haga clic para fijar el valor en un punto. ' + CBCT_DENSITY_NOTE
    },
    densityNote: CBCT_DENSITY_NOTE
  },
  pano: {
    title: 'Radiografía panorámica',
    tools: [...NAV, '|', 'distance', 'angle', 'roi', 'probe', 'arrow', 'calibrate', 'implant'],
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
    tools: [...NAV, '|', 'distance', 'angle', 'roi', 'probe', 'arrow', 'calibrate', 'implant'],
    defaultTool: 'pan'
  },
  image: {
    title: 'Imágenes',
    tools: [...NAV, '|', 'distance', 'angle', 'roi', 'probe', 'arrow', 'calibrate'],
    defaultTool: 'pan'
  }
};

// Tipo de examen según el nombre del servicio ("Radiografía panorámica"…):
// 'cbct' | 'pano' | 'ceph' | 'intraoral' | '' (sin pista).
export function examKind(text) {
  const t = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/cbct|cone ?beam|tomograf/.test(t)) return 'cbct';
  if (/panoram|ortopantomo/.test(t)) return 'pano';
  if (/cefalo|telerradio/.test(t)) return 'ceph';
  if (/periapic|intraoral|aleta|bite/.test(t)) return 'intraoral';
  return '';
}

// Elige el perfil a partir de lo que se cargó (volumen, etiqueta DICOM) y del
// nombre del servicio del examen.
export function pickProfile(serviceText, data) {
  if (data.volumes.length) return 'cbct';
  const kind = examKind(serviceText);
  if (kind === 'pano' || kind === 'ceph' || kind === 'intraoral') return kind;
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
