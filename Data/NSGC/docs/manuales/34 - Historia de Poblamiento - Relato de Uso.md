# 🏘️ 34 - Historia de Poblamiento - Relato de Uso

> **Para quién es este documento:** Para ti, para el admin que poblará la comunidad por primera vez y para quien llegue después. No es contrato para la IA (eso vive en `openspec/specs/`), es la **crónica humana** de cómo se llena Compass sin quedar en pana. Cada capítulo cuenta qué hace una persona real y, al lado, qué engrane técnico lo hace posible.

---

## 0. Cómo leer este documento

Este manual tiene **dos capas paralelas** en cada capítulo:

| Relato humano | Gear técnico | Verificación cruzada |
|---|---|---|
| Qué vive una persona: "María, admin, llega el día 1..." | Qué colección de `k0mp4ss_fe/apps/web/lib/store.ts:57` se toca, con qué `rank` `openspec/specs/ST-capa-datos-persistente/spec.md:9` y dependencia `RG-reglas-generales:7` | Dónde mirar que el cruce funcionó (qué pestaña, qué badge, qué dona) |

Si solo lees el Relato, entiendes el orden de poblamiento. Si lees el Gear, entiendes por qué no puede invertirse.

**Rank canónico que ordena toda la historia** `openspec/specs/ST-capa-datos-persistente/spec.md:9`:

`0=CF/MA` (diccionario) → `1=TU/MP` (plantillas + gente) → `2=EF` (obra física `macro→micro→unidad`) → `3=VU` (amarras) → `4=FI/PE/IR/IN` → `5=RA/GE/MT` → `6=CT/PL` → `99=RE/AM` (huella)

---

## 1. El Elenco

| Actor | Cuándo llega | Qué administra | Módulos que usa |
|---|---|---|---|
| **Administradora (María)** | Día 0, funda | Todo. Define el idioma, dibuja plantillas, levanta torres, registra personas y amarra | `MA` `k0mp4ss_fe/apps/web/app/admin/maestros/page.tsx:62`, `TU` `/inventario/tipos`, `EF` `/inventario/estructura`, `MP` `/comunidad/personas`, `VU` `/comunidad/personas/[id]` |
| **Residente (Carlos, depto 502)** | Día 3, cuando ya hay deptos | Su censo, sus mascotas, acepta vínculo | `VU` (rol `Arrendatario`/`Propietario`), `CO` buzón, `CV` visor |
| **Conserje (Jorge)** | Día 10, operación diaria | Turnos, visitas, encomiendas, contratistas | `PE` `Data/NSGC/docs/especificaciones/PE - Personal y Servicios.md:50` (`/personas/personal`, `/operaciones/accesos`) |
| **Bodeguero / Mantención (Ana)** | Día 10, en paralelo a Jorge | Insumos, EPP, llaves, stock crítico | `IR` `Data/NSGC/docs/especificaciones/IR - Inventario y Recursos.md:25` (`/inventario/recursos`) |
| **Vecino que reclama (Sra. Pérez)** | Día 12 | Reclamos, solicitudes | `CO` `Data/NSGC/docs/especificaciones/CO - Comunicacion Vecinos.md:15`, `GE` `Data/NSGC/docs/especificaciones/GE - Gestion de Solicitudes.md:7` |

> Nadie puede actuar antes de que su dependencia exista. La frase que te salva: **"No puedes entregar la llave de un depto que no existe"**.

---

## 2. Prólogo - El Diccionario antes del Mundo `Rank 0 - MA + CF`

### Relato

Antes de construir una torre, María se sienta con el comité y acuerda el idioma. ¿Le diremos **Torre, Manzana o Etapa** a lo grande? ¿**Piso, Nivel o Pasaje** a lo chico? ¿**Depto, Casa, Local, Bodega, Estacionamiento** a la unidad? ¿Qué **estados** tendrá un depto: Vacante, En Uso, En Arriendo...? ¿Y qué **condiciones especiales** cuidaremos: Electrodependiente, Movilidad Reducida? Todo eso, más los **bancos**, **AFPs**, **feriados** y **contactos de emergencia**, es el diccionario. Sin él, los formularios salen vacíos.

### Gear técnico

* **Colecciones:** `MaestroCollections` `k0mp4ss_fe/apps/web/lib/store.ts:57` (14 colecciones) + `configuracion` singleton `k0mp4ss_fe/apps/web/data/admin/configuracion.ts:49`
* **Seed:** `k0mp4ss_fe/apps/web/data/maestros.ts:6` (categorías/estados) + `k0mp4ss_fe/apps/web/data/admin/maestros.ts:12` (10 colecciones admin) + `k0mp4ss_fe/apps/web/data/comunidad/vinculos.ts:7` (`ESTADOS_INMOBILIARIOS`)
* **Rank:** `0` raíz, sin `dependsOn` `openspec/specs/MA-maestros-administrativos/spec.md:7` y `openspec/specs/CF-configuracion-global/spec.md:7`
* **Validación:** `saveMaestro` `k0mp4ss_fe/apps/web/lib/store.ts:342` único mutador; `removeMaestro:352` valida inverso (no borrar categoría en uso).

### Verificación

Crear en `MA > Categorías Macro` el `TEST-MACRO-TorreQA` y ver que aparece al tiro en `EF > Nueva MacroSector > Categoría`. Si no aparece, el diccionario no se guardó. Desactivar no borra historial `Data/NSGC/docs/manuales/10 - MA - Maestros Administrativos.md:15`.

**Datos TEST de esta fase:** `EdOTEST` (`TEST-EdO-EnLimpieza` hex `#ef4444`), `EMacroTEST` (`TEST-MACRO-TorreQA`), `EMicroTEST` (`TEST-MICRO-PisoQA`), `TPropTEST` (`TEST-CATU-LoftQA`), `VulnerabilidadTEST` (`TEST-VULN-ElectroQA`), `EImmobiTEST` (`TEST-EINM-PreReservaQA`), `NCritTEST` (`TEST-EMER-CerrajeroQA`), `BancoTEST` (`TEST-BANCO-BancoQA`).

---

## 3. Capítulo 1 - El Arquitecto dibuja y levanta `Rank 1-2 - TU -> EF`

### Relato

Con el idioma acordado, María dibuja **plantillas** (`TU`). No dibuja cada depto a mano: define "Loft 45m2 - 120k" una vez y todas las unidades que usen esa plantilla heredan metraje y cobro base. El metraje queda bloqueado en la ficha para no generar inconsistencias `Data/NSGC/docs/manuales/01 - Tipos de Unidad.md:14`.

Luego **levanta la obra** (`EF`) `Data/NSGC/docs/manuales/02 - Estructura Física.md:5`: primero la **Torre** (`MacroSector` con categoría `TEST-MACRO-TorreQA`, nombre `SectorTEST`, `DescripMSectorTEST`), luego el **Piso** (`MicroSector` `Piso99-TEST` con `TEST-MICRO-PisoQA` colgado de `SectorTEST`), al final el **Depto 999** (`unidad` número `999`, tipo `TU-TEST-LoftQA`, estado `TEST-EdO-EnLimpieza`, micro `Piso99-TEST`). El orden interno es obligatorio `macro -> micro -> unidad` `openspec/specs/EF-estructura-fisica/spec.md:7`. Si intenta crear el 999 sin Piso, el botón queda deshabilitado `Data/NSGC/docs/especificaciones/EF - Estructura Fisica.md:44`.

Los estacionamientos ya no son un módulo aparte: son unidades `u-E-999` con `tipo tipo-es-1` y `micro est-*` del macro `estacionamientos` `Data/NSGC/docs/especificaciones/ES - Estacionamientos.md:3`.

### Gear técnico

| Entidad | Depende de | Rank | Seed | Validación |
|---|---|---|---|---|
| `tiposUnidad` `k0mp4ss_fe/apps/web/lib/store.ts:77` | `MA.categoriasUnidad` | 1 | `data/inventario/estructura.ts:50` (5) | `saveTipoUnidad` valida categoria exists; `removeTipoUnidad:189` bloquea si hay unidades |
| `macroSectores` `k0mp4ss_fe/apps/web/lib/store.ts:78` | `MA.categoriasMacro` | 2a | `data/inventario/estructura.ts:107` (7) | `saveMacro:203` valida categoria; `removeMacro:208` bloquea si tiene micros |
| `microSectores` | `macroSectores + MA.categoriasMicro` | 2b | `:117` (23) | `saveMicro:221` valida `macroSectorId`; `removeMicro:226` bloquea si tiene unidades |
| `unidades` | `microSectores + TU + MA.estadosOcupacion` | 2c | `:135` (166) | `saveUnidad:241` valida `microSectorId + tipoUnidadId + estadoId` |

### Verificación

* Al crear `TU-TEST-LoftQA` con `TEST-CATU-LoftQA`, el selector `Categoría` de `TU` lo lista sin hardcode `openspec/specs/TU-tipos-unidad/spec.md:18`.
* Al crear `SectorTEST` y `Piso99-TEST`, la dona de `EF` `Data/NSGC/docs/manuales/02 - Estructura Física.md:27` muestra segmento rojo `EnLimpieza` con `#ef4444` y click filtra la tabla a la 999. En `TU` el contador de `TU-TEST-LoftQA` pasa de 0 a 1.

---

## 4. Capítulo 2 - Llega la Gente y se amarra `Rank 1+3 - MP -> VU`

### Relato

El edificio ya existe vacío. Llega **Carlos** con RUT `99.999.999-9`. La administradora lo registra una vez en el **Registro Civil** (`MP`) `Data/NSGC/docs/manuales/05 - Maestro de Personas.md:9` con su condición `TEST-VULN-ElectroQA` - aparece ⚠️ en la grilla y banner en la ficha `Data/NSGC/docs/especificaciones/MP - Maestro de Personas.md:41`. Esa ficha es única: el mismo RUT le servirá si mañana es conserje y propietario a la vez `MP:22` (extensiones por rol).

Luego lo **amarra** (`VU`) `Data/NSGC/docs/manuales/06 - Vinculación de Unidades.md:8`: Carlos `99.999.999-9` → Depto `999 (SectorTEST/Piso99-TEST)` rol `Propietario`, estado inmobiliario `TEST-EINM-PreReservaQA` `VU:74` (solo visible si es Propietario `VU:80`). También lo amarra a `E-999` (`Estacionamiento`). Si intenta amarrar a alguien `inactivo`, el sistema rechaza `k0mp4ss_fe/apps/web/lib/store.ts:283`. Si intenta duplicar vínculo activo o solapar arriendo `ST-capa-datos-persistente:80`, también rechaza. El cambio de dueño cierra tramo previo automáticamente `k0mp4ss_fe/apps/web/lib/store.ts:310`.

### Gear técnico

| Entidad | Depende de | Rank | Seed | Validación |
|---|---|---|---|---|
| `personas` `k0mp4ss_fe/apps/web/lib/store.ts:81` | `MA.condicionesEspeciales` | 1 (paralelo a TU) | `data/comunidad/personas.ts:50` (54) | `savePersona:259` valida `condicionesEspecialesIds subset`; `removePersona:264` bloquea si tiene vínculos |
| `vinculos` `k0mp4ss_fe/apps/web/lib/store.ts:82` | `MP + EF.unidades + MA.estadosInmobiliarios` | 3 último del core | `data/comunidad/vinculos.ts:30` (55) | `saveVinculo:278` valida `persona exists + activa + no duplicado + no solape arriendo` + `cerrarAnterior:310` |

### Verificación

* `MP` grilla muestra ⚠️ para Carlos.
* `EF > Ficha 999 > Historial de Asignaciones` `VU-vinculacion-unidades:97` lista cronología `Propietario 99.999.999-9` + `Arrendatario 88.888.888-8`.
* `FI` ya ve `999` con responsable de cobro y permite emitir GC `Data/NSGC/docs/especificaciones/FI - Finanzas y Morosidad.md:37`.
* `CT` permite generar Certificado Residencia para 999 `Data/NSGC/docs/especificaciones/CT - Certificados.md:14`.

---

## 5. Capítulo 3 - Vidas Paralelas `Rank 4 - PE / IR / CO en paralelo`

### Relato

Día 10. Con gente viviendo, **tres personas usan el sistema al mismo tiempo**, sin pisarse, porque sus dependencias ya están cargadas:

**a) Jorge el conserje (`PE`)** `Data/NSGC/docs/especificaciones/PE - Personal y Servicios.md:50`: registra su turno (`/personas/personal`), anota visita de Carlos a la 999 (`/operaciones/accesos`), recibe encomienda con foto. Necesita que `MA.feriados` y `MA.bancos` existan para su ficha laboral y que `EF` exista para la visita destino. Su `feriado` proyecta recambio y le avisa a `FI` el sobrecosto `PE:30`.

**b) Ana la bodeguera (`IR`)** `Data/NSGC/docs/especificaciones/IR - Inventario y Recursos.md:25`: ingresa stock `Litros` (`MA.unidadesMedida`), marca `stock crítico`, entrega EPP a Jorge. Cada ingreso queda atado a un `egreso FI` `IR:42`. Puede trabajar en paralelo a Jorge porque ambos penden de `EF` y `MA`, no entre sí.

**c) La Sra. Pérez (`CO/CV`)** `Data/NSGC/docs/especificaciones/CO - Comunicacion Vecinos.md:15`: deja reclamo por ruido en `CO` buzón, el reclamo genera ticket `GE` `Data/NSGC/docs/especificaciones/GE - Gestion de Solicitudes.md:7`. Mira avisos en `CV` `Data/NSGC/docs/especificaciones/CV - Visor de Mensajes.md:1` filtrados por su torre `EF`.

Si cualquiera intenta operar antes de `VU`, falla: Jorge no puede registrar visita a depto sin `999`, Ana no puede entregar EPP a persona sin `MP`, Pérez no puede reclamar sin `VU` que la identifique.

### Gear técnico

| Módulo futuro | Entidades ST previstas | Depende de | Rank | Nota |
|---|---|---|---|---|
| `PE` | `personal extends Persona + visitas + encomiendas + turnos` | `MP + MA(afps,previsiones,mutuales,bancos,feriados) + CF.jornada + EF` | 4 | `savePersonal` valida `afpId/bancoId` FK |
| `IR` | `insumos + activosInfra + epp + llaves` | `EF + MA(categoriasInsumos,unidadesMedida) + FI.egreso + PE` | 4 | `todo ingreso vinculado a egreso FI` `IR:42` |
| `CO/CV` | `mensajesMasivos + avisosCV + plantillas MA` | `MP/EF/VU + MA.plantillas` | 4 | `GE` depende de `CO` |
| `IN` | `tiposInfraccion + infracciones` | `EF + CO + FI(GC)` | 4 | multa en %GC necesita `FI` |
| `RA` | `amenities + reservas` | `EF/IR + MA.cajasFondos + VU + FI` | 5 | `no solape + no moroso FI` `RA:22` |

### Verificación

* Carga paralela: `PE` + `IR` + `CO` pueden cargarse en cualquier orden entre ellos tras `VU`, pero nunca antes. `validateSeedOrder` lo garantiza.
* `BancoTEST` aparece en selector de ficha laboral `PE`, no solo en `FI`.

---

## 6. Capítulo 4 - El Dinero `Rank 4-5 - FI / MT / RA`

### Relato

A fin de mes, María **emite Gastos Comunes** (`FI`) `Data/NSGC/docs/especificaciones/FI - Finanzas y Morosidad.md:19`. El sistema le bloquea la emisión si alguna unidad no tiene responsable de cobro `VU` `FI:38` o si `CF.modoCalculoGC` `Data/NSGC/docs/especificaciones/CF - Configuracion Global.md:28` no está definido. Si elige `fijo`, toma `TU.montoBaseGc`; si `variable`, prorratea por `TU.metraje`. Las multas `IN` cerradas y las garantías retenidas `RA` se suman como cargos adicionales `FI:42`. `MT` proyectos (pintura) cuelgan del fondo `MA.cajasFondos:reserva` `MT:37`.

### Gear técnico

* `FI` `cargosGC/pagos/egresos` depende de `CF + MA(cajasFondos,indices,bancos) + EF/TU + VU + IN + RA` `rank 4-5`. Seed derivado `generarCargos(unidades×TU×CF)`, no estático.
* `saveCargo` valida `unidadId + fondoId + periodo único`; `savePago` genera `Informe Diferencia` si `monto != deuda+Mora` `FI:60`.

### Verificación

* Sin `VU` completo, `FI` lista unidades huérfanas.
* Cambio de `CF.diaCortePago` validado rango `1-31` `CF:41`.

---

## 7. Epílogo - Todo deja huella `Rank 99 - AM / RE`

### Relato

Cada paso deja un evento inmutable en **Auditoría** `Data/NSGC/docs/especificaciones/AM - Auditoria y Metricas.md:9` y en el **Panel de Incumplimientos** `AM:45` (turnos no cerrados, visitas ghost). Cuando María termina de poblar con `TEST-*`, abre `RE` dashboard y ve: `83 deptos auditados, 100 plazas monitoreadas` `AM:91`. Si algo quedó huérfano (`FK dangling`), la **tasa huérfanos** `Data/NSGC/docs/manuales/34 - Historia...` marca `>0`.

### Gear técnico

* `AM` rank `99` sumidero, depende de todos, no bloquea carga `openspec/specs/AM-auditoria-metricas/spec.md:7`.
* Eventos `ST_SEED_STARTED, ST_SEED_COLLECTION_LOADED, ST_SEED_VALIDATION_FAILED, ST_MIGRATE_APPLIED` `openspec/specs/ST-capa-datos-persistente/spec.md:42` + `MA_MAESTRO_CREATE, TU_CREATE, VU_CHANGE_OWNER...` `AM:33`.
* `RE` vista sin colección, solo agregación.

### Verificación

* Tras `Cargar Todo` en QA Lab, `AM > Logs` muestra `ST_SEED_COLLECTION_LOADED {tiposUnidad:5, macro:7, micro:23, unidades:166, personas:54, vinculos:55}`.
* `tasa huérfanos == 0`.

---

## 8. Hoja de Ruta de Carga Resumida (para QA Lab)

```
[F0] MA/CF  -> crear TEST-MACRO/MICRO/CATU/EdO/VULN/EINM/EMER/BANCO (8)
[F1] TU/MP  -> TU-TEST-LoftQA (45m2/120k) + Persona 99.999.999-9 (paralelo)
[F2] EF     -> SectorTEST (cat TEST-MACRO) -> Piso99-TEST (cat TEST-MICRO) -> 999 + E-999
[F3] VU     -> Propietario 99->999 + Propietario 99->E-999 + Arrendatario 88->999 (con solape test)
[F4] PE/IR/CO (paralelo)
[F5] FI/RA/MT/GE/IN
[F6] CT/PL
[99] AM/RE
Borrado inverso: VU -> EF unidades -> EF micro -> EF macro -> MP -> TU -> MA
```

Toda spec nueva SHALL copiar bloque `## N. Dependencias de Carga y Seed (ST)` de `RG-reglas-generales:27` con `Entidades ST | Depende de | Rank | Seed Manifest | Validación | Bulk | Migración`. Ver `openspec/specs/ST-capa-datos-persistente/spec.md:9`.

---

## 9. Nota P4 SERIE-GATED-API-BD — fases PI/PL vía API (2026-09-29)

Las fases "Poblar todo" de **Vitrina (Paso 8, PI)** y **Remuneraciones
(Paso 20, PL)** poblan vía API REST (BD fuente de verdad, igual que las
pages `/comunidad/portal` y `/finanzas/remuneraciones`):

- **PI**: publicación fija `test-pub-pi-qa` (unidad del seed vía
  `GET /api/unidades`, upsert) + lead fijo `test-lead-pi-qa` (upsert; la
  notificación al propietario solo se genera al alta). La vitrina muestra la
  publicación tras poblar.
- **PL**: params CF vía `PUT /api/configuracion` + trabajador fijo
  `test-qa-pl-trab` (RUT 77.777.777-7, ficha con sueldo base, upsert) +
  liquidación vía `POST /api/liquidaciones` en el primer periodo libre de la
  ventana rotativa 2027–2031 + `POST …/confirmar` (egreso FI Sueldos en BD).
  La liquidación **no descuenta anticipo** (no existe `/api/adelantos`; el
  servidor solo descuenta pendientes de BD). El adelanto demo `test-ade-1`
  sigue en store legacy documentado (la pestaña Adelantos lo muestra).
- **Espejo store transitorio**: la confirmada BD se refleja al store para los
  consumidores legacy (dropdown en Certificados, paso CT-4, validación de
  huérfanos 0).
- **Residuo honesto**: la confirmada QA es inmutable por diseño y persiste
  tras "Borrar todo" (borradores, espejo, persona, pub/lead y notificaciones
  PI sí se purgan vía API); la siguiente corrida usa otro periodo libre sin
  colisionar. `e2e:higiene` la purga en cada reseed.

## 10. Nota `qlab-poblamiento-api-rest` — Fases EF/VU, FI, CT, IN, RA y MT vía API (2026-10-12)

Cierra el gap "el laboratorio escribe el store legacy, las páginas leen BD" para las fases que quedaban. Ahora **poblar escribe BD vía API REST** y lo poblado se ve en las páginas reales (`/inventario/estructura`, `/finanzas/gastos-comunes`, `/comunidad/certificados`, `/operaciones/reservas`, `/finanzas/multas`, `/inventario/proyectos`).

- **Orden real del grafo**: `EF/VU → FI → CT`, con IN/RA/MT antes de las conexiones FI 7-10. FI no podía migrar antes que la estructura, porque la emisión de Gasto Común lee las unidades de BD.
- **Espejo transitorio (Decisión 7)**: durante la transición cada paso escribe **API y store**, porque las fases siguientes del laboratorio todavía leen el store. El criterio de retiro queda declarado; el laboratorio ya verifica sus resultados en BD.
- **Ids fijos `test-*` + upsert**: repoblar es idempotente. FI usa períodos dedicados TEST (`2019-03` emisión, `2019-01` mora) porque los períodos corrientes ya tienen emisión de corridas previas y respondían 409.
- **Acciones nuevas en el servidor**: FI pago/mora/retiro de fondo; CT gate de deuda/saldo + inmutabilidad (409); IN apelar/respaldar/aplicar/desestimar con `multa_in` idempotente por procedencia; RA folio `RA-####`, snapshot de tarifa/garantía y cobros `reserva_ra`/`penalizacion_ra`/`garantia_ra`; MT folio `MT-####`, iniciar/finalizar con preventivo automático, verificación de garantías y guard de saldo en proyectos.
- **Higiene de dos mundos**: `limpiar()` purga la BD por API, TEST-scoped, hijos→padres. La carrera de hidratación del store que abortaba la purga se resolvió esperando la hidratación antes de limpiar/poblar/validar. Un cobro TEST con pagos puede darse de baja en desarrollo (409 intacto para filas reales); el certificado CT es inmutable → **residuo honesto** que purga `e2e:higiene`.
- **Declarado y no portado**: gate de morosidad y `anticipacionMinimaDias` de RA, notificaciones de RA/MT, el paso IR del formulario MT y los chequeos de existencia cross-collection sin FK.
- **Verificación**: e2e `poblado-idempotente` 8/8 y `flujo/poblamiento` 9/9 · suite 944/944 · tsc 0 · eslint 0.

## 11. Nota `qlab-purga-bulk` — purga bulk del residuo TEST (2026-10-13)

La limpieza **"Borrar todo lo de prueba"** ya no recorre entidad por entidad desde el
navegador. Un endpoint server-side `POST /api/qa-lab/purga-test` purga todo el residuo TEST
de la comunidad en **una sola request**, en orden hijos→padres (cobros/emisiones →
egresos/fondos → reservas/elementos → trabajos/proyectos → unidades/vínculos → personas →
maestros):

- **Solo TEST, nunca datos reales**: ids con prefijo `test-` más procedencia TEST imposible
  en producción (cobros FI por `unidadId`/`origenRef` `test-` — la multa IN materializa un
  `cob-*` —, emisiones de los períodos TEST `2019-03`/`2019-01`, notificaciones PI con la
  marca `TEST`).
- **Respuesta `{ borrados, bloqueos }`**: conteo por colección y conflictos reales con su
  motivo (no se inventan). **Idempotente**: segunda corrida = 0 borrados, sin errores.
- **Guard y permisos**: 404 fuera de dev/test (`isWriteApiEnabled`), 401 sin sesión, 403 sin
  membresía o sin permiso de administración de la comunidad.
- **Fallback documentado**: si el endpoint responde error, `limpiar()` usa el bucle por
  entidad histórico (O(n) requests) sin cambiar los mensajes verde/rojo.
- **Residuo honesto intacto**: las liquidaciones PL confirmadas y los certificados CT
  inmutables no se borran ni se reportan como bloqueo; `e2e:higiene` sigue retirándolos en
  cada reseed.
- **Medición** (sobre poblamiento completo: 44 filas / 25 colecciones): antes ≈ **61 requests**
  de purga (53 DELETE + 8 GET paginados) y >120 s en el runner de CI (5-11 s local); ahora
  **1 request** con purga server-side de **916 ms** (wall del cliente ≈ 3.9 s incluyendo la
  purga del store).
- **Limpiezas de cola estrictas otra vez**: `e2e/crud/poblado-idempotente.spec.ts` y
  `e2e/flujo/ciclo.spec.ts` vuelven a exigir `TEST-* limpio correctamente` en ≤120 s (sin
  tolerancia best-effort de 90 s).

*Última actualización: 2026-10-13 - Change `qlab-purga-bulk` (SERIE-NOCHE-2 P1).*
