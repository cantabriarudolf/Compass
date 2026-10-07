# Proposal: qlab-poblamiento-api-rest

## Contexto

El QA-Lab popula la comunidad de prueba con dos "mundos" distintos y desincronizados:

- **Store legacy** (`lib/store.ts`, congelado en `STORE_VERSION=28`, acciones `@deprecated`,
  fuente de verdad = BD): `app/admin/qa-lab/page.tsx:781` (`cargarFase13FI`, 11 pasos) y
  `:1064` (`cargarFase15CT`) escriben **100 % al store**.
- **API REST** (BD): las fases PI (`:428`) y PL (`:949`) ya migraron y quedaron documentadas
  como requirements en `openspec/specs/LAB-mejoras/spec.md`.

Las páginas reales leen **BD vía API**, así que lo que puebla FI/CT **no se ve** en
`/inventario/estructura`, `/finanzas/gastos-comunes` ni `/finanzas/certificados`. El gap está
documentado como causa raíz P4:

- `openspec/NIGHT-AUDIT/reporte.md:135` — "Riesgo ALTO (QA-Lab legacy vs BD)".
- `openspec/NIGHT-AUDIT/reporte.md:191` — "Poblamiento escribe store legacy, páginas leen BD vía API (causa raíz P2/P3)".
- `openspec/SERIE-E2E-FULL-VERDE/00-plan.md:115,119` — "migrar poblamiento QA-Lab a API (serie nueva, fuera del cap P4)".

**Evidencia ejecutada (NOCHE-2026-10-07, ítem 3)**: el lane P3 dejó
`e2e/flujo/poblamiento.spec.ts` test1 **rojo** en el paso de limpieza; el spec espera
"TEST-* limpio correctamente" y no aparece porque la higiene es de dos mundos y el store no
puede podar filas TEST que sólo existen en BD (y viceversa). Los tests 2 y 3 del mismo archivo
ya son verdes porque usan fixtures TEST-* propias vía API (`e2e/helpers/datos-test.ts`).

## Objetivo

Que el poblamiento QA-Lab de **FI y CT** escriba **BD vía API REST** (fuente de verdad),
con ids fijos `test-*` para ser idempotente, de modo que lo poblado sea **visible en las páginas
reales** y la higiene de dos mundos cierre sin residuos. Con eso el lane
`e2e/flujo/poblamiento.spec.ts` queda 3/3 y el gap P4 baja de "riesgo ALTO" a cerrado para
FI/CT.

## Alcance

Dentro (por fases, ver `tasks.md`):

1. **FI (Estructura Física / fondos e ingresos)** — migrar `cargarFase13FI` (11 pasos) y las
   3 conexiones cross-módulo (IN/RA/MT) a API REST. Reusar `app/api/fondos-fi/route.ts`,
   `app/api/egresos-fi/route.ts`, `app/api/cobros-fi/route.ts`,
   `app/api/emisiones-gc/route.ts`; crear las acciones faltantes:
   pago, mora y retiro de fondo (hoy sólo existe el `PUT` factory de `cobros-fi/[id]` y el
   `DELETE`-guard de `emisiones-gc/[id]`).
2. **CT (Certificados de Trabajo)** — usar `POST /api/certificados-ct` (hoy existe en
   `app/api/certificados-ct/route.ts:22` y **no se usa desde el lab**), portando el gate
   deuda/saldo y la inmutabilidad de `removeCertificadoCT` a la capa API.
3. **Cierre de higiene** — "Borrar todo lo de prueba" y el guard clean-first operando sobre
   BD+store sin residuos; `e2e/flujo/poblamiento.spec.ts` 3/3 verde.

Fuera de alcance:

- Borrar o modificar las acciones del **store legacy** (`@deprecated`, congelado). Se dejan
  como están, igual que en PI/PL.
- PI y PL: ya migrados y documentados.
- El adelanto `test-ade-1` de PL: sigue documentado como legacy (la spec viva ya lo declara
  "sin `/api/adelantos` por alcance"); si la fase 3 lo necesita para la higiene, se evalúa
  crear `POST /api/adelantos` y se modifica su requirement en ese momento (delta explícito).
- Refactors de centralización del store.

## Estimación de ventana (del recon)

- ~8-10 archivos: `app/admin/qa-lab/page.tsx` (2096 líneas), `lib/qa-lab-helpers.ts`,
  3-5 rutas nuevas, specs y el e2e del poblamiento.
- Rutas a reusar: ~9; rutas a crear: 3-5.
- **NO entra en una sola ventana.** Se parte en 3 fases/prompts: FI (la más grande, 11 pasos +
  3 conexiones) · CT + higiene de dos mundos · cierre e2e + NSGC.

## Riesgos

- **Idempotencia**: sin ids fijos, "Poblar todo" duplica filas. Mitigación: `test-*-qa` fijos y
  upsert, patrón ya probado en PI/PL.
- **Inmutables**: las confirmadas/liquidaciones confirmadas no se borran por diseño; la
  estrategia de periodos libres rotativos de PL ya resuelve ese residuo honesto.
- **Doble escritura**: si algo del lab sigue escribiendo al store, reaparece el desfase.
  Mitigación: el guard `tieneDatosTest(state, bd?)` cubre ambos mundos y hay tests por fase.

## Aceptación

- Las fases FI y CT del lab pueblan **BD** y lo poblado **se ve** en las páginas reales.
- `e2e/flujo/poblamiento.spec.ts` → **3/3**.
- Guard clean-first sin residuos TEST bloqueantes (dos mundos) en dos corridas consecutivas.
- Suite unitaria verde, `tsc` 0, `eslint` 0.
