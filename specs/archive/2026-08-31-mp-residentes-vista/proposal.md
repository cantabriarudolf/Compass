## Why

El menú lateral expone "Personas → Residentes" como ruta pendiente (`RUTAS_PENDIENTES` en `AppSidebar`) exigida por `UI-navegacion-lateral` como MUST. Hoy ese item muestra badge "Próximamente" y bloquea el 100% del menú (SERIE-MENU-100 P2). Se necesita un directorio filtrado de residentes/propietarios sobre los datos existentes de MP (`personas`+`vinculos`) sin duplicar edición.

## What Changes

- Nueva página `/personas/residentes` (client, `app/personas/residentes/page.tsx`) read-only: directorio filtrado de personas con vínculo vigente (`!fechaFin`) y rol `propietario`/`arrendatario`, mostrando identidad, contacto, unidad vinculada y estado de cuenta; reutiliza patrón de grilla de `/comunidad/personas`.
- Link "Ver Ficha" hacia `/comunidad/personas/[id]` si el patrón existe (reutilizar, no duplicar edición).
- Skeleton mientras `!hasHydrated`.
- Quitar `/personas/residentes` de `RUTAS_PENDIENTES` en `k0mp4ss_fe/apps/web/components/app-sidebar.tsx` para habilitar navegación normal.
- e2e read-oriented `e2e/crud/residentes.spec.ts`.

## Capabilities

### New Capabilities
<!-- none - change is on existing spec -->

### Modified Capabilities
- `MP-maestro-personas`: ADDED requirement "Vista Residentes" — directorio filtrado por vínculo vigente propietario/arrendatario con unidad vinculada y estado; read-only sobre `personas`+`vinculos`.

## Impact

- Nuevo archivo `app/personas/residentes/page.tsx` (solo lectura, sin cambios de esquema/store ni bump `STORE_VERSION`).
- Modificación quirúrgica de `components/app-sidebar.tsx` (quitar una entrada de `RUTAS_PENDIENTES`).
- Nuevo e2e `e2e/crud/residentes.spec.ts` (sin impacto en producción).
- Delta spec en `MP-maestro-personas` (ADDED).
