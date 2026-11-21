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

### B2. Lo que **no** se puede cargar en masa, y por qué

| Qué | Por qué no | Qué se hace |
|---|---|---|
| Fondos, egresos, emisiones de GC, cobros | No hay importador; `CobroFI` exige `fondoId` y `unidadId` | Alta manual, o el script de histórico para el caso del owner |
| Presupuestos | Exige `acuerdoId` (un acuerdo foliado que lo aprueba) | Manual: acuerdo → presupuesto |
| Acuerdos y gobernanza (directiva, períodos, actas) | No hay import; el CSV de personas **descarta** los datos de gobernanza | Manual |
| Ficha laboral (jornadas, contratos, remuneraciones) | No hay import; el CSV escribe sólo `estadoCuenta: activa` | Manual |
| Usuarios, credenciales y roles | No hay import; se invita de a uno | `scripts/seed-authz.mjs` sólo para demo |
| Configuración global | Es singleton | Manual (`/admin/configuracion`) |
| Fotos, certificados, actas PDF | No hay import de binarios | Manual, uno por uno |
| Medidores de servicios y etiqueta de sector | El CSV no los trae: sectores nuevos quedan «Sector» y `servicios: {}` | Manual después de importar |
| Micro sector **sin unidades** | El formato es una fila = una unidad | No se puede expresar |

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
