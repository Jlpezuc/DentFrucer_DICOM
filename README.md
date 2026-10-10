# DentFrucer · Portal DICOM

Portal web de **DentFrucer – Imagenología Dento Maxilo Facial** para consultar estudios DICOM.

> Estado: maqueta (landing + paneles con datos de ejemplo). El visor DICOM, la base de datos y la autenticación real aún no están implementados.

## Páginas

| Archivo | Descripción |
| --- | --- |
| `index.html` | Landing pública: servicios, perfiles, visor (placeholder), seguridad y contacto |
| `login.html` | Inicio de sesión con selector Médico / Administrador (`?rol=admin`) |
| `admin.html` | Panel de administración: estudios, carga de archivos, médicos |
| `portal.html` | Portal del médico: solo los estudios de sus pacientes |

## Probar en local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Credenciales de demostración (también con el botón “Rellenar datos de demostración”):

- Médico: `doctor@dentfrucer.com` / `demo1234`
- Administrador: `admin@dentfrucer.com` / `demo1234`

La sesión es simulada en `sessionStorage`; no hay seguridad real todavía.

## Estructura

```
assets/css/styles.css   paleta de marca y estilos
assets/js/app.js        iconos, sesión simulada, datos de ejemplo
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
