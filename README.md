# DentFrucer · Portal DICOM

Portal web de **DentFrucer – Imagenología Dento Maxilo Facial** para consultar estudios DICOM.

> Landing, inicio de sesión y paneles conectados a **Firebase** (Authentication, Firestore, Storage), con visor DICOM integrado.

## Páginas

| Archivo | Descripción |
| --- | --- |
| `index.html` | Landing pública de la clínica; el acceso es para médicos |
| `agendar.html` | Agenda en línea para pacientes, sin crear cuenta |
| `login.html` | Inicio de sesión de médicos |
| `portal.html` | Portal del médico: solo los estudios asignados a él |
| `admin-login.html` | Acceso de administración (no enlazado desde la landing) |
| `admin.html` | Panel: agenda, carga de estudios, pacientes y médicos |
| `resultados.html` | Resultados para pacientes con visor de solo lectura (**acceso desactivado**, ver abajo) |

## Firebase

Siga **[FIREBASE.md](FIREBASE.md)** para crear el proyecto, el primer administrador, publicar las reglas de seguridad y la página.

Sin configurar Firebase el sitio funciona en **modo demostración** (datos de ejemplo en memoria):

- Médico: `doctor@dentfrucer.com` / `demo1234`
- Administrador: `admin@dentfrucer.com` / `demo1234`

Con Firebase ya configurado, agregue `?demo=1` a la URL (por ejemplo `login.html?demo=1`) para probar la interfaz con datos de ejemplo sin tocar datos reales; `?demo=0` vuelve al modo normal.

## Agenda de pacientes

En **`agendar.html`** el paciente elige el examen, el día y la hora libres y deja **nombre y apellido** (obligatorios), **correo** y **teléfono** (opcionales) y, si quiere, el médico que lo envía. No crea ninguna cuenta. Al confirmar:

- se guarda la **cita** y se ocupa el **turno** (nadie más puede tomarlo);
- se crea el **paciente** en la lista de la clínica (si ya había agendado con el mismo nombre y correo/teléfono, no se duplica);
- el paciente ve un código de cita y puede agregarla a su calendario (.ics).

En el panel de administración, la sección **Agenda** muestra las citas de hoy, las próximas y las anteriores, y permite **crear, editar y borrar citas** (cambiar el día o la hora mueve el turno; cancelar o borrar lo libera). **Cargar estudio** desde una cita rellena el paciente, la modalidad y la fecha, sugiere el médico que indicó el paciente y, al subir los archivos, la cita queda como *Atendida*.

Horarios, duración de los turnos, días cerrados, tipos de examen e indicaciones se editan en `assets/js/config/agenda-config.js`. En modo demostración (`agendar.html?demo=1`) las citas se guardan solo en la pestaña del navegador. Un enlace como `agendar.html?examen=CBCT` deja el examen preseleccionado.

## Pacientes, estudios y médicos

Los **pacientes no tienen médico**: la ficha guarda solo identidad y contacto (nombre, apellido, expediente, edad, correo, teléfono) y se edita desde la tabla *Pacientes*. Cada **estudio** pertenece a un paciente **y** a un médico, que se elige al cargarlo y se puede cambiar en la tabla *Estudios*. El médico ve en su portal los estudios que tiene asignados, y su lista *Mis pacientes* sale de esos estudios. Un mismo paciente puede tener estudios para médicos distintos.

### Grupos de exámenes y explorador

- Los exámenes de un mismo **paciente**, para un mismo **médico** y en la misma **fecha** forman un **grupo**, se suban juntos o por separado. El grupo se calcula a partir de los exámenes: si uno cambia de médico o de fecha, pasa solo al grupo que corresponde.
- **Cargar estudio** admite varios exámenes en una subida (por ejemplo CBCT + panorámica + informe PDF), cada uno con su modalidad y sus archivos, y avisa si se sumarán a un grupo existente.
- La tabla de **estudios** muestra un grupo por fila. Se busca por paciente, médico, código, examen o **fecha** ("08/10/2026", "8 oct 2026", "oct 2026") y se filtra por un día.
- El **explorador** se abre desde un grupo, desde un paciente (todas sus visitas por fecha) o desde un médico (sus pacientes y las visitas de cada uno), con migas de pan para moverse entre niveles.
- **Dentro de un grupo** se puede:
  - **Exámenes**: verlos en el visor, editar modalidad, descripción, fecha y médico, agregar otro examen (por ejemplo el informe) y eliminarlos.
  - **Archivos**: subir más, abrir los PDF, descargar, renombrar y eliminar.
  - **Médico**: cambiar el de todo el grupo de una vez.
- En el **portal del médico** los exámenes también se ven agrupados por **visita** (paciente + fecha), con sus informes, búsqueda por paciente, examen o fecha, filtro por día y por modalidad, y «Ver exámenes» desde *Mis pacientes*.
- Los **informes PDF** se suben como un examen de modalidad *Informe* o como archivos de otro examen; en el visor aparecen en la pestaña *Informes*.

## Resultados para pacientes (desactivado)

`resultados.html?t=…` muestra al paciente su estudio y abre el **visor de solo lectura**: navegar, contraste, lupa, girar e invertir, **guardar la imagen** (PNG) y **descargar los archivos** originales; sin mediciones, notas, implantes ni etiquetas DICOM completas. Está pensado para abrirse con un enlace enviado por correo.

El acceso está **desactivado** (`assets/js/config/patient-access.js`, `enabled: false`): la página responde "Acceso no disponible" y no carga ningún dato. Solo se puede probar en modo demostración, con un estudio de ejemplo: `resultados.html?demo=1&t=EST-2026-0418` (CBCT) o `…&t=EST-2026-0415` (panorámica). Lo que falta para activarlo está en [FIREBASE.md](FIREBASE.md#acceso-de-pacientes-pendiente).

## Visor

Se abre con **Abrir** en el portal (o el ojo en el panel de administración) y elige el modo según el estudio:

- **CBCT**: axial, coronal y sagital enlazados con cruz de navegación; espesor de corte (MIP); 3D (hueso, piel, rayos X); panorámica reconstruida trazando una curva sobre el arco; cortes transversales.
- **Distribución Implantes** (CBCT): axial con la curva, panorámica reconstruida y una tira de 5 cortes transversales consecutivos (cada 0,5/1/2/3 mm) con zoom sincronizado; la línea del corte axial se ve en la panorámica y en los cortes.
- **Panorámica, cefalometría, intraorales**: visor 2D, mosaico de 1/2/4 imágenes, miniaturas.
- **Herramientas**: mover, zoom, contraste (ventana/nivel con preajustes Hueso/Dental/Tejido blando/Vía aérea), lupa, distancia, ángulo, área con densidad media, densidad puntual, notas con flecha, calibración, girar/voltear/invertir, ocultar datos del paciente (`O`), deshacer.
- **Implante simulado** (`P`): se arrastra de la plataforma al ápice (longitud comercial más cercana), se inclina arrastrando un extremo y se cambia diámetro/longitud con doble clic; muestra el eje protésico y un margen de seguridad de 1,5 mm (2 mm en el ápice).
- **Entrega**: lista de mediciones (copiar resumen), exportar a PNG lo que se ve en pantalla (todos los paneles, con orientación y escala) con encabezado de la clínica, imprimir, descargar originales, información y etiquetas DICOM. Al cerrar con mediciones, el visor pide confirmación (las mediciones no se guardan).
- En CBCT los valores de gris no son unidades Hounsfield calibradas: el visor lo indica en las herramientas de densidad.
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
admin-login.html, admin.html, agendar.html,
resultados.html
assets/css/styles.css                    estilos del sitio (paleta de marca)
assets/css/viewer.css                    estilos del visor (tema oscuro)
assets/img/                              logotipos
assets/js/
  app.js                 punto de entrada: carga el módulo de cada página
  config/                Firebase, agenda (horarios, exámenes) y acceso de pacientes
  services/
    backend.js           elige el backend y documenta el modelo de datos
    backend/firebase.js  implementación con Firebase
    backend/demo.js      implementación de demostración (datos de ejemplo)
    backend/shared.js    utilidades comunes a ambas
    mode.js              ¿modo demostración?
    agenda.js            turnos, estados y validación de las citas
    people.js            validación de nombres y contacto de pacientes
  ui/                    utilidades compartidas: iconos, modales, formatos
  pages/                 lógica de cada página: landing, login, portal, agenda, results
    admin/               panel: index (estado) + agenda, studies, upload, people
  viewer/
    index.js             abre el visor (completo o de solo lectura) y elige el modo
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
