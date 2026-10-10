# Configurar Firebase

El portal usa tres servicios de Firebase:

| Servicio | Para qué |
| --- | --- |
| **Authentication** (correo y contraseña) | Inicio de sesión de médicos y administradores |
| **Cloud Firestore** | Médicos, pacientes y estudios (`users`, `patients`, `studies`) |
| **Cloud Storage** | Archivos DICOM de cada estudio (`studies/{id}/…`) |
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

## 4. Publicar reglas de seguridad y la página

Las reglas (`firestore.rules`, `storage.rules`) garantizan que cada médico solo lea **sus** pacientes, estudios y archivos, y que solo un administrador pueda subir, asignar o borrar.

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

Al abrir un estudio, el visor elige el modo según su contenido:

| Contenido | Modo |
| --- | --- |
| Serie de cortes o archivo multicuadro (CBCT) | Tres planos enlazados (axial, coronal, sagital), 3D, panorámica reconstruida por curva y cortes transversales |
| Panorámica, cefalometría, intraorales, fotos | Visor 2D con mosaico de 1, 2 o 4 imágenes y miniaturas |
| Informes PDF | Visor de documentos (o pestaña *Informes* junto a las imágenes) |

Formatos que abre: DICOM sin compresión (Explicit/Implicit VR, Big Endian, Deflated), RLE, JPEG Baseline, archivos ZIP con la exportación del equipo, PNG/JPG y PDF. Los DICOM con JPEG 2000, JPEG-LS o JPEG Lossless no se pueden decodificar en el navegador: el visor lo indica y ofrece descargarlos.

**Recomendación al cargar un CBCT:** suba la carpeta de la serie completa (botón *Seleccionar carpeta*) o un ZIP con ella. El visor reconstruye el volumen con todos los cortes.

## Uso diario

1. **Nuevo médico**: crea su cuenta. Comparta el correo y la contraseña inicial por un canal seguro; el médico puede cambiarla con *¿Olvidó su contraseña?*.
2. **Nuevo paciente**: se registra con su médico tratante.
3. **Cargar estudio**: elija el paciente y suba los archivos o la carpeta. El estudio aparece de inmediato en el portal de su médico.
4. Para cambiar el médico de un paciente, use el selector en la tabla *Pacientes*; sus estudios pasan al nuevo médico.

## Modelo de datos

```
users/{uid}      name, email, role ('admin' | 'doctor'), specialty
patients/{id}    name, code, age, doctorId
studies/{id}     code, patientId, patientName, patientCode, patientAge, doctorId,
                 modality, description, date (YYYY-MM-DD), files[{name, path, size}],
                 totalSize, status ('Nuevo' | 'Visto'), createdAt
Storage          studies/{studyId}/{archivo}
```

## Notas de seguridad

- Los enlaces de descarga de Storage (`getDownloadURL`) llevan un token: quien tenga el enlace puede descargar el archivo. El portal solo los genera para el médico asignado, pero el médico no debería compartirlos.
- Los datos de salud están sujetos a la normativa de protección de datos de su país. Revise el aviso de privacidad y el consentimiento de los pacientes antes de usar el portal con datos reales.
