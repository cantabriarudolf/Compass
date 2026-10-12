# Design: qlab-poblamiento-api-rest

## Decisión 1 — El poblamiento escribe BD vía API, nunca el store

`cargarFase13FI` y `cargarFase15CT` dejan de llamar acciones del store y pasan a llamar las
rutas REST con `fetch` (helper `apiQA` que ya usa la fase PI, `app/admin/qa-lab/page.tsx:428`).
El store legacy queda para los consumidores que aún lo leen, no como destino de escritura.

**Por qué**: la BD es la fuente de verdad declarada (`RG - Reglas Generales.md:54`) y las
páginas leen API. Escribir al store es lo que produce el desfase.

## Decisión 2 — Reusar rutas y crear sólo las acciones que faltan

Reusar (`fondos-fi`, `egresos-fi`, `cobros-fi`, `emisiones-gc`, `certificados-ct`,
`personas`, `configuracion`, `liquidaciones`). Crear:

| Ruta nueva | Motivo | Patrón a copiar |
| --- | --- | --- |
| `POST /api/cobros-fi/[id]/pagar` | Hoy sólo hay `PUT` factory | `app/api/liquidaciones/[id]/confirmar/route.ts` (acción dedicada, evento de auditoría) |
| `POST /api/cobros-fi/[id]/mora` | Sin equivalente | idem |
| `POST /api/fondos-fi/[id]/retirar` | `retirarFondoFI` sin API | idem |
| `POST /api/certificados-ct` (reusar el existente) | Existe y no se usa desde el lab | `app/api/certificados-ct/route.ts:22` |

**Por qué**: minimizar superficie nueva y mantener el lenguaje de las rutas ya auditadas
(evento post-write, scoping por comunidad, guardas de inmutabilidad).

## Decisión 3 — Ids `test-*` fijos + upsert para idempotencia

Cada entidad poblada lleva un id determinista (`test-*-qa`, `test-*-fi`, `test-*-ct`) y las
rutas hacen upsert. Así "Poblar todo" dos veces no duplica y "Borrar todo" puede localizar el
residuo exacto. Es el modelo ya probado en PI (`test-pub-pi-qa` / `test-lead-pi-qa`).

## Decisión 4 — La higiene es de dos mundos y se prueba

`tieneDatosTest(state, bd?)` y `e2e:higiene` deben cubrir store + BD. El guard informa
"TEST-* limpio correctamente" sólo si **ambos** mundos están limpios; si queda residuo
inmutable (confirmadas por diseño), lo reporta como residuo honesto, no como limpieza completa.

## Decisión 5 — Gate de inmutabilidad en CT en la capa API

`removeCertificadoCT` es inmutable por diseño y hoy vive en el store. Al migrar CT, la regla
se aplica en la ruta API (rechazo explícito con 409 o 400 documentado), no en el cliente, para
que un consumidor distinto del lab no pueda saltarla. El gate deuda/saldo de
`page.tsx:1075-1095` se porta a la misma ruta.

## Alternativas descartadas

- **Tocar el store legacy**: congelado por decisión de arquitectura (STORE_VERSION=28); además
  multiplica el diff sin resolver el desfase.
- **`skip_specs`**: la migración cambia comportamiento observable del lab → sí toca specs, así
  que lleva deltas (2 requirements ADDED en `LAB-mejoras`).
- **Migrar las 4 fases en un solo change/ventana**: el recon lo descarta por tamaño (FI sola es
  una ventana). PI/PL ya están; este change cubre FI y CT.
- **Escribir a BD y espejar al store** (lo que hace PL de forma transitoria): se acepta sólo
  donde un consumidor legacy todavía lo exige; para FI/CT el objetivo es no espejar.

## Decisión 6 — Dependencias descubiertas al implementar la Fase 1.3 (2026-10-07)

Al intentar migrar `cargarFase13FI` aparecieron **dos dependencias duras** que el plan original no
había declarado. Se documentan acá y se re-ordenan las fases; **no** se implementa a medias.

### D6.1 — Los pasos 7, 8, 9 y 10 dependen de otras fases todavía en store

Evidencia (`app/admin/qa-lab/page.tsx:781-855`):

| Paso | Qué hace | Depende de |
| --- | --- | --- |
| 7 (`:826-835`) | paga la multa TEST `concepto === "multa_in"` con descuento justificado | cobro creado por la fase **IN** (`:647`: `cargoFIReferencia` → `cobrosFI` del store) |
| 8 (`:837-841`) | assert de conexión IN: `infraccionesIN` + cobro `origenRef === "test-in-grave"` | fase **IN** |
| 9 (`:842-846`) | assert de conexión RA: `reservasRA["test-ra-rs-1"]` + cobro `origenRef === "test-ra-rs-1"` | fase **RA** |
| 10 (`:847-849`) | `saveProyectoMT` rechazado por saldo insuficiente | fase **MT** (store) |

Mientras IN y RA sigan escribiendo al store, migrar los cobros de FI a BD deja las assertes 7-9
leyendo un mundo y escribiendo otro: el reporte del lab **seguiría en verde mintiendo**, que es
exactamente el defecto que este change existe para cerrar.

**Decisión**: los pasos 7-9 pasan a una fase propia (**Fase 1.5**) que arranca después de migrar IN y
RA; el paso 10 va con MT. La Fase 1.3 migra sólo los pasos FI puros (1, 2, 3, 4, 5, 6 y 11).

### D6.2 — No existe hoy una purga BD segura para FI

- `app/admin/qa-lab/page.tsx:1372-1377`: el bloque FI de `limpiar()` purga **sólo el store**.
- `scripts/higiene-qa-test.mjs:15-17`: la regla de seguridad vigente es **"NUNCA toca:
  personas (seed real), fondos/egresos/ingresos (punto cero)"**, y el purgado por modelo no
  incluye `cobroFI` ni `emisionGC`.

Si FI pasa a escribir BD sin extender la higiene, cada corrida del lab **deja residuo TEST en BD**
y el gate `e2e/flujo/poblamiento.spec.ts` (que hoy falla justamente por higiene de dos mundos)
empeora en vez de mejorar.

**Decisión**: la purga BD de FI es una unidad propia (**Fase 1.4**) y **exige ampliar una regla de
seguridad deliberadamente conservadora**. Reglas que debe cumplir, en este orden:

1. Purga **por API** (delete dedicado o `DELETE` existente), no por script de BD, para que el guard
   de integridad y el scoping por comunidad sigan aplicando.
2. Allowlist explícita de ids TEST (`test-fondo-*`, `test-egr-*`, `cob-*` de origen TEST,
   emisiones TEST) — nunca por patrón laxo sobre `fondoFI`/`egresoFI`.
3. Si un `DELETE` de la API no existe, se crea con guard de referencias (mismo criterio que
   `fondos-fi/[id]:beforeDelete`), y el script `e2e:higiene` **no** se relaja.

Consecuencia: la Fase 1.3 **no** cierra el 30/30 del lane P3 por sí sola; el verde llega con
1.4 + 1.5 + CT (Fase 2). El `tasks.md` refleja este orden.

### D6.3 — FI depende de EF/VU: la unidad TEST no existe en BD (la dependencia decisiva)

**Evidencia medida contra `prisma/dev.db` (2026-10-07):**

```text
unidades BD: 167 | con prefijo test-*: 0
muestra ids: u-1791231835354-7hmzld/QA-9999, u-A-101/101, u-A-102/102, …
vinculos propietario: 34 | sobre unidades test-*: 0
test-u-999 existe: false
```

`POST /api/emisiones-gc` lee las unidades **de BD** (`app/api/emisiones-gc/route.ts:88-101`) y las
filtra por `parsed.data.unidadIds`. Como `test-u-999` —la unidad que usa el paso 3 de
`cargarFase13FI` (`app/admin/qa-lab/page.tsx:792-798`)— **no existe en BD**, la petición cae en

```text
if (elegibles.length === 0) return jsonError(400, "No hay unidades elegibles para la emisión.")
```

Es decir: **migrar el paso 3 a la API lo pone en rojo**, no en verde. Y los pasos 5 y 6 (pago y
mora) dependen de que la emisión haya creado cobros en BD. El paso 4 “pasaría” por el motivo
equivocado (bloqueo global en vez del responsable de `test-u-999`).

Causa: las fases **EF/VU** (estructura física y unidades) siguen escribiendo al store
(`page.tsx:320-403`: `saveMaestro`, `saveTipoUnidad`, `savePersona`, `saveMacroSector`,
`saveMicroSector`, `saveUnidad`, `saveVinculo`) y **nunca** crean la unidad TEST en BD.

**Decisión (invierte el orden del plan)**: la migración arranca por la **estructura**, no por FI.
El grafo de dependencias real es:

```text
EF/VU (unidades + vinculos + personas TEST a BD)  →  FI  →  CT
                                          ↘  IN / RA / MT  →  conexiones (1.5)
```

> Lección de método: propuse “FI primero” leyendo **escrituras** de la fase FI. Las escrituras se
> migran fácil; lo que **rompe** es lo que la fase **lee** (unidades, vinculos, actas, cobros de
> otras fases). El orden correcto se deriva de las **lecturas**, no de las escrituras.

## Decisión 7 — Fase 0 escribe API **y** store (espejo transitorio, con criterio de retiro)

**Pregunta que apareció al implementar**: si las fases de estructura (maestros, tipos, sectores,
unidades, personas, vínculos) escriben **sólo** a la API, los **~13 pasos siguientes** del lab que
siguen leyendo el store (FI, AD, GD, CO, GE, IR, IN, MT, RA, PE, PL, CT, RE) se rompen: leen un store
vacío. 

**Decisión: espejo transitorio — escribir a la API *y* mantener la escritura al store** durante la
migración. Motivos:

1. Es el patrón que **este mismo repo ya adoptó** para PL (`openspec/specs/LAB-mejoras/spec.md`:
   “La liquidación BD se refleja al store como espejo transitorio … para los consumidores legacy”).
   No se inventa una regla nueva.
2. Migrar de abajo hacia arriba (estructura → FI → CT) exige que los consumidores de arriba sigan
   funcionando **mientras** se migran. El espejo es lo que permite migrar en incrementos verdes.
3. La alternativa (API-only) tiene un costo medible: **regresión de ~13 fases** del lab y del e2e
   `poblado-idempotente`.

**El espejo es transitorio y tiene criterio de retiro explícito**: una escritura al store sólo puede
borrarse cuando **todos** los lectores de ese dato ya leen BD. El `tasks.md` registra la
verificación de cada retiro.

> Riesgo aceptado y visible: el espejo mantiene la doble fuente durante la transición. Es un estado
> **temporal y declarado**, no el estado final; el objetivo del change sigue siendo que BD sea la
> única fuente, y el retiro del espejo es parte de la Fase 3 de cierre.

## Decisión 8 — Guard 409 de FI: excepción TEST acotada al entorno del QA-Lab (2026-10-07)

**Pregunta abierta en T9**: `DELETE /api/cobros-fi/[id]` devuelve **409 si el cobro tiene pagos**
(`app/api/cobros-fi/[id]/route.ts:68`) y el poblamiento FI **paga** sus cobros. D6.2 exige purga
**por API** (guard y scoping por comunidad aplicando) y prohíbe relajar `e2e:higiene`. ¿Cómo cierra
la Fase 1.4? El owner delegó la decisión al agente (2026-10-07).

**Decisión: excepción de procedencia TEST, con el predicado compartido ya existente y acotada al
entorno donde el QA-Lab existe.**

1. **Predicado único, ya existente**: `esCobroTest()` (`lib/qa-lab-helpers.ts:130`) =
   `id | unidadId | origenRef` con prefijo `test-`. Es el mismo predicado que usa la purga del lab:
   una sola definición de "cobro TEST", sin patrones nuevos que auditar.
2. **Gate de entorno**: la excepción sólo está activa con `getAppEnv() === "development"`
   (`lib/env-guard.ts`), el mismo criterio que hace visible el QA-Lab (`page.tsx`, `isDev`). Fuera de
   ese entorno el endpoint es idéntico al de hoy: **409 siempre**. El build prod de CI e2e corre con
   `APP_ENV=development`, así que el lane conserva la capacidad de purgar.
3. **Nada más cambia**: el guard sigue aplicando para filas reales (cobro con pagos sin procedencia
   TEST → 409), el scoping por comunidad se evalúa antes y el orden de purga hijos→padres evita los
   guards de referencias.
4. **Tests de ruta obligatorios**: TEST con pagos → 200 en dev; real con pagos → 409; TEST con pagos
   en entorno production → 409 (excepción inerte).

**Alternativas rechazadas**:
- *Purga por script* (`e2e:higiene`): viola D6.2 regla 1 — perdería el scoping por comunidad y el
  guard de integridad, y la regla 3 prohíbe relajar el script.
- *Residuo honesto*: deja la BD dev sucia entre corridas y contradice el objetivo del change (punto
  de partida determinista para el lane).
- *Ruta destructiva nueva TEST-scoped*: segunda vía de borrado financiero; más superficie que un
  predicado acotado en la ruta existente.

**Secuencia**: la Fase 1.4 se implementa **después de 1.3a** (hasta que la migración FI escriba BD no
hay filas FI TEST que purgar; los tests de ruta fabrican las suyas). Con esta decisión, la Fase 1.4
queda desbloqueada y sin dependencia del owner.
