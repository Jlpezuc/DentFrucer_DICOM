# DentFrucer · Portal DICOM

Portal web de **DentFrucer – Imagenología Dento Maxilo Facial** para consultar estudios DICOM.

> Landing, inicio de sesión y paneles conectados a **Firebase** (Authentication, Firestore, Storage), con visor DICOM integrado.

## Páginas

| Archivo | Descripción |
| --- | --- |
| `index.html` | Landing pública de la clínica; el acceso es para médicos |
| `login.html` | Inicio de sesión de médicos |
| `portal.html` | Portal del médico: solo los estudios de sus pacientes |
| `admin-login.html` | Acceso de administración (no enlazado desde la landing) |
| `admin.html` | Panel: carga de estudios, pacientes, médicos y asignaciones |

## Firebase

Siga **[FIREBASE.md](FIREBASE.md)** para crear el proyecto, el primer administrador, publicar las reglas de seguridad y la página.

Sin configurar Firebase el sitio funciona en **modo demostración** (datos de ejemplo en memoria):

- Médico: `doctor@dentfrucer.com` / `demo1234`
- Administrador: `admin@dentfrucer.com` / `demo1234`

Con Firebase ya configurado, agregue `?demo=1` a la URL (por ejemplo `login.html?demo=1`) para probar la interfaz con datos de ejemplo sin tocar datos reales; `?demo=0` vuelve al modo normal.

## Visor

Se abre con **Abrir** en el portal (o el ojo en el panel de administración) y elige el modo según el estudio:

- **CBCT**: axial, coronal y sagital enlazados con cruz de navegación; espesor de corte (MIP); 3D (hueso, piel, rayos X); panorámica reconstruida trazando una curva sobre el arco; cortes transversales para planificación de implantes.
- **Panorámica, cefalometría, intraorales**: visor 2D, mosaico de 1/2/4 imágenes, miniaturas.
- **Herramientas**: mover, zoom, contraste (ventana/nivel con preajustes Hueso/Dental/Tejido blando/Vía aérea), lupa, distancia, ángulo, área con densidad media, densidad puntual (HU), notas con flecha, calibración, girar/voltear/invertir, deshacer.
- **Entrega**: lista de mediciones (copiar resumen), exportar la vista a PNG con encabezado de la clínica, imprimir, descargar originales, información y etiquetas DICOM.
- Atajos de teclado: pulse `?` dentro del visor.

## Probar en local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Los scripts son módulos ES: abra el sitio con un servidor (no con `file://`).

## Estructura

```
index.html, login.html, portal.html,      páginas
admin-login.html, admin.html
assets/css/styles.css                    estilos del sitio (paleta de marca)
assets/css/viewer.css                    estilos del visor (tema oscuro)
assets/img/                              logotipos
assets/js/
  app.js                 punto de entrada: carga el módulo de cada página
  config/                configuración de Firebase
  services/backend.js    datos: Firebase o modo demostración
  ui/                    utilidades compartidas: iconos, modales, formatos
  pages/                 lógica de cada página (landing, login, admin, portal)
  viewer/
    index.js             abre el visor y elige el modo
    shell.js             estructura visual: encabezado, barras, paneles
    data/                lectura DICOM, píxeles, ZIP, imágenes, volúmenes
    core/                viewport, herramientas, mediciones, 3D, exportación
    modes/               visor CBCT, visor 2D, informes PDF
    demo/                datos sintéticos para el modo demostración
firestore.rules, storage.rules           reglas de seguridad
cors.json                                acceso del visor a Storage (ver FIREBASE.md)
firebase.json                            Hosting + reglas para `firebase deploy`
```

## Paleta

| Token | Color | Uso |
| --- | --- | --- |
| `--blue-500` | `#0e9ad3` | Azul del logotipo (DENT) |
| `--blue-700` | `#09658c` | Botones y enlaces sobre blanco |
| `--lime-500` | `#8dc63f` | Verde lima del isotipo (FRUCER) |
| `--green-600` | `#287a45` | Texto verde sobre blanco |
| `--teal-600` | `#07967f` | Superposición azul/verde |
| `--ink` | `#1f2a33` | Texto principal |
