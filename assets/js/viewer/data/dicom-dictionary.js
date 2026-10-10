// Diccionario reducido de etiquetas DICOM: VR (para archivos "implicit VR")
// y nombre legible para el panel de información.
// Clave: 'ggggeeee' en hexadecimal minúsculo.

export const TAGS = {
  // Meta y SOP
  '00020010': ['UI', 'Sintaxis de transferencia'],
  '00080016': ['UI', 'SOP Class UID'],
  '00080018': ['UI', 'SOP Instance UID'],
  '00080008': ['CS', 'Tipo de imagen'],
  // Estudio / serie
  '00080020': ['DA', 'Fecha del estudio'],
  '00080021': ['DA', 'Fecha de la serie'],
  '00080022': ['DA', 'Fecha de adquisición'],
  '00080030': ['TM', 'Hora del estudio'],
  '00080050': ['SH', 'N.º de acceso'],
  '00080060': ['CS', 'Modalidad'],
  '00080070': ['LO', 'Fabricante'],
  '00080080': ['LO', 'Institución'],
  '00080090': ['PN', 'Médico remitente'],
  '00081030': ['LO', 'Descripción del estudio'],
  '0008103e': ['LO', 'Descripción de la serie'],
  '00081090': ['LO', 'Modelo del equipo'],
  '00081010': ['SH', 'Estación'],
  // Paciente
  '00100010': ['PN', 'Paciente'],
  '00100020': ['LO', 'ID del paciente'],
  '00100030': ['DA', 'Fecha de nacimiento'],
  '00100040': ['CS', 'Sexo'],
  '00101010': ['AS', 'Edad'],
  // Adquisición
  '00180015': ['CS', 'Región anatómica'],
  '00180050': ['DS', 'Grosor de corte (mm)'],
  '00180060': ['DS', 'kVp'],
  '00180088': ['DS', 'Espaciado entre cortes (mm)'],
  '00181000': ['LO', 'N.º de serie del equipo'],
  '00181020': ['LO', 'Versión de software'],
  '00181030': ['LO', 'Protocolo'],
  '00181110': ['DS', 'Distancia fuente-detector (mm)'],
  '00181111': ['DS', 'Distancia fuente-paciente (mm)'],
  '00181114': ['DS', 'Factor de magnificación'],
  '00181150': ['IS', 'Tiempo de exposición (ms)'],
  '00181151': ['IS', 'Corriente del tubo (mA)'],
  '00181152': ['IS', 'Exposición (mAs)'],
  '00181164': ['DS', 'Espaciado del detector (mm)'],
  '00181210': ['SH', 'Kernel de reconstrucción'],
  '00185101': ['CS', 'Proyección'],
  // Relación espacial
  '0020000d': ['UI', 'Study Instance UID'],
  '0020000e': ['UI', 'Series Instance UID'],
  '00200011': ['IS', 'N.º de serie'],
  '00200013': ['IS', 'N.º de imagen'],
  '00200032': ['DS', 'Posición de la imagen (mm)'],
  '00200037': ['DS', 'Orientación de la imagen'],
  '00201041': ['DS', 'Posición del corte (mm)'],
  // Imagen
  '00280002': ['US', 'Muestras por píxel'],
  '00280004': ['CS', 'Interpretación fotométrica'],
  '00280006': ['US', 'Configuración planar'],
  '00280008': ['IS', 'Número de cuadros'],
  '00280010': ['US', 'Filas'],
  '00280011': ['US', 'Columnas'],
  '00280030': ['DS', 'Espaciado de píxel (mm)'],
  '00280100': ['US', 'Bits asignados'],
  '00280101': ['US', 'Bits almacenados'],
  '00280102': ['US', 'Bit alto'],
  '00280103': ['US', 'Representación de píxel'],
  '00281050': ['DS', 'Centro de ventana'],
  '00281051': ['DS', 'Ancho de ventana'],
  '00281052': ['DS', 'Intercepto de reescala'],
  '00281053': ['DS', 'Pendiente de reescala'],
  '00281054': ['LO', 'Tipo de reescala'],
  '00282110': ['CS', 'Compresión con pérdida'],
  // Secuencias de imágenes multicuadro ("enhanced")
  '52009229': ['SQ', 'Grupos funcionales compartidos'],
  '52009230': ['SQ', 'Grupos funcionales por cuadro'],
  '00209113': ['SQ', 'Posición del plano'],
  '00209116': ['SQ', 'Orientación del plano'],
  '00289110': ['SQ', 'Medidas de píxel'],
  '00289145': ['SQ', 'Transformación de valores'],
  '00289132': ['SQ', 'Ventana'],
  '7fe00010': ['OW', 'Datos de píxel']
};

export const UID_NAMES = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
  '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR Little Endian',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline (8 bits)',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended (12 bits)',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless SV1',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.5': 'RLE Lossless'
};

export function tagName(tag) {
  const t = TAGS[tag];
  return t ? t[1] : '(' + tag.slice(0, 4).toUpperCase() + ',' + tag.slice(4).toUpperCase() + ')';
}

export function tagVR(tag) {
  const t = TAGS[tag];
  if (t) return t[0];
  if (tag.endsWith('0000')) return 'UL'; // longitud de grupo
  return 'UN';
}
