## ADDED Requirements

### Requirement: Resumen de Inicio — landing gerencial en /dashboard
El sistema SHALL proveer la vista `/dashboard` como resumen gerencial read-only: al navegar a `/dashboard` el admin ve un heading "Resumen" con indicadores clave derivados de `useCompassStore` y una sección de accesos rápidos a módulos principales; sin mutaciones y sin cambios de esquema.

#### Scenario: Acceso al Resumen
- **WHEN** el usuario navega a `/dashboard`
- **THEN** el sistema muestra el heading "Resumen" (o "Resumen de Inicio") y una descripción de landing gerencial
- **AND** renderiza un grid de al menos 4 KPI cards con valores numéricos no vacíos provenientes del seed.

#### Scenario: KPIs desde colecciones verificadas del store
- **WHEN** la vista carga datos del store
- **THEN** cada KPI SHALL derivar de colecciones existentes verificadas en `lib/store.ts` (ej. `unidades`, `personas`, `vinculos`, `tiposUnidad`, `macroSectores`/`microSectores`, `maestros.estadosOcupacion`, `fondosFI`)
- **AND** el valor mostrado SHALL ser no vacío y consistente con el seed (nada inventado).

#### Scenario: Card KPI con link al módulo fuente
- **WHEN** una KPI card se renderiza
- **THEN** muestra label, valor numérico y link al módulo fuente (ej. Unidades → /inventario/estructura)
- **AND** usa estética consistente con el resto (Card/Badge).

#### Scenario: Accesos rápidos
- **WHEN** el Resumen se renderiza
- **THEN** muestra un grid de accesos rápidos a al menos 4 módulos principales (links verificables a rutas existentes).

#### Scenario: Skeleton durante hidratación
- **WHEN** `hasHydrated === false`
- **THEN** la vista muestra skeleton (`animate-pulse`) en lugar de los KPIs.

#### Scenario: Navegación lateral habilitada
- **WHEN** la vista existe
- **THEN** `/dashboard` ya no pertenece a `RUTAS_PENDIENTES` en `AppSidebar` y el item "Resumen" es navegable sin badge "Próximamente".

#### Scenario: Ruta distinta de home
- **WHEN** el usuario visita `/` y `/dashboard`
- **THEN** ambas rutas existen y son distintas (home GECOS vs Resumen gerencial).
