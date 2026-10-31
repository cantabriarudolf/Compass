## Context

`AppSidebar` (`k0mp4ss_fe/apps/web/components/app-sidebar.tsx`) define `RUTAS_PENDIENTES` con `/dashboard` bloqueado; el grupo "Inicio" apunta a esa ruta y cae en placeholder. El dato vive en `lib/store.ts` (`unidades`, `personas`, `vinculos`, `tiposUnidad`, `macroSectores`/`microSectores`, `maestros.estadosOcupacion`, `eventos`, `fondosFI`, etc.) con seed en `data/inventario/estructura.ts` y `data/comunidad/personas.ts|vinculos.ts`. La referencia de KPIs es `app/admin/metricas/page.tsx` (client, `useStoreRehydrated`, `hasHydrated` skeleton, grid de `ModuleMetric` + `Card`). Se reutiliza ese patrón sin backend adicional. Ver proposal.md para motivación y specs para requisitos.

## Goals / Non-Goals

**Goals:**
- Proveer `/dashboard` read-only como landing gerencial: heading "Resumen" + KPIs clave del store (6-8 cards) + grid de accesos rápidos a módulos principales.
- KPIs con valores reales no vacíos del seed, verificados contra nombres exactos de colecciones en `lib/store.ts` (nada inventado).
- Cada KPI card con link al módulo fuente y estética consistente (Card/Badge).
- Habilitar navegación quitando `/dashboard` de `RUTAS_PENDIENTES`.

**Non-Goals:**
- Crear/editar/borrar entidades (solo lectura).
- Cambios de esquema/store/migración o bump `STORE_VERSION`.
- Dashboard con filtros o edición.

## Decisions

- **Client page reutilizando patrón metricas**: `app/dashboard/page.tsx` con `"use client"`, `useCompassStore` para colecciones verificadas, `useStoreRehydrated` y `hasHydrated` skeleton idéntico a metricas/personas. Alternativa descartada: Server Component — el store es Zustand client persistido.
- **KPIs elegidos (7, todos seed >0):** Unidades totales (`unidades.length`), Unidades ocupadas (`unidades.filter(u => u.estadoId === "en-uso").length`), Personas totales (`personas.length`), Residentes con vínculo vigente (propietario/arrendatario sin `fechaFin`), Tipos de unidad (`tiposUnidad.length`), Sectores (`macroSectores.length + microSectores.length` o separados), Estados de ocupación (`maestros.estadosOcupacion.length` o Fondos FI `fondosFI.length`). Todos verificables en `lib/store.ts` antes de renderizar. Fallback: si alguna colección vacía (no esperado en seed), card muestra 0 pero test exige ≥4 con números no vacíos; métricas vacías se omiten del assertion estricto.
- **Cálculo adicional útil:** ocupación = `unidades.filter(ocupada).length / unidades.length` mostrado como badge; morosidad no se usa porque `cobrosFI` seed vacío.
- **Accesos rápidos:** grid de Cards/links a 6 módulos principales (Estructura, Personas/Residentes, Bitácora, Finanzas, Métricas, Reportería) con iconos `@tabler/icons-react` y `next/link`.
- **Sidebar:** quitar literal `"/dashboard"` del `Set` `RUTAS_PENDIENTES`.

## Risks / Trade-offs

- [Colecciones vacías en seed] → KPI 0 rompe assertion ≥4 no vacíos. Mitigación: elegir solo colecciones con seed >0 (verificadas arriba). Test valida números mediante regex `\d` sobre cards.
- [Hydration mismatch] → Skeleton idéntico a metricas evita flash. `if (!hasHydrated) return skeleton`.
- [Ruta / vs /dashboard] → `/` ya existe (home GECOS) distinta de `/dashboard` (Resumen). No reutilizar `app/page.tsx`.

## Migration Plan

- Deploy: nuevo archivo page + e2e + sidebar tweak. No migración de datos.
- Rollback: revertir commit; `RUTAS_PENDIENTES` vuelve a incluir `/dashboard`.

## Open Questions

- Ninguna — KPIs y accesos quedan definidos en specs.
