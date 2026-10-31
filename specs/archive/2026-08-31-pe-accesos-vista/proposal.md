# Proposal: pe-accesos-vista — Vista dedicada Accesos y Visitas en /operaciones/accesos

## Why

El menú lateral expone "Operaciones → Accesos y Visitas" como ruta pendiente (`RUTAS_PENDIENTES`) exigida por `UI-navegacion-lateral` como MUST y hoy muestra badge "Próximamente". El contenido funcional ya existe como tabs "Visitas" y "Contratistas" dentro de `/operaciones/bitacora` (colecciones `bitacoraVisitasPE`, `ingresosContratistasPE`). Extraer ese contenido a una vista dedicada reutilizable cierra el 100% del menú sin duplicar edición ni cambios de esquema.

## What Changes

- **Refactor previo (sin cambio de comportamiento):** extrae JSX/lógica de los tabs "Visitas" y "Contratistas" de `app/operaciones/bitacora/page.tsx` a componentes reutilizables `components/pe/visitas-panel.tsx` y `components/pe/contratistas-panel.tsx`; bitácora conserva sus tabs renderizando esos componentes (suite e2e `bitacora.spec.ts` debe seguir verde).
- Nueva página `/operaciones/accesos` (client, `app/operaciones/accesos/page.tsx`) que renderiza los componentes extraídos en layout propio sin tabs de bitácora, con heading "Accesos y Visitas" y selector de día compartido; read-only sobre store existente sin bump `STORE_VERSION` salvo extracción de código.
- Quitar `/operaciones/accesos` de `RUTAS_PENDIENTES` en `components/app-sidebar.tsx`.
- e2e read-oriented `e2e/crud/accesos.spec.ts`: goto, heading + presencia de paneles de visitas/contratistas (labels reales), 0 pageerror; no-regresión `e2e/crud/bitacora.spec.ts` verde.

## Capabilities

### New Capabilities
<!-- none - change is on existing spec -->

### Modified Capabilities
- `PE-personal-servicios`: ADDED requirement "Vista Accesos y Visitas" — ruta dedicada `/operaciones/accesos` que renderiza los paneles de visitas y contratistas con el mismo modelo de datos y acciones del store (`bitacoraVisitasPE`/`ingresosContratistasPE`), reutilizando los componentes extraídos de bitácora.

## Impact

- Nuevos archivos `components/pe/visitas-panel.tsx`, `components/pe/contratistas-panel.tsx` (extracción).
- Nuevo archivo `app/operaciones/accesos/page.tsx` (solo lectura/acciones existentes, sin esquema nuevo).
- Modificación quirúrgica de `app/operaciones/bitacora/page.tsx` (usa componentes extraídos).
- Modificación quirúrgica de `components/app-sidebar.tsx` (quitar entrada de `RUTAS_PENDIENTES`).
- Nuevo e2e `e2e/crud/accesos.spec.ts` (sin impacto en producción).
- Delta spec en `PE-personal-servicios` (ADDED).
