# DentFrucer · Portal DICOM

Portal web de **DentFrucer – Imagenología Dento Maxilo Facial** para consultar estudios DICOM.

> Estado: landing, inicio de sesión y paneles conectados a **Firebase** (Authentication, Firestore, Storage). El visor DICOM interactivo es todavía un marcador de posición.

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

## Probar en local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Los scripts son módulos ES: abra el sitio con un servidor (no con `file://`).

## Estructura

```
assets/css/styles.css   paleta de marca y estilos
assets/js/app.js            lógica de cada página
assets/js/backend.js        capa de datos: Firebase o modo demostración
assets/js/firebase-config.js  configuración del proyecto Firebase
assets/js/icons.js          iconos SVG
firestore.rules, storage.rules  reglas de seguridad
firebase.json               Hosting + reglas para `firebase deploy`
assets/img/             logotipos
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
