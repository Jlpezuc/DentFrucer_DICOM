# Configurar Firebase

El portal usa tres servicios de Firebase:

| Servicio | Para qué |
| --- | --- |
| **Authentication** (correo y contraseña) | Inicio de sesión de médicos y administradores |
| **Cloud Firestore** | Médicos, pacientes y estudios (`users`, `patients`, `studies`) |
| **Cloud Storage** | Archivos DICOM de cada estudio (`studies/{id}/…`) |
| **Hosting** (opcional) | Publicar la página, gratis y con HTTPS |

Mientras `assets/js/firebase-config.js` tenga los valores `TU_…`, el sitio funciona en **modo demostración**, con datos de ejemplo.

## 1. Crear el proyecto

1. Entre a <https://console.firebase.google.com> y pulse **Agregar proyecto** (por ejemplo `dentfrucer`). Google Analytics no hace falta.
2. En la página del proyecto pulse el icono **Web (`</>`)**, registre la app (nombre: `portal`) y copie el objeto `firebaseConfig`.
3. Pegue esos valores en `assets/js/firebase-config.js`. No son secretos: la seguridad la dan las reglas del paso 4.

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
