# 📥 41 - Carga Inicial de una Comunidad

Partir una comunidad nueva no debería significar picar unidad por unidad ni persona por persona.
Este módulo te deja bajar **planillas de Excel**, llenarlas con los datos reales de la comunidad y
subirlas al sistema para que la carga sea una vez y sin duplicados.

## 🚦 El orden importa: estructura → personas → vínculos

Hay tres bloques y se cargan en este orden, porque cada uno necesita al anterior:

1. **Estructura**: los sectores (macro y micro) y las unidades con su Rol SII, metraje, prorrateo,
   tipo y estado de ocupación.
2. **Personas**: el padrón de gente (propietarios, residentes, personal, directiva, contratistas),
   una fila por persona con su RUT.
3. **Vínculos**: quién vive o trabaja en cada unidad. El vínculo necesita **la unidad ya cargada**
   (la busca por Rol SII) y **la persona ya cargada** (la busca por RUT). Si lo subís antes, el
   sistema rechaza fila por fila con el motivo — no hay vuelta que darle.

> Los datos vienen en el orden del menú: la pantalla anuncia arriba el orden recomendado
> («Estructura → Personas → Vínculos»).

## 🖥️ Dónde está la pantalla

La pantalla es **`/admin/carga-inicial`** (entrada **«Carga inicial»** en el menú de **Sistema**),
y es **sólo para administrador**. Un residente u otro rol no la ve en su menú y, si intentara
usarla, el servidor le responde **403 Permiso denegado**.

Lo que se ve:

- **Tres tarjetas iguales**: *Estructura*, *Personas* y *Vínculos*, cada una con su descripción.
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

El importador cubre **estructura, personas y vínculos** y nada más. Todavía **no** se puede cargar
por CSV:

- **Ficha laboral del personal** (jornadas, contratos, remuneraciones).
- **Datos de gobernanza** (directiva, períodos, actas).
- **Finanzas** (fondos, egresos, emisiones de gastos comunes, cobros).
- **Fotos ni documentos** (imágenes, certificados, actas en PDF).

Esos módulos **siguen cargándose por su pantalla** de siempre. En el padrón de personas vía CSV
van sólo los datos básicos: lo laboral y lo de gobernanza se completa módulo a módulo.

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
