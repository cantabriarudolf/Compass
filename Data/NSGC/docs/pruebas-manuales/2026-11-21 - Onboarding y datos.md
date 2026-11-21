# Onboarding y datos — los dos escenarios de prueba (2026-11-21)

Hermana de `2026-11-21 - Catalogos de estados.md`. Esa página valida **pantallas**; ésta
valida **de dónde salen los datos** y si una comunidad nueva puede quedar operativa.

Hay dos escenarios y no son intercambiables:

- **A · Datos demo** — moverte por el sistema con todo cargado para ver comportamiento.
- **B · Onboarding real** — una comunidad nueva donde el administrador carga su histórico.

---

## 0. Estado medido de esta base (2026-11-21, rama de desarrollo)

| Entidad | Filas | Lectura |
|---|---|---|
| Comunidades | 3 | OK |
| Tipos de unidad | 5 | OK |
| Macro / micro sectores | 7 / 25 | OK |
| Unidades | 166 | OK — estructura completa |
| Personas | **55** | **parcial** (la semilla trae 105) |
| Vínculos | **52** | **parcial** (la semilla trae 185) |
| Usuarios | 8 | OK |
| Fondos FI | 4 | OK |
| Cobros FI | **0** | **vacío** |
| Emisiones GC | **0** | **vacío** |
| Configuración global | 1 | OK |

**Conclusión del estado:** la base tiene **la estructura completa y el padrón a medias**, y
**el motor financiero sin arrancar**. Se puede recorrer inventario, personas y vínculos; no se
puede ver una emisión de gastos comunes ni una cobranza con datos reales.

Cliente de Prisma verificado en **postgres** (no hay que confirmarlo: está hecho).

---

## Escenario A · Datos demo completos

La semilla es un script, **no una pantalla**: `npm run seed:datos` (`scripts/seed-db-from-data.ts`).

- Es **upsert por id** y **no borra**: correrlo dos veces no duplica.
- Escribe tipos de unidad, macro/micro sectores, 166 unidades, 105 personas, 185 vínculos,
  configuración global, maestros administrativos, estados de ocupación, tipos de infracción y
  documentos; al final **verifica conteos**.
- Comunidad destino: `--comunidad-id`, o `COMUNIDAD_ID`, o la primera de la base. Sin ninguna,
  crea «Edificio Plaza Central».
- Cadena completa de QA: `npm run e2e:reseed-base` = `seed:authz` → `seed:datos` →
  `db:catalogo-nacional` → `db:punto-cero` → `db:fondos-fi`.

> ⚠️ **La trampa:** si el padrón se cargó antes por CSV, esas personas tienen ids `imp-p-` y las
> de la semilla tienen otros ids. El upsert **no las pisa**: te quedan las dos poblaciones
> sumadas. Antes de sembrar, decidí si querés el padrón demo **o** el que importaste — no los dos.

**Checklist A**

- [ ] `npm run seed:datos -- --comunidad-id=<la tuya>` termina sin error y reporta los conteos.
- [ ] `/comunidad/personas` muestra el padrón completo (105) y los contadores por estado cuadran.
- [ ] `/inventario/estructura` muestra 166 unidades con sus sectores.
- [ ] `npm run db:fondos-fi` deja fondos; sin fondos no hay cobros posibles.
- [ ] Al terminar, la base tiene cobros y emisiones: recién ahí el escenario A sirve para probar
      cobranza, avisos y morosidad.

---

## Escenario B · Onboarding de una comunidad nueva

### B1. Lo que se puede cargar en masa (y con qué)

| Paso | Qué carga | Herramienta | Formato |
|---|---|---|---|
| 1 | Tipos de unidad y estados de ocupación | **No hay import**: alta manual (`/inventario/tipos`, `/admin/maestros`) o semilla nacional | — |
| 2 | Sectores + unidades | **CSV** · `/admin/carga-inicial` bloque *Estructura* → `POST /api/importar/estructura` | 9 columnas, clave `rol_sii` |
| 3 | Padrón | **CSV** · bloque *Personas* → `POST /api/importar/personas` | 6 columnas, clave `rut` |
| 4 | Vínculos persona↔unidad | **CSV** · bloque *Vínculos* → `POST /api/importar/vinculos` | 5 columnas, clave persona+unidad+rol |
| — | Cartola bancaria (conciliación) | **CSV/JSON** · `/api/conciliacion/importar` | formato del banco, todo-o-nada |
| — | Histórico financiero 2023-24 | **script** · `scripts/migrate-punto-cero-a-db.ts` | JSON del owner |

Cada bloque tiene **plantilla descargable** y **vista previa** (`?dryRun=1`) que no escribe; el
botón «Importar» queda bloqueado hasta que la vista previa da 0 errores. Las filas de la
plantilla vienen marcadas `EJEMPLO-` y el importador las rechaza a propósito.

### B2. Lo que **no** se puede cargar en masa — y si hay pantalla o no

La distinción importa: «no hay import» es tedioso; «no hay pantalla» sería imposible. **Salvo un
campo, todo tiene pantalla**: un administrador puede armar su comunidad hoy, a mano.

| Qué | Import masivo | ¿Pantalla? | Dónde |
|---|---|---|---|
| Fondos FI | no | **sí** | `/finanzas/gastos-comunes` pestaña Fondos |
| Emisión de GC + cobros | no | **sí** | `/finanzas/gastos-comunes` pestaña Emisión GC |
| Presupuesto | no | **sí** (sólo ofrece acuerdos aprobados) | `/admin/gestion/presupuestos` |
| Acuerdo (alta y cierre con votos) | no | **sí** | `/comunidad/directiva/acuerdos` |
| Configuración global | no (singleton) | **sí**, salvo `firmaDigitalizadaUrl` | `/admin/configuracion` |
| Usuarios y roles | no | **sí** (exige persona del padrón con email) | `/admin/usuarios` |
| Maestros: AFP, salud, mutuales, bancos, índices, feriados, unidades de medida | no | **sí, fila por fila** | `/admin/maestros`; feriados también en `/personas/personal` |
| Tipos de unidad y estados de ocupación | no | **sí** | `/inventario/tipos`, `/admin/maestros` |
| Medidores de servicios y etiqueta de sector | no (el CSV no los trae) | **sí**, después del import | `/inventario/estructura` |
| Tipos de infracción | no | **sí** | `/finanzas/multas` |
| Proveedores, ficha laboral, liquidaciones | no | **sí** (la ficha laboral se crea sobre una persona existente) | `/operaciones/proveedores`, `/personas/personal`, `/finanzas/remuneraciones` |
| Fotos, certificados, actas PDF | no | **sí**, uno por uno | según módulo |
| Micro sector **sin unidades** | no | no aplica | el formato es una fila = una unidad |

### B3. El orden (no es opcional: hay FK)

```
Comunidad
  → maestros: tipos de unidad + estados de ocupación   (la unidad los exige no nulos)
    → estructura: sectores + unidades                  (macro/micro los crea el propio CSV)
      → personas                                       (clave RUT)
        → vínculos                                     (falla si falta la persona o la unidad)
          → configuración global (firmante, SMTP)
            → acuerdo aprobado → presupuesto
              → fondos → emisión GC → cobros → avisos
```

Reglas duras verificadas en el código:
- `Unidad` exige `microSectorId`, `tipoUnidadId` y `estadoId`: **no** se importan unidades antes
  que tipos de unidad y estados de ocupación.
- Un vínculo sin persona («no existe la persona con RUT») o sin unidad («no existe la unidad con
  Rol SII») **falla la fila**.
- `CobroFI` exige `unidadId` y `fondoId`; `EgresoFI` exige `fondoId`.

### B4. ¿Alcanza con cargar los tres CSV para que el engranaje ruede?

**No.** Con estructura + personas + vínculos tenés el **padrón**: se puede navegar, ver fichas y
asignar roles. Pero el sistema *no opera* hasta que además existan, en este orden:

1. **Configuración global** de la comunidad (identidad, firmante derivado, SMTP) — sin firmante no
   se emiten papeles; sin SMTP el correo queda `pendiente` (y así se reporta, no se finge).
2. **Maestros nacionales** (AFP, salud, bancos, feriados) — sin ellos no hay liquidaciones ni
   cálculo de días hábiles de un corte.
3. **Fondos** — sin `fondoId` no se puede registrar un cobro ni un egreso.
4. **Acuerdo aprobado → presupuesto** — la emisión de gastos comunes se contrasta contra el
   presupuesto vigente.
5. **Emisión de GC del período** — es la que crea los cobros en bloque; los cobros no se importan.
6. **Usuarios y membresías** — para que un residente entre y vea su deuda.

**Criterio de aceptación del onboarding** (esto es «el engranaje rueda», verificable):

- [ ] Un residente entra con su usuario y ve **su** unidad y **su** deuda.
- [ ] El administrador emite el período y aparecen los cobros de todas las unidades.
- [ ] Se emite un aviso de cobro y la notificación llega al visor del residente.
- [ ] Se genera un papel (certificado o aviso) con el firmante derivado y el encabezado completo.
- [ ] Un corte de servicios calcula los días hábiles con los feriados de la comunidad.
- [ ] Se registra un pago y la morosidad de la unidad baja.
- [ ] La bitácora muestra los eventos de la carga (alta de unidad, importación, emisión).

---

## Lo que hay que decidir antes de probar B

1. **¿La comunidad nueva arranca vacía o con la semilla demo?** Arrancar con la semilla y editar
   encima deja ids de demo (`imp-u-`, `imp-p-`) en una comunidad real.
2. **¿El histórico financiero entra por script o se escribe a mano?** Hoy sólo existe el script
   del caso 2023-24 (`data/finanzas/punto-cero-2324.json`); para otro formato no hay camino.
3. **¿Qué se acepta cargar después del import?** Medidores, etiqueta de sector y ficha laboral
   quedan pendientes y son manuales uno por uno: conviene saber cuántas filas son antes de empezar.

---

## B5 · Lo que realmente falta para que el MVP esté saldado

Tres cosas, ya anotadas en `specs/PENDIENTES-FUNCIONALIDAD.md` con su medición:

- **F46 · Los catálogos nacionales de una comunidad nueva arrancan vacíos.** Todos los maestros
  cuelgan de `comunidadId`, así que una comunidad nueva ve AFP, salud, mutuales, bancos, índices y
  feriados **en blanco**. Hay pantalla fila por fila y existe el script
  `seed-catalogo-nacional.ts`, pero **nada en la UI lo invita**. Sin AFP ni salud no hay
  liquidación; sin feriados el corte no calcula el día hábil; sin bancos no se concilia.
- **F47 · No hay flujo de arranque que diga qué falta.** El orden está escrito en el manual 41, no
  en la pantalla: el administrador descubre cada dependencia al chocar con un 400 («No existe un
  Fondo de Gasto Común activo…», «El libro no tiene acuerdos aprobados…»). Falta una pantalla que
  liste los pasos con su estado y enlace a cada uno.
- **F48 · El histórico financiero sólo entra por el script del caso 2023-24.** Los cobros los crea
  la emisión y los pagos se registran de a uno; no hay import de egresos, ingresos ni pagos. Una
  comunidad que llega con dos años en una planilla arranca en cero.

**Traducción para la prueba manual:** el sistema **se puede** dejar operativo a mano hoy —una
tarde larga tipeando maestros— pero **no hay onboarding de producto**. Si el MVP pide «el
administrador carga su comunidad y opera», falta F46 (sin eso no opera) y F47 (sin eso no sabe qué
le falta). F48 es decisión de formato.
