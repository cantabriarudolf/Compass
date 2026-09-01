# Proposal: pe-paqueteria-vista — Vista dedicada Encomiendas en /operaciones/paqueteria

## Why

El menú lateral expone "Operaciones → Encomiendas" como ruta pendiente (`RUTAS_PENDIENTES`) exigida por `UI-navegacion-lateral` como MUST y hoy muestra badge "Próximamente". El contenido funcional ya existe como tab "Encomiendas" dentro de `/operaciones/bitacora` (colección `encomiendasPE`, acciones `saveEncomiendaPE`/`registrarRetiroEncomiendaPE`/`removeEncomiendaPE`, eventos `PE_ENCOMIENDA_RECIBIDA/RETIRADA`). Extraer ese contenido a una vista dedicada reutilizable cierra el 100% del menú (última ruta pendiente) sin duplicar edición ni cambios de esquema.

## What Changes

- **Refactor previo (sin cambio de comportamiento):** extrae JSX/lógica del tab "Encomiendas" de `app/operaciones/bitacora/page.tsx` a componente reutilizable `components/pe/encomiendas-panel.tsx`; bitácora conserva su tab renderizando ese componente (suite e2e `bitacora.spec.ts` debe seguir verde).
- Nueva página `/operaciones/paqueteria` (client, `app/operaciones/paqueteria/page.tsx`) que renderiza el componente extraído en layout propio sin tabs de bitácora, con heading "Encomiendas" y selector de día compartido; read-only sobre store existente sin bump `STORE_VERSION` salvo extracción de código.
- Quitar `/operaciones/paqueteria` de `RUTAS_PENDIENTES` en `components/app-sidebar.tsx` — al terminar, `RUTAS_PENDIENTES` queda vacío.
- e2e `e2e/crud/paqueteria.spec.ts`: goto, heading + presencia del panel encomiendas (labels reales), flujo real recepción TEST-* → fila, 0 pageerror; no-regresión `e2e/crud/bitacora.spec.ts` verde.

## Capabilities

### New Capabilities
<!-- none - change is on existing spec -->

### Modified Capabilities
- `PE-personal-servicios`: ADDED requirement "Vista Encomiendas" — ruta dedicada `/operaciones/paqueteria` que renderiza el panel de encomiendas con el mismo modelo de datos y acciones del store (`encomiendasPE`), reutilizando el componente extraído de bitácora. Recepción con courier/ evidencia D1 y retiro requiere quién retira (registro auditable).

## Impact

- Nuevo archivo `components/pe/encomiendas-panel.tsx` (extracción).
- Nuevo archivo `app/operaciones/paqueteria/page.tsx` (solo lectura/acciones existentes, sin esquema nuevo).
- Modificación quirúrgica de `app/operaciones/bitacora/page.tsx` (usa componente extraído).
- Modificación quirúrgica de `components/app-sidebar.tsx` (quitar última entrada de `RUTAS_PENDIENTES` → Set vacío).
- Nuevo e2e `e2e/crud/paqueteria.spec.ts` (sin impacto en producción).
- Delta spec en `PE-personal-servicios` (ADDED).
