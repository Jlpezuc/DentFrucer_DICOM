# DentFrucer · Portal DICOM

Portal web de **DentFrucer – Imagenología Dento Maxilo Facial** para consultar exámenes DICOM.

> Landing, inicio de sesión y paneles conectados a **Firebase** (Authentication, Firestore, Storage), con visor DICOM integrado.

## Páginas

| Archivo | Descripción |
| --- | --- |
| `index.html` | Landing pública de la clínica; el acceso es para médicos |
| `agendar.html` | Agenda en línea para pacientes, sin crear cuenta |
| `login.html` | Inicio de sesión de médicos |
| `portal.html` | Portal del médico: solo los exámenes asignados a él |
| `admin-login.html` | Acceso de administración (no enlazado desde la landing) |
| `admin.html` | Panel: agenda, carga de exámenes, pacientes y médicos |
| `resultados.html` | Resultados para pacientes con visor de solo lectura (**acceso desactivado**, ver abajo) |

## Firebase

Siga **[FIREBASE.md](FIREBASE.md)** para crear el proyecto, el primer administrador, publicar las reglas de seguridad y la página.

Sin configurar Firebase el sitio funciona en **modo demostración** (datos de ejemplo en memoria):

- Médico: `doctor@dentfrucer.com` / `demo1234`
- Administrador general: `admin@dentfrucer.com` / `demo1234`
- Administradores con permisos limitados: `secretaria@dentfrucer.com` (agenda, pacientes, cobros) y `tecnologo@dentfrucer.com` (agenda, exámenes, pacientes), con la misma contraseña

Con Firebase ya configurado, agregue `?demo=1` a la URL (por ejemplo `login.html?demo=1`) para probar la interfaz con datos de ejemplo sin tocar datos reales; `?demo=0` vuelve al modo normal.

## Agenda de pacientes

En **`agendar.html`** el paciente elige el examen, el día y la hora libres y deja **nombre y apellido** (obligatorios), **correo** y **teléfono** (opcionales) y, si quiere, el médico que lo envía. No crea ninguna cuenta. Al confirmar:

- se guarda la **cita** y se ocupa el **turno** (nadie más puede tomarlo);
- se crea el **paciente** en la lista de la clínica (si ya había agendado con el mismo nombre y correo/teléfono, no se duplica);
- el paciente ve un código de cita y puede agregarla a su calendario (.ics).

En el panel de administración, la sección **Agenda** tiene tres vistas:

- **Lista**: citas de hoy, próximas o anteriores, o las de **un día** elegido en el calendario del filtro (las flechas ‹ › pasan al día anterior o siguiente).
- **Semana**: franja horaria de lunes a viernes (y fin de semana si hay atención o citas), con el horario de cierre sombreado, la hora actual marcada y un color por tipo de examen. Clic en una cita para editarla; clic en un hueco para crear una cita a esa hora.
- **Mes**: cada día con sus citas (hasta tres y «+N más»); clic en el día abre su lista.

El panel recuerda la última vista elegida. Desde cualquiera de ellas se puede **crear, editar y borrar citas** (cambiar el día o la hora mueve el turno; cancelar o borrar lo libera). **Cargar examen** desde una cita rellena el paciente, el servicio de la cita y la fecha, sugiere el médico que indicó el paciente y, al subir los archivos, la cita queda como *Atendida*.

Los **servicios** (con su precio) y el **horario** de la agenda en línea se editan en el panel, en *Servicios y horarios* (ver más abajo); `assets/js/config/agenda-config.js` tiene los valores iniciales, la dirección, el teléfono y las indicaciones de la cita. En modo demostración (`agendar.html?demo=1`) las citas se guardan solo en la pestaña del navegador. Un enlace como `agendar.html?examen=CBCT` deja el examen preseleccionado.

## Navegación

En el panel de administración (Resumen, Agenda, Exámenes, Cargar examen, Pacientes, Médicos, Cobros, Servicios y horarios, Usuarios) y en el portal del médico (Exámenes, Mis pacientes), cada opción del menú lateral muestra **solo su sección**. La sección va en la dirección (`admin.html#examenes`), así que se conserva al recargar, se puede guardar como marcador y funcionan atrás/adelante. Con un examen abierto en el visor, el botón **atrás** del navegador cierra el visor (si hay mediciones sin guardar, pregunta antes). Lo resuelve `assets/js/pages/views.js` con los elementos marcados `data-section`.

## Pacientes, exámenes y médicos

Los **pacientes no tienen médico**: la ficha guarda solo identidad y contacto (nombre, apellido, expediente, edad, correo, teléfono) y se edita desde la tabla *Pacientes*. Cada **examen** pertenece a un paciente y a **uno o varios médicos**, que se eligen al cargarlo y se pueden cambiar después. Cada médico ve en su portal los exámenes que tiene asignados, y su lista *Mis pacientes* sale de esos exámenes.

### Visitas y explorador

- Los exámenes de un mismo **paciente**, para los mismos **médicos** y en la misma **fecha** forman una **visita**, se suban juntos o por separado. La visita se calcula a partir de los exámenes: si uno cambia de médicos o de fecha, pasa sola a la visita que corresponde.
- **Cargar examen** admite varios exámenes en una subida (por ejemplo CBCT + panorámica), para uno o varios médicos, cada uno con su **servicio** (y un detalle opcional), sus imágenes (archivos sueltos o una carpeta) y **su informe PDF**, y avisa si se sumarán a una visita existente.
- La tabla de **exámenes** muestra una visita por fila, con sus médicos, la cantidad de exámenes (en verde), los que no tienen informe (en rojo) y su estado de pago. Se busca por paciente, médico, código, examen o **fecha** ("08/10/2026", "8 oct 2026", "oct 2026"), se filtra por un día, por **servicio** y por *Sin médico*, *Sin informe* o *Por cobrar*.
- El **explorador** se abre desde una visita, desde un **paciente** (clic en su fila o *Ver exámenes*: todas sus visitas, plegadas; al hacer clic en una se despliegan sus exámenes, que se abren en el visor desde ahí) o desde un **médico** (sus pacientes y las visitas de cada uno). Arriba, una ruta *Médico › Paciente › Visita* con botón para volver.
- **Una visita** muestra un resumen (paciente, médicos, contenido y cobro) y sus exámenes numerados (del **modificado más recientemente** al más antiguo). Cada examen indica si falta el informe y separa en dos columnas sus **imágenes** y su **informe**. Se puede:
  - **Exámenes**: verlos en el visor, editar servicio, detalle, fecha y médicos, agregar otro examen y eliminarlos.
  - **Archivos**: subir imágenes o el informe, abrir los PDF, descargar, renombrar y eliminar.
  - **Médicos**: agregar o quitar médicos de toda la visita de una vez.
  - **Cobro**: ver lo cobrado ese día al paciente y registrar el cobro con los exámenes de la visita ya propuestos.
- Sin el permiso *Exámenes*, el explorador es de solo lectura.
- En el **portal del médico** los exámenes también se ven agrupados por **visita** (paciente + fecha); cada examen indica si tiene informe y, si lo tiene, el botón *Informe* lo abre directamente. Hay búsqueda por paciente, examen o fecha, filtro por día y por servicio, y «Ver exámenes» desde *Mis pacientes*.
- Los **informes PDF** van con su examen (un examen que solo tiene PDF se trata como informe suelto); en el visor están siempre el botón **Informe** del encabezado y la pestaña *Informes*: abren el PDF o, si el examen aún no tiene informe, lo avisan.

### Cuentas de administración y permisos

- El **administrador general** puede hacer todo y es el único que ve la sección **Usuarios**, donde crea cuentas de administración con su **nombre**, una **descripción** libre (secretaria, tecnólogo…) y sus **permisos**: *Resumen*, *Agenda*, *Exámenes* (ver, cargar y editar), *Pacientes*, *Médicos*, *Cobros* y *Servicios y horarios*. Una cuenta también puede ser administrador general.
- Cada cuenta ve en el menú solo las secciones que tiene permitidas; las reglas de Firestore aplican los mismos permisos.
- Las cuentas no se borran: se **desactivan** (no pueden entrar) y se pueden reactivar. Nadie puede quitarse sus propios permisos ni desactivarse.
- El primer administrador (creado a mano, sin permisos guardados) es administrador general.
- Cada cuenta ve su **correo** en el panel y cambia su **nombre** visible con el lápiz (*Mi cuenta*).

## Cobros

La sección **Cobros** registra lo cobrado en cada atención: paciente, fecha, **servicios** (con el precio de *Servicios y horarios*, editable), **descuento**, **medio de pago** (efectivo, débito, crédito, transferencia, convenio u otro) y el **documento entregado** con su número (boleta, voucher del terminal, factura o ninguno). La página **no emite** boletas ni facturas: solo guarda su número.

- Se registra desde el botón *Registrar cobro* de arriba o de la sección, desde una cita de la agenda (**Cobrar**; la columna *Cobro* muestra lo pagado) o desde una visita.
- **Visita (opcional)**: al elegir una visita del paciente se cargan sus exámenes como servicios, con su precio, y al guardar la visita queda **pagada**. Con *Sin visita* se cobra un **servicio suelto** (por ejemplo una copia de CD o un servicio sin examen).
- **Estado de pago de las visitas**: *Pagada*, *Por cobrar* o *Pago parcial* (si se agregó un examen después del cobro). Se ve en la tabla *Exámenes* (con el filtro *Por cobrar*), en las visitas del paciente y en el resumen de la visita, donde también se puede **marcar a mano** como pagada o no pagada (por ejemplo, una visita pagada por convenio). Al eliminar un cobro, su visita vuelve a *Por cobrar* si ningún otro cobro la cubre.
- **Forma de pago** al registrar un cobro:
  - **Efectivo**: queda pagado al registrarlo.
  - **Tarjeta en la maquinita**: el monto se envía a la maquinita de **Mercado Pago (Point)**. Una ventana muestra en vivo *Esperando el pago*; cuando el paciente paga, el cobro queda pagado con el medio real (débito o crédito) y la visita queda pagada. Se puede cancelar mientras la maquinita no lo tome. Si se rechaza o expira, se puede reintentar o cobrar de otra forma. Si se cierra la ventana, la página sigue atenta y avisa al aprobarse. Configuración: *Cobros → Maquinita* y [FIREBASE.md](FIREBASE.md#6-cobros-con-la-maquinita-de-mercado-pago-opcional).
  - **Otro medio**: transferencia, convenio, tarjeta en otra máquina…
- **Solo suman los cobros pagados**: un cobro con la maquinita pendiente, rechazado o cancelado aparece en la lista, pero no cuenta en el total, en el Resumen ni en la agenda.
- La lista se filtra por fechas, medio de pago y búsqueda, con el total del período y por medio de pago.
- En el modo demostración la maquinita está simulada: el pago se aprueba solo a los pocos segundos (o se puede simular un rechazo).

## Resumen

El **Resumen** muestra, para el período elegido (*Hoy*, *Esta semana*, *Este mes*, *Mes anterior*, *Este año* o **desde / hasta**): ingresos (y su cambio frente al período anterior de igual largo), cantidad de cobros y promedio, exámenes realizados, citas por estado, ingresos por día, semana o mes (columnas), ingresos por **medio de pago** y por **servicio** (gráficos de anillo con leyenda de montos y porcentajes; sobre 6 elementos, los menores se juntan en *Otros*), exámenes por servicio y por médico (barras), y lo **por cobrar** (visitas no pagadas y citas atendidas sin visita ni cobro) con su botón para cobrar.

## Servicios y horarios

- **Servicios**: nombre, descripción (la ven los pacientes al agendar), **precio** y si se puede agendar en línea. El **nombre del servicio** es lo único que identifica un examen en toda la página: al agendar, al cargar exámenes, en las visitas, los cobros, el Resumen, el portal del médico y el visor. Si se cambia el nombre, cambia en todas partes. El precio se propone al registrar un cobro.
- El visor deduce el tipo de imagen (volumen, panorámica, cefalometría, intraoral) de los archivos y del nombre del servicio.
- **Horario de la agenda en línea**: días de atención con uno o varios rangos de horas, duración de cada turno, cuántos días adelante se puede agendar, anticipación mínima y días sin atención (feriados, vacaciones).
- Se guarda en Firestore (`settings/agenda`) y la agenda pública lo usa de inmediato.

## Resultados para pacientes (desactivado)

`resultados.html?t=…` muestra al paciente su examen y abre el **visor de solo lectura**: navegar, contraste, lupa, girar e invertir, **guardar la imagen** (PNG) y **descargar los archivos** originales; sin mediciones, notas, implantes ni etiquetas DICOM completas. Está pensado para abrirse con un enlace enviado por correo.

El acceso está **desactivado** (`assets/js/config/patient-access.js`, `enabled: false`): la página responde "Acceso no disponible" y no carga ningún dato. Solo se puede probar en modo demostración, con un examen de ejemplo: `resultados.html?demo=1&t=EST-2026-0418` (CBCT) o `…&t=EST-2026-0415` (panorámica). Lo que falta para activarlo está en [FIREBASE.md](FIREBASE.md#acceso-de-pacientes-pendiente).

## Visor

Se abre con **Abrir** en el portal (o el ojo en el panel de administración) y elige el modo según el examen:

- **CBCT**: axial, coronal y sagital enlazados con cruz de navegación; espesor de corte (MIP); 3D (hueso, piel, rayos X); panorámica reconstruida trazando una curva sobre el arco; cortes transversales.
- **Distribución Implantes** (CBCT): axial con la curva, panorámica reconstruida y una tira de 5 cortes transversales consecutivos (cada 0,5/1/2/3 mm) con zoom sincronizado; la línea del corte axial se ve en la panorámica y en los cortes.
- **Panorámica, cefalometría, intraorales**: visor 2D, mosaico de 1/2/4 imágenes, miniaturas.
- **Herramientas**: mover, zoom, **brillo y contraste con controles deslizantes** en el pie del visor (más los preajustes Hueso/Dental/Tejido blando/Vía aérea; el clic derecho + arrastrar sigue disponible como atajo), lupa, distancia, ángulo, área con densidad media, densidad puntual, notas con flecha, calibración, girar/voltear/invertir, ocultar datos del paciente (`O`), deshacer.
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
  config/                Firebase, agenda (horario y servicios iniciales) y acceso de pacientes
  services/
    backend.js           elige el backend y documenta el modelo de datos
    backend/firebase.js  implementación con Firebase
    backend/demo.js      implementación de demostración (datos de ejemplo)
    backend/shared.js    utilidades comunes a ambas
    mode.js              ¿modo demostración?
    agenda.js            turnos, estados y validación de las citas
    people.js            validación de nombres y contacto de pacientes
    groups.js            visitas: exámenes del mismo paciente, médicos y fecha
    permissions.js       permisos de las cuentas de administración
    payments.js          cobros: medios de pago, documentos, estados de la maquinita y validación
    settings.js          servicios y horario guardados (settings/agenda)
  ui/                    utilidades compartidas: iconos, modales, formatos
  pages/                 lógica de cada página: landing, login, portal, agenda, results
                         + session, views y study-actions (compartidos)
    admin/               panel: index (estado y permisos) + dashboard, agenda, calendar, studies, explorer,
                         upload, people, payments, schedule, users, account
  viewer/
    index.js             abre el visor (completo o de solo lectura) y elige el modo
    shell.js             estructura visual: encabezado, barras, paneles
    data/                lectura DICOM, píxeles, ZIP, imágenes, volúmenes
    core/                viewport, herramientas, mediciones, 3D, exportación
    modes/               visor CBCT, visor 2D, informes PDF
    demo/                datos sintéticos para el modo demostración
functions/                               servidor (Cloud Functions): maquinita de Mercado Pago
  index.js               funciones publicadas: pointCharge, pointRefresh, pointCancel, pointTerminals,
                         pointUseTerminal y mpWebhook
  src/mercadopago.js     cliente de la API de Órdenes de Mercado Pago (Point)
  src/point.js           cobros con la maquinita en Firestore (estado, visita pagada)
  src/signature.js       firma de los avisos (webhooks)
  test/                  pruebas (npm --prefix functions test)
firestore.rules, storage.rules           reglas de seguridad
cors.json                                acceso del visor a Storage (ver FIREBASE.md)
firebase.json                            Hosting + reglas + funciones para `firebase deploy`
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
