## ADDED Requirements

### Requirement: Vista Accesos y Visitas — ruta dedicada con paneles reutilizados de bitácora
El sistema SHALL proveer la vista `/operaciones/accesos` como ruta dedicada "Accesos y Visitas" que renderiza los paneles de control de visitas y de contratistas reutilizando los componentes extraídos de `/operaciones/bitacora`, con el mismo modelo de datos y acciones del store (`bitacoraVisitasPE`, `ingresosContratistasPE`, `saveBitacoraVisitaPE`/`ingresarBitacoraVisitaPE`/`removeBitacoraVisitaPE`/`saveIngresoContratistaPE`/`confirmarIngresoContratistaPE`/`removeIngresoContratistaPE`), sin cambios de esquema ni bump de `STORE_VERSION`.

#### Scenario: Acceso a la vista Accesos y Visitas
- **WHEN** el usuario navega a `/operaciones/accesos`
- **THEN** el sistema muestra el heading "Accesos y Visitas" (o "Accesos y Visitas — Bitácora") y descripción de control de accesos
- **AND** renderiza el panel de visitas (form con Nombre *, DNI *, Unidad destino, jornada, switch Pre-agendada y botón "Registrar visita") y el panel de contratistas (Empresa *, motivo *, jornada, agendado por, unidad) con sus tablas del día seleccionado.

#### Scenario: Paneles reutilizados sin divergencia de comportamiento
- **WHEN** la vista carga
- **THEN** los paneles SHALL derivar del mismo store que bitácora (colecciones `bitacoraVisitasPE` e `ingresosContratistasPE`) y usar las mismas validaciones y acciones (p. ej. motivo contratista ≥5 chars, nombre+DNI obligatorios, origenAgenda/estado)
- **AND** bitácora SHALL seguir renderizando esos mismos componentes en sus tabs "Visitas" y "Contratistas" sin cambio de comportamiento (suite `bitacora.spec.ts` permanece verde).

#### Scenario: Selector de día y filtrado
- **WHEN** el usuario cambia el selector de día (input date)
- **THEN** las tablas "Control del día seleccionado" e "Ingresos del día" SHALL filtrar por `fecha === diaReporte` igual que en bitácora.

#### Scenario: Skeleton durante hidratación
- **WHEN** `hasHydrated === false`
- **THEN** la vista muestra skeleton (`animate-pulse`) en lugar de los paneles.

#### Scenario: Navegación lateral habilitada
- **WHEN** la vista existe
- **THEN** `/operaciones/accesos` ya no pertenece a `RUTAS_PENDIENTES` en `AppSidebar` y el item "Accesos y Visitas" es navegable sin badge "Próximamente".

#### Scenario: Ruta dedicada distinta de bitácora
- **WHEN** el usuario visita `/operaciones/bitacora` y `/operaciones/accesos`
- **THEN** ambas rutas existen y son distintas (bitácora con tabs vs accesos con layout propio sin tabs de turno).
