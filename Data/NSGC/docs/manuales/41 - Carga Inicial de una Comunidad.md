# 📥 41 - Carga Inicial de una Comunidad

Partir una comunidad nueva no debería significar picar unidad por unidad ni persona por persona.
Este módulo te deja bajar **planillas de Excel**, llenarlas con los datos reales de la comunidad y
subirlas al sistema para que la carga sea una vez y sin duplicados.

## 🚦 El orden importa: estructura → personas → vínculos → finanzas

Hay **seis bloques** y se cargan en este orden, porque cada uno necesita al anterior:

1. **Estructura**: los sectores (macro y micro) y las unidades con su Rol SII, metraje, prorrateo,
   tipo y estado de ocupación.
2. **Personas**: el padrón de gente (propietarios, residentes, personal, directiva, contratistas),
   una fila por persona con su RUT.
3. **Vínculos**: quién vive o trabaja en cada unidad. El vínculo necesita **la unidad ya cargada**
   (la busca por Rol SII) y **la persona ya cargada** (la busca por RUT). Si lo subís antes, el
   sistema rechaza fila por fila con el motivo — no hay vuelta que darle.
4. **Egresos**: los gastos históricos de la comunidad, un documento por fila.
5. **Ingresos**: los ingresos históricos a los fondos, con el mismo formato que los egresos.
6. **Saldos de apertura**: la deuda anterior de cada unidad al día de corte. Va **al final**: crea
   un cobro por unidad imputado al fondo de gasto común activo y **rechaza la importación entera**
   si ya hay una emisión de gastos comunes del período del corte o de uno anterior — si no, el mes
   se cobraría dos veces.

Los dos bloques del historial financiero van **después de los fondos**: el importador imputa a un
fondo que ya existe y **nunca lo crea**. Si el nombre del fondo no aparece, esa fila falla con el
motivo y hay que crearlo primero en la pantalla de Finanzas.

> La pantalla anuncia arriba el orden recomendado y sus dependencias: la estructura primero, las
> finanzas después de los fondos.

## 🖥️ Dónde está la pantalla

La pantalla es **`/admin/carga-inicial`** (entrada **«Carga inicial»** en el menú de **Sistema**),
y es **sólo para administrador**. Un residente u otro rol no la ve en su menú y, si intentara
usarla, el servidor le responde **403 Permiso denegado**.

Lo que se ve:

- **Seis tarjetas iguales**: *Estructura*, *Personas*, *Vínculos*, *Egresos*, *Ingresos* y *Saldos
  de apertura*, cada una con su descripción.
- En cada tarjeta:
  1. Un **aviso amarillo** permanente: que un `.xlsx` hay que guardarlo como CSV, y que las filas
     de ejemplo de la plantilla vienen marcadas con «EJEMPLO-» y el importador las rechaza a
     propósito.
  2. Botón **«Descargar plantilla»**.
  3. Selector de **archivo CSV** y botón **«Ver vista previa»**.
  4. El **reporte fila por fila** (con badges: Total, Válidas, Con error, Crear, Actualizar,
     Sin cambios).
  5. Botón **«Importar»**, que queda deshabilitado hasta que la vista previa salga sin errores.

Cada bloque usa **su propio archivo**: no se puede mezclar todo en una sola planilla.

## 📄 Las plantillas y qué significa cada columna

Las plantillas se bajan con el botón de cada tarjeta y llegan como CSV
(`plantilla-estructura.csv`, `plantilla-personas.csv`, `plantilla-vinculos.csv`), con la primera
fila de **encabezados** y debajo **tres filas de ejemplo** marcadas con `EJEMPLO-`. Los archivos
traen marca UTF-8 para que Excel no te destroce los acentos al abrirlos.

### Bloque Estructura (9 columnas)

Un solo CSV con los encabezados juntos, **una fila por unidad**. Los sectores no van en filas
aparte: se derivan de las columnas `macro_sector` / `micro_sector`, y si no existen en la
comunidad **se crean solos** (si existen, se reusan por nombre y no se tocan).

| Encabezado | Qué es | Ejemplo de valor |
| --- | --- | --- |
| `macro_sector` | Sector grande: Torre A, Estacionamientos, Centro Comercial | `Torre A` |
| `micro_sector` | Subsector dentro del macro: Piso 1, Subterráneo -1, Calle | `Piso 1` |
| `rol_sii` | **Rol SII de la unidad**: el identificador oficial que ya tenís en tus papeles. Es la clave: si la unidad ya existe, se actualiza; si no, se crea | `12345-1101` |
| `numero` | Número visible de la unidad | `1101` |
| `etiqueta` | Tipo visible de la unidad | `Depto` |
| `tipo_unidad` | **Tipo de unidad**: tiene que existir **ya creado** en la comunidad (se compara sin mayúsculas ni acentos) | `Depto Tipo A` |
| `metraje` | Metraje en m² | `55.5` |
| `prorrateo` | Coeficiente de prorrateo | `0.0125` |
| `estado_ocupacion` | **Estado de ocupación**: también tiene que existir ya creado (se compara sin mayúsculas ni acentos) | `Vacante` |

**Ojo**: el importador **nunca inventa maestros**. Si el `tipo_unidad` o el `estado_ocupacion` no
existen, esa fila da error y hay que crearlos primero por pantalla (Módulos 01 y 04 — Maestros
Administrativos). Las dos cosas que el CSV no trae: la etiqueta visual de los sectores (los
sectores nuevos quedan con la etiqueta genérica «Sector») y los medidores de servicios de la
unidad (quedan vacíos; se cargan por pantalla).

### Bloque Personas (6 columnas)

Sólo **padrón básico**: identidad, contacto y roles del sistema.

| Encabezado | Qué es | Ejemplo de valor |
| --- | --- | --- |
| `rut` | RUT de la persona (acepta con o sin puntos) o pasaporte. Es la clave: si la persona ya existe, se actualiza | `12.345.678-5` |
| `nombres` | Nombres | `María` |
| `apellidos` | Apellidos | `Rojas Soto` |
| `email` | Correo electrónico | `maria.rojas@ejemplo.cl` |
| `telefono` | Teléfono (móvil) | `+56 9 6123 4567` |
| `roles` | Roles del sistema **separados por `|`**: `propietario`, `residente`, `personal`, `directiva`, `contratista` | `propietario\|residente` |

El nombre completo se arma solo (`nombres` + espacio + `apellidos`); no hay columna para él.

### Bloque Vínculos (5 columnas)

Una fila por tramo vigente: **persona + unidad + rol**.

| Encabezado | Qué es | Ejemplo de valor |
| --- | --- | --- |
| `rut_persona` | RUT de la persona, **igual al que quedó cargado en Personas** | `12.345.678-5` |
| `rol_sii_unidad` | Rol SII de la unidad, **igual al que quedó cargado en Estructura** | `12345-1101` |
| `rol` | Rol del vínculo, uno de: `propietario`, `arrendatario`, `copropietario`, `ocupante` | `propietario` |
| `fecha_inicio` | Fecha de inicio del tramo, formato **AAAA-MM-DD** | `2024-03-01` |
| `permite_ver_finanzas` | Si esa persona puede ver finanzas por esa unidad: `true` o `false` | `true` |

Al importar un vínculo, si la persona ya tenía un tramo vigente en esa unidad, **el sistema lo
cierra automáticamente** y deja vigente el nuevo (misma regla que el módulo de Vinculación de
Unidades; las reglas del módulo viven ahí, no en el importador).

### Bloque Egresos (5 columnas)

Los gastos históricos de la comunidad, **una fila por documento**. La plantilla es
`plantilla-egresos.csv`.

| Encabezado | Qué es | Ejemplo de valor |
| --- | --- | --- |
| `fecha` | Fecha del egreso, **AAAA-MM-DD**, real y no futura | `2024-05-14` |
| `monto` | Monto en pesos, **mayor que 0**, con punto decimal | `185000.50` |
| `descripcion` | Qué fue ese gasto | `Mantención ascensor` |
| `categoria` | Texto libre de hasta 120 caracteres. Puede ir vacío | `Mantención` |
| `fondo` | **Nombre o id de un fondo que ya existe** en la comunidad. El importador no crea fondos | `Fondo de Gasto Común` |

### Bloque Ingresos (5 columnas)

Los ingresos históricos a los fondos, con **los mismos cinco encabezados** y las mismas reglas que
Egresos. Cambia sólo a qué libro entran. La plantilla es `plantilla-ingresos.csv`.

### Bloque Saldos de apertura (3 columnas)

La **deuda anterior** de cada unidad: lo que el vecino debía antes de empezar a usar el sistema.
La plantilla es `plantilla-saldos.csv`.

| Encabezado | Qué es | Ejemplo de valor |
| --- | --- | --- |
| `unidad` | Rol SII o número de una unidad que **ya existe** en la comunidad | `12345-1101` |
| `fecha_corte` | Hasta qué día llega esa deuda, **AAAA-MM-DD**, real y no futura | `2024-12-31` |
| `monto` | Lo que se debía a esa fecha, **mayor que 0** | `240000` |

Cada fila crea un cobro de concepto **«Deuda anterior (saldo de apertura)»** con vencimiento en la
fecha de corte, para que la mora y el estado de cuenta lo vean. Es **idempotente por unidad y
período**: volver a subir el mismo archivo no duplica la deuda.

## 📏 Formatos que importan

- **Fechas**: formato ISO `AAAA-MM-DD` (`2024-03-01`). Si viene con otro formato, la fila da error.
- **`roles` (personas)**: lista separada por `|` — ejemplo `residente|directiva`. Con espaciados o
  mayúsculas el sistema te tira el error y te nombra los roles válidos.
- **`permite_ver_finanzas` (vínculos)**: exactamente `true` o `false`, en minúscula. Nada de
  «sí»/«no»/«Sí»/«VERDADERO».
- **Decimales**: con **punto** (`55.5`). La coma también la acepta el sistema (Excel en español
  exporta con coma), pero el punto es lo recomendable para no llevarse sorpresas.
- **Encabezados**: el sistema los normaliza (sin mayúsculas, acentos ni espacios: «Rol SII» →
  `rol_sii`), así que si Excel te los desordena un poco no pasa nada — pero no cambies los nombres
  ni borres columnas.
- **RUT**: acepta la grafía con o sin puntos; la comparación es tolerante. Lo que **no** perdona es
  un dígito verificador malo (ver errores frecuentes).

## 🔒 La regla de oro: guardar el Excel como CSV

1. Llena la planilla en Excel con calma, con filtros y lo que quieras.
2. Al terminar: **Excel → Archivo → Guardar como → CSV**. Ese es el archivo que se sube; el
   `.xlsx` de trabajo te lo guardai aparte.
3. Las **filas de ejemplo** de la plantilla (las que empiezan con `EJEMPLO-` en una celda) son
   **sólo guía**: muestran cómo se llenan los campos con valores realistas. El importador las
   **rechaza a propósito** y por cada una te dice:
   > «Esta fila es del ejemplo de la plantilla: reemplazala por tus datos o borrala.»

   Reemplázalas por tus datos o bórralas antes de importar. Nada del ejemplo se escribe nunca en
   tu comunidad.

## 🧭 El flujo recomendado

1. **Baja la plantilla** del bloque y llénala.
2. **Guárdala como CSV**.
3. Elige el archivo y aprieta **«Ver vista previa»**. La vista previa **no escribe nada**: es un
   ensayo completo.
4. **Lee los errores por línea**: el reporte muestra la **línea real del archivo** (el encabezado
   cuenta como línea 1), la acción de cada fila (Crear / Actualizar / Sin cambios) y el detalle de
   cada error con su columna. Corrige el CSV y vuelve a la vista previa las veces que necesites.
5. Cuando la vista previa sale **sin errores**, el botón **«Importar»** se habilita. Al apretarlo,
   el sistema pide una **confirmación explícita** que dice cuántas filas se van a crear y cuántas
   actualizar. Las filas con error (si quedara alguna) no se tocan.
6. Importado. El badge **«Importado»** queda visible y el resumen te muestra lo que se escribió.

**¿Y si te equivocaste? No pasa nada: volvé a subir el mismo archivo.** La carga es
**idempotente**, no se puede duplicar:

- Unidad: la clave es el **Rol SII**. Existe → se actualiza; no existe → se crea.
- Persona: la clave es el **RUT**.
- Vínculo: la clave es **persona + unidad + rol**; si ese tramo ya está vigente, la fila reporta
  «Sin cambios».

Esto es justamente para el caso real: el administrador reenvía la planilla corregida y se sube
otra vez sin miedo.

## 🚫 Qué NO se puede cargar todavía (por CSV)

El importador cubre **seis bloques** y nada más. Todavía **no** se puede cargar por CSV:

- **El detalle de los pagos históricos**: el saldo de apertura de cada unidad sí entra, pero cada
  comprobante viejo —pago por pago— no.
- **Emisiones y cobros de gastos comunes**: se generan emitiendo en la pantalla de Gastos Comunes.
- **Ficha laboral del personal** (jornadas, contratos, remuneraciones).
- **Datos de gobernanza** (directiva, períodos, actas).
- **Fotos ni documentos** (imágenes, certificados, actas en PDF).

Esos módulos **siguen cargándose por su pantalla** de siempre. En el padrón de personas vía CSV
van sólo los datos básicos: lo laboral y lo de gobernanza se completa módulo a módulo.

Dos límites del historial financiero que conviene tener a la vista: el **`folio`** de un egreso
importado queda **vacío** (la numeración la asigna la pantalla de alta, no el CSV) y el importador
**no enciende el fondo**: si el fondo que nombrás está inactivo, la fila pasa igual — darlo de alta
como activo es de la pantalla de Finanzas.

## 🪜 El arranque completo: los doce pasos

Los seis bloques de arriba son la mitad de la puesta en marcha. La otra mitad vive en
**`/admin/arranque`** (menú de **Sistema**): una pantalla que mide **doce pasos** contra la base y
anuncia cuántos faltan («faltan N de 12»). Cada paso muestra **el número medido** —«0 unidades», «2
fondos de gasto común activos»— y el enlace a la pantalla donde se resuelve.

Nada se guarda como «paso hecho»: se vuelve a medir en cada visita, así que si borrás el dato, el
paso vuelve a **pendiente**. El orden es este y la pantalla no lo reordena:

| # | Paso | Qué mide | Pantalla |
| --- | --- | --- | --- |
| 1 | Catálogo del país | AFP y previsiones de salud cargadas. Es un maestro **compartido**: lo que asegura una comunidad lo ven todas | `/admin/maestros` |
| 2 | Tipos de unidad | Tipos creados en la comunidad | `/inventario/tipos` |
| 3 | Estados de ocupación | Estados creados en la comunidad | `/admin/maestros` |
| 4 | Estructura física | Unidades cargadas | `/inventario/estructura` |
| 5 | Personas del padrón | Personas cargadas | `/personas/residentes` |
| 6 | Vínculos con la unidad | Vínculos vigentes (sin fecha de término) | `/comunidad/personas` |
| 7 | Configuración de la comunidad | La fila de configuración **y** que haya firmante derivado: sin firmante no se emite ningún papel | `/admin/configuracion` |
| 8 | Fondo de gasto común | Fondos de tipo gasto común **activos** | `/finanzas/gastos-comunes` |
| 9 | Acuerdo aprobado | Acuerdos en estado aprobado | `/comunidad/directiva/acuerdos` |
| 10 | Presupuesto vigente | Presupuesto **vigente del año en curso** | `/admin/gestion/presupuestos` |
| 11 | Emisión de gasto común | Emisiones hechas | `/finanzas/gastos-comunes` |
| 12 | Usuarios de la comunidad | Usuarios **además de tu cuenta**: una comunidad de una sola cuenta no tiene a quién notificar | `/admin/usuarios` |

Los pasos 1 a 6 son los que resuelven los seis bloques de carga de este manual (el catálogo del
país va por su botón en `/admin/maestros`, los demás por CSV). Del 7 en adelante se cargan por
pantalla, uno por módulo.

## 🩹 Errores frecuentes y qué significan

La línea donde aparece el error es la **línea real del archivo** (encabezado = línea 1), así que
ubicai la fila en tu CSV directo.

| Error que te muestra | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta fila es del ejemplo de la plantilla: reemplazala por tus datos o borrala.» | La fila viene tal cual de la plantilla (tiene una celda que parte con `EJEMPLO-`) | Reemplazar los datos de esa fila o borrarla |
| «tipo_unidad: no existe el tipo de unidad «…» en la comunidad; debe estar creado antes de importar» | El nombre del tipo de unidad no existe en los maestros. El importador nunca inventa maestros | Crear el tipo en el módulo de Tipos de Unidad, y corregir la grafía si corresponde |
| «estado_ocupacion: no existe el estado de ocupación «…» en la comunidad; debe estar creado antes de importar» | Ídem para el estado de ocupación | Crear el estado en Maestros Administrativos, y corregir la grafía |
| «RUT inválido (dígito verificador incorrecto) o pasaporte con formato no válido.» | El RUT tiene su dígito verificador malo (o el pasaporte no calza) | Corregir el RUT (revisalo contra la cédula); el sistema valida el dígito, no lo adivina |
| «rut_persona: no existe la persona con RUT «…» en el padrón de la comunidad» | Estás subiendo **vínculos** de alguien que no está cargado en Personas | Importar primero la planilla de Personas, o corregir el RUT si lo escribiste distinto |
| «rol_sii_unidad: no existe la unidad con Rol SII «…» en la comunidad» | El Rol SII de la fila de vínculos **no está en la planilla de estructura** (o difiere en la grafía) | El Rol SII del vínculo tiene que ser idéntico al de Estructura; subí primero la estructura o corregí el rol |
| «debe listar roles del sistema separados por «\|» (propietario, residente, personal, directiva, contratista); no se reconoce: «…».» | Un rol de la columna `roles` no es un rol del sistema (o los separaste con coma u otro carácter) | Usar `|` como separador y uno de los cinco roles válidos |
| «rol: debe ser uno de: propietario, arrendatario, copropietario, ocupante; se recibió «…».» | El rol del vínculo no es válido | Usar uno de los cuatro roles del vínculo |
| «fecha_inicio: debe tener formato AAAA-MM-DD (ej: 2024-03-01).» | La fecha no viene en ISO | Escribir `2024-03-01`, no `01-03-2024` ni `1/3/24` |
| «permite_ver_finanzas: debe ser «true» o «false».» | La celda no es exactamente `true` o `false` | Escribir `true` o `false` en minúscula |
| «email: debe ser un correo electrónico válido.» | El correo está mal escrito | Corregir el correo |
| «No se pudo detectar el separador del archivo. Revisiona la línea de encabezados: el separador debe ser coma (,), punto y coma (;) o tabulación. Si el archivo viene de Excel, usa «Guardar como» CSV.» | El archivo no se deja leer: separador raro o todo en una sola celda | Volver a guardar desde Excel como CSV y subir ese archivo |
| «El archivo CSV está vacío.» | Subiste un archivo sin contenido | Revisar que guardaste bien el CSV |
| «Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo (HTTP 401)» | Se te cayó la sesión | Volver a entrar con tu cuenta y repetir la carga |
| «No tienes permiso para usar el importador en esta comunidad (HTTP 403)» | Tu rol no es administrador en esa comunidad | Que lo haga el administrador |

**Nota sobre los maestros**: la comparación de nombres es tolerante (sin mayúsculas, acentos ni
espacios dobles), pero si el nombre de fondo no existe, da error — el sistema no lo crea por su
cuenta.
