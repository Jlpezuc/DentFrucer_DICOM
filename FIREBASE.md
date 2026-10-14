# Configurar Firebase

El portal usa tres servicios de Firebase:

| Servicio | Para qué |
| --- | --- |
| **Authentication** (correo y contraseña) | Inicio de sesión de médicos y administradores |
| **Cloud Firestore** | Médicos, pacientes, exámenes y agenda (`users`, `patients`, `studies`, `appointments`, `slots`) |
| **Cloud Storage** | Archivos DICOM de cada examen (`studies/{id}/…`) |
| **Hosting** (opcional) | Publicar la página, gratis y con HTTPS |

Mientras `assets/js/config/firebase-config.js` tenga los valores `TU_…`, el sitio funciona en **modo demostración**, con datos de ejemplo.

## 1. Crear el proyecto

1. Entre a <https://console.firebase.google.com> y pulse **Agregar proyecto** (por ejemplo `dentfrucer`). Google Analytics no hace falta.
2. En la página del proyecto pulse el icono **Web (`</>`)**, registre la app (nombre: `portal`) y copie el objeto `firebaseConfig`.
3. Pegue esos valores en `assets/js/config/firebase-config.js` (solo los valores del objeto, sin las líneas `import`). No son secretos: la seguridad la dan las reglas del paso 4.

## 2. Activar los servicios

1. **Authentication** → *Comenzar* → *Sign-in method* → habilite **Correo electrónico/contraseña**.
2. **Firestore Database** → *Crear base de datos* → **modo de producción** → elija una ubicación cercana (no se puede cambiar después).
3. **Storage** → *Comenzar*.
   > Desde octubre de 2024, Google exige el plan **Blaze** (pago por uso) para usar Storage en proyectos nuevos. Sigue incluyendo una cuota gratuita (5 GB almacenados), pero un CBCT pesa unos 300–400 MB, así que con el tiempo habrá un costo pequeño (unos USD 0,026 por GB al mes). Configure una **alerta de presupuesto** en Google Cloud al activar Blaze.

## 3. Crear el primer administrador

Las cuentas de médicos se crean desde el panel, pero el primer administrador se crea a mano:

1. **Authentication** → *Usuarios* → *Agregar usuario*: correo y contraseña del administrador. Copie su **UID**.
2. **Firestore Database** → *Iniciar colección* → ID `users` → ID del documento: **el UID copiado**. Campos:
   - `name` (string): `Administración`
   - `email` (string): el correo
   - `role` (string): `admin`

Para entrar como administrador use **`/admin-login.html`**. Esa página no está enlazada desde la landing.

Este primer administrador (sin campo `permissions`) es **administrador general**: puede todo. Los demás administradores se crean desde el panel, en **Usuarios**, con su descripción y sus permisos (o como administradores generales). No hace falta volver a tocar Firestore a mano.

## 4. Publicar reglas de seguridad y la página

Las reglas (`firestore.rules`, `storage.rules`) garantizan que cada médico solo lea **sus** exámenes y sus archivos (los que tiene asignados, aunque compartan el examen con otros médicos), y que cada administrador solo modifique lo que sus **permisos** le permiten (el administrador general, todo). También permiten que cualquier persona, sin cuenta, **cree** una cita desde `agendar.html` (solo de los servicios activos) y lea los servicios y el horario, pero no que lea, cambie o borre citas, pacientes ni cobros.

> **Importante:** cada vez que cambie `firestore.rules` o `storage.rules` en el repositorio, vuelva a publicar **las dos**. Los permisos, los cobros, los servicios y los exámenes con varios médicos necesitan las reglas actuales: con unas anteriores aparecen errores de permiso (por ejemplo al guardar un cobro o el horario).

Con la [CLI de Firebase](https://firebase.google.com/docs/cli) (necesita Node.js):

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # elija su proyecto
firebase deploy             # publica reglas + la página en Hosting
```

La página quedará en `https://SU-PROYECTO.web.app`. Firebase Hosting es gratis y funciona aunque el repositorio de GitHub sea privado.

Sin la CLI: copie el contenido de `firestore.rules` en *Firestore → Reglas* y el de `storage.rules` en *Storage → Reglas*, y pulse **Publicar** en cada una.

> Si publica la página en otro dominio (GitHub Pages o uno propio), agréguelo en *Authentication → Configuración → Dominios autorizados*.

## 5. Permitir que el visor lea los archivos (CORS)

El visor descarga los archivos DICOM directamente desde Storage para mostrarlos. Google bloquea esas descargas desde otra web hasta que se autoriza el dominio de la página (configuración "CORS" del bucket). Se hace **una sola vez**, desde el navegador:

1. Abra Cloud Shell de su proyecto: <https://console.cloud.google.com/?cloudshell=true&project=dentfrucer-28e0f> (una terminal dentro del navegador; no hay que instalar nada).
2. Pegue estos dos comandos y pulse Enter:

   ```bash
   echo '[{"origin":["https://jlpezuc.github.io","https://dentfrucer-28e0f.web.app","https://dentfrucer-28e0f.firebaseapp.com"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
   gcloud storage buckets update gs://dentfrucer-28e0f.firebasestorage.app --cors-file=cors.json
   ```

3. Listo. Si más adelante usa un dominio propio, agréguelo a la lista y repita el paso 2. El archivo `cors.json` del repositorio tiene la misma configuración.

Si falta este paso, el visor muestra: *"No se pudieron descargar las imágenes… revise la configuración CORS"*.

## El visor

Al abrir un examen, el visor elige el modo según su contenido:

| Contenido | Modo |
| --- | --- |
| Serie de cortes o archivo multicuadro (CBCT) | Tres planos enlazados (axial, coronal, sagital), 3D, panorámica reconstruida por curva y cortes transversales |
| Panorámica, cefalometría, intraorales, fotos | Visor 2D con mosaico de 1, 2 o 4 imágenes y miniaturas |
| Informes PDF | Visor de documentos (o pestaña *Informes* junto a las imágenes) |

Formatos que abre: DICOM sin compresión (Explicit/Implicit VR, Big Endian, Deflated), RLE, JPEG Baseline, archivos ZIP con la exportación del equipo, PNG/JPG y PDF. Los DICOM con JPEG 2000, JPEG-LS o JPEG Lossless no se pueden decodificar en el navegador: el visor lo indica y ofrece descargarlos.

**Recomendación al cargar un CBCT:** suba la carpeta de la serie completa (botón *Seleccionar carpeta*) o un ZIP con ella. El visor reconstruye el volumen con todos los cortes.

## La agenda

- Cada cita guarda nombre, apellido, correo y teléfono (opcionales), médico que envía, examen, fecha y hora. Solo la ve un administrador.
- Los turnos ocupados se guardan aparte en `slots/{fecha_hora}`, sin datos personales: es lo único que la página pública puede leer. Como el ID del documento es el turno, dos personas no pueden reservar la misma hora.
- Al agendar se crea el paciente en `patients` con `source: 'agenda'`. Si la misma persona vuelve a agendar con el mismo nombre y correo (o teléfono), se reutiliza su ficha.
- En el panel se pueden **crear, editar y borrar** citas. Cambiar el día o la hora mueve el turno (dentro de una transacción, para no pisar otra cita); cancelar o borrar lo libera. Las citas fuera de horario (por ejemplo un sábado) se pueden crear desde el panel.
- Servicios (con precio), horarios, duración de turnos y feriados se editan en el panel (*Servicios y horarios*) y se guardan en `settings/agenda`, que la página pública lee. Las reglas solo dejan agendar en línea los servicios activos (`settings/agenda.examIds`). Mientras no se guarde nada se usan los valores de `assets/js/config/agenda-config.js`.
- **Recomendado:** active [App Check](https://firebase.google.com/docs/app-check) con reCAPTCHA para que solo su página pueda crear citas; sin él, un robot podría llenar la agenda con citas falsas. La página ya incluye un campo trampa básico contra robots simples.
- El correo de confirmación automático no está incluido (necesita un servidor, por ejemplo la extensión *Trigger Email* de Firebase). El paciente recibe la confirmación en pantalla y un archivo de calendario.

## Uso diario

1. **Agenda**: revise las citas del día; cree, edite o borre citas (por ejemplo las que llegan por teléfono) y regístrelas como cobradas con *Cobrar*.
2. **Cargar examen**: use *Cargar* en la cita (o elija el paciente), elija **uno o varios médicos** que reciben los exámenes (se sugiere el que el paciente indicó al agendar, o los de su último examen) y agregue uno o varios exámenes con sus archivos (DICOM, ZIP, imágenes o informes PDF). Quedan en la visita del paciente, aparecen de inmediato en el portal de cada médico y la cita queda como atendida.
3. **Explorador**: abra una visita desde la tabla *Exámenes*, o todas las de un paciente o de un médico (clic en su fila). Allí se ven, editan, renombran, descargan y eliminan archivos, se suben archivos o exámenes nuevos (por ejemplo el informe, días después) y se registra el cobro.
4. **Pacientes**: se crean solos al agendar; *Nuevo paciente* es para quien no agendó en línea. Con el lápiz se completan el expediente y la edad, que se copian también en sus exámenes.
5. **Médicos**: *Nuevo* crea su cuenta. Comparta el correo y la contraseña inicial por un canal seguro; el médico puede cambiarla con *¿Olvidó su contraseña?*.
6. **Cobros, Resumen, Servicios y horarios, Usuarios**: ver el README.

## Modelo de datos

```
users/{uid}      name, email, role ('admin' | 'doctor'), specialty (médicos),
                 description, superadmin, permissions { resumen, agenda, examenes, pacientes,
                 medicos, cobros, config }, disabled (administradores)
patients/{id}    name, firstName, lastName, email, phone, code, age, source ('agenda' | 'panel')
                 sin médico: solo la clínica lee esta colección
studies/{id}     code, patientId, patientName, patientCode, patientAge, doctorIds[], doctorId (el primero),
                 serviceId, service (nombre del servicio al cargarlo), description (detalle opcional),
                 date (YYYY-MM-DD), files[{name, path, size}],
                 totalSize, status ('Nuevo' | 'Visto'), paid (visita pagada), createdAt, updatedAt
appointments/{id}  code, firstName, lastName, name, email, phone, referrer, exam,
                 date (YYYY-MM-DD), time (HH:MM), slotId, patientId,
                 status ('Pendiente' | 'Atendida' | 'No asistió' | 'Cancelada'), createdAt
slots/{fecha_hora} date, time, appointmentId      (turnos ocupados, lectura pública)
payments/{id}    date, patientId, patientName, appointmentId, studyIds[] (visita cobrada; vacío = servicio suelto),
                 items[{serviceId, label, price}],
                 discount, total, method, docType, docNumber, note, createdAt, createdBy
settings/agenda  slotMinutes, daysAhead, minNoticeMinutes, closedDates[], hours{día: ['09:00-13:00']},
                 services[{id, label, detail, price, active}], examIds[] (lectura pública)
Storage          studies/{studyId}/{archivo}
```

Si su base tiene pacientes anteriores con un campo `doctorId`, ya no se usa. Los exámenes anteriores con `modality` (CBCT, Panorámica…) se muestran con el servicio del mismo id; al editarlos se guarda `serviceId`. Los exámenes anteriores, que solo tienen `studies.doctorId`, siguen funcionando: la página y las reglas los tratan como de un solo médico, y al editarlos se guarda también `doctorIds`.

## Acceso de pacientes (pendiente)

La página `resultados.html` y el visor de solo lectura están hechos, pero el acceso está **desactivado** en `assets/js/config/patient-access.js`. Mientras `enabled` sea `false`, la página no carga el backend ni muestra datos (en modo demostración muestra exámenes de ejemplo).

Para activarlo falta, en este orden:

1. **Crear el enlace al entregar el examen**: un documento `shares/{token}` con un token aleatorio largo (no adivinable), los datos del examen (`study`), los archivos con sus enlaces de descarga (`files: [{ name, url }]`) y una fecha de caducidad (`expiresAt`).
2. **Reglas**: permitir solo `get` de `shares/{token}` (nunca `list`) mientras no haya caducado; crear y borrar solo el administrador.
3. **Enviar el correo** con `https://SU-DOMINIO/resultados.html?t=TOKEN`, por ejemplo con la extensión *Trigger Email* de Firebase o una Cloud Function.
4. **Implementar `getSharedStudy(token)`** en `assets/js/services/backend/firebase.js` (leer `shares/{token}` y devolver `{ study, files }`) y poner `enabled: true`.

## Notas de seguridad

- Los enlaces de descarga de Storage (`getDownloadURL`) llevan un token: quien tenga el enlace puede descargar el archivo. El portal solo los genera para el médico asignado, pero el médico no debería compartirlos.
- Los datos de salud están sujetos a la normativa de protección de datos de su país. Revise el aviso de privacidad y el consentimiento de los pacientes antes de usar el portal con datos reales.
