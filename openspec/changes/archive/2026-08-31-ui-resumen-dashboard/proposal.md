# Proposal: ui-resumen-dashboard — Resumen de Inicio en /dashboard

## Why

El grupo "Inicio" del sidebar apunta a `/dashboard` y hoy cae en placeholder cubierto por `RUTAS_PENDIENTES` (badge "Próximamente"). `UI-navegacion-lateral` lo exige como MUST. Se necesita una landing gerencial read-only que el admin vea al entrar: KPIs clave del store + accesos rápidos a los módulos principales, sin duplicar edición ni cambios de esquema.

## What Changes

- Nueva página `/dashboard` (client, `app/dashboard/page.tsx`) read-only: heading "Resumen" + grid de 6-8 KPI cards desde `useCompassStore` (colecciones verificadas en `lib/store.ts`: `unidades`, `personas`, `vinculos`, `tiposUnidad`, `macroSectores`/`microSectores`, `maestros.estadosOcupacion`, `eventos`) y sección de accesos rápidos a módulos principales.
- Cada KPI card muestra valor numérico no vacío del seed, label, y link al módulo fuente.
- Skeleton mientras `!hasHydrated` (patrón `/admin/metricas`).
- Quitar `/dashboard` de `RUTAS_PENDIENTES` en `components/app-sidebar.tsx`.
- e2e read-oriented `e2e/crud/dashboard.spec.ts`.

## Capabilities

### New Capabilities
<!-- none - change is on existing spec -->

### Modified Capabilities
- `UI-interfaz-principal`: ADDED requirement "Resumen de Inicio" — al navegar `/dashboard` el admin ve un resumen con indicadores clave del store y navegación rápida a módulos; read-only.

## Impact

- Nuevo archivo `app/dashboard/page.tsx` (solo lectura, sin cambios de esquema/store ni bump `STORE_VERSION`).
- Modificación quirúrgica de `components/app-sidebar.tsx` (quitar una entrada de `RUTAS_PENDIENTES`).
- Nuevo e2e `e2e/crud/dashboard.spec.ts` (sin impacto en producción).
- Delta spec en `UI-interfaz-principal` (ADDED).
