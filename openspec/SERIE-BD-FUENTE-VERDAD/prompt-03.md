# FASE 3 — FI (Finanzas completo) + EF (Estructura Física)

> Copiar TODO este archivo y pegarlo en una ventana de chat nueva.  
> Modelo recomendado: **Muse Spark 1.3** (módulos autocontenidos).  
> Trabajo estimado: 1-2 ventanas.

---

## Contexto

Sos el arquitecto senior de Compass. Las Fases 0-2 migraron MP, VU, maestros, GD y AD.

Ahora toca el módulo más complejo: **FI (Finanzas y Morosidad)** y **EF (Estructura Física)**.

**Datos clave:**
- FI ya tiene espejo parcial a BD (`POST /api/fi/sync` para ingresos). Pero la UI sigue leyendo/escribiendo todo desde el store.
- `prisma/schema.prisma` tiene: `FondoFI`, `EgresoFI`, `IngresoFI`, `EmisionGC`, `CobroFI`, `TipoUnidad`, `MacroSector`, `MicroSector`, `Unidad`.
- El punto cero financiero (2023-2024) vive como seed en el store (`punto-cero-2324.json`).
- Hay 182 egresos históricos y 44 ingresos que deben migrarse a Prisma.
- Terminología: "comunidad" (jamás "condominio").
- No tocar `.env*`.

**Antes de empezar, leé:**
1. `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`
2. `apps/web/prisma/schema.prisma` (modelos FI + EF)
3. `apps/web/lib/schemas.ts` (FondoFISchema, EgresoFISchema, etc.)
4. `apps/web/lib/store.ts` (buscá las acciones de FI: saveFondoFI, saveEgresoFI, registrarIngresoFI, emitirGastoComun, etc.)
5. `apps/web/app/api/fi/sync/route.ts` (patrón batch idempotente existente)
6. `apps/web/data/finanzas/punto-cero-2324.json`

---

## Tareas

### 1. Completar espejo FI en BD

La estrategia es reemplazar el sync batch por endpoints REST individuales (más limpio y escalable):

Crear:
- `app/api/fondos-fi/route.ts` (GET, POST)
- `app/api/fondos-fi/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/egresos-fi/route.ts` (GET, POST)
- `app/api/egresos-fi/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/ingresos-fi/route.ts` (GET, POST)
- `app/api/ingresos-fi/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/emisiones-gc/route.ts` (GET, POST)
- `app/api/emisiones-gc/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/cobros-fi/route.ts` (GET, POST)
- `app/api/cobros-fi/[id]/route.ts` (GET, PUT, DELETE)

Cada endpoint:
- Scoping por `comunidadId` desde sesión
- Validación zod del body
- Authz: admin/directiva para escritura; residentes solo lectura de sus propios cobros

### 2. API routes para EF

Crear:
- `app/api/tipos-unidad/route.ts` (GET, POST)
- `app/api/tipos-unidad/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/macro-sectores/route.ts` (GET, POST)
- `app/api/macro-sectores/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/micro-sectores/route.ts` (GET, POST)
- `app/api/micro-sectores/[id]/route.ts` (GET, PUT, DELETE)
- `app/api/unidades/route.ts` (GET, POST)
- `app/api/unidades/[id]/route.ts` (GET, PUT, DELETE)

Validaciones de integridad:
- No eliminar `TipoUnidad` si tiene `Unidades` vinculadas.
- No eliminar `MacroSector` si tiene `MicroSectores`.
- No eliminar `MicroSector` si tiene `Unidades`.
- No eliminar `Unidad` si tiene `Vinculos` (verificar en Prisma).

### 3. Migrar punto cero a Prisma

Crear script: `scripts/migrate-punto-cero-a-db.ts`

Este script debe:
- Leer `data/finanzas/punto-cero-2324.json`
- Crear el fondo "Cuenta Corriente" en `FondoFI` (upsert por id)
- Crear los 182 egresos en `EgresoFI` (upsert por id)
- Crear los 44 ingresos en `IngresoFI` (upsert por id)
- Ser idempotente: correr 2× no duplica datos
- Usar el `comunidadId` del contexto (preguntar o usar un valor de prueba)

Instrucciones para correr:
```bash
npx tsx scripts/migrate-punto-cero-a-db.ts
```

### 4. Hooks de cliente SWR

Crear:
- `lib/api/use-fondos-fi.ts`
- `lib/api/use-egresos-fi.ts`
- `lib/api/use-ingresos-fi.ts`
- `lib/api/use-emisiones-gc.ts`
- `lib/api/use-cobros-fi.ts`
- `lib/api/use-tipos-unidad.ts`
- `lib/api/use-macro-sectores.ts`
- `lib/api/use-micro-sectores.ts`
- `lib/api/use-unidades.ts`

### 5. Adaptar UI

Modificar páginas para usar APIs:
- `/finanzas/fondos/page.tsx`
- `/finanzas/egresos/page.tsx`
- `/finanzas/ingresos/page.tsx`
- `/finanzas/gasto-comun/page.tsx`
- `/finanzas/morosidad/page.tsx`
- `/admin/estructura/tipos-unidad/page.tsx`
- `/admin/estructura/macro-sectores/page.tsx`
- `/admin/estructura/micro-sectores/page.tsx`
- `/admin/estructura/unidades/page.tsx`

### 6. Tests con validación en DB real

Crear:
- `test/api/fi-completo.test.ts`
- `test/api/ef-completo.test.ts`
- `test/migracion-punto-cero.test.ts`

Validar:
- Crear fondo → assert en Prisma
- Crear egreso → assert en Prisma
- `emitirGastoComun` crea `EmisionGC` + `CobroFI` en Prisma
- Punto cero migra correctamente (contar registros en DB)

---

## Criterios de aceptación

- [ ] `tsc` 0 errores.
- [ ] Tests verdes.
- [ ] Punto cero migrado a `dev.db` (182 egresos + 44 ingresos + 1 fondo).
- [ ] Todo el flujo de finanzas lee/escribe en Prisma.
- [ ] Estructura física lee/escribe en Prisma.
- [ ] Commitear.

---

## Al terminar

1. Commitear.
2. Actualizar `openspec/SERIE-BD-FUENTE-VERDAD/00-plan.md`.
3. Decirle al humano: "Fase 3 lista. Pasar a prompt-04.md (Operativos)."
