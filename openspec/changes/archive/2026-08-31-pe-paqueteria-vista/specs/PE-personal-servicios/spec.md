## ADDED Requirements

### Requirement: Vista Encomiendas — ruta dedicada con panel reutilizado de bitácora
El sistema SHALL proveer la vista `/operaciones/paqueteria` como ruta dedicada "Encomiendas" que renderiza el panel de recepción y retiro de encomiendas reutilizando el componente extraído de `/operaciones/bitacora`, con el mismo modelo de datos y acciones del store (`encomiendasPE`, `saveEncomiendaPE`/`registrarRetiroEncomiendaPE`/`removeEncomiendaPE`), sin cambios de esquema ni bump de `STORE_VERSION`. La recepción SHALL exigir courier del maestro y al menos destinatario o unidad; el retiro SHALL exigir quién retira (validación hard del store) y SHALL ser auditable (`PE_ENCOMIENDA_RECIBIDA`/`RETIRADA`).

#### Scenario: Acceso a la vista Encomiendas
- **WHEN** el usuario navega a `/operaciones/paqueteria`
- **THEN** el sistema muestra el heading "Encomiendas" y descripción de recepción/retiro
- **AND** renderiza el panel de encomiendas (form con Courier / App *, Destinatario, Unidad, Descripción del paquete, Foto evidencia, URL foto, botón "Registrar recepción") y la tabla "Encomiendas del día ({dia})" con sus acciones.

#### Scenario: Panel reutilizado sin divergencia de comportamiento
- **WHEN** la vista carga
- **THEN** el panel SHALL derivar del mismo store que bitácora (colección `encomiendasPE`) y usar las mismas validaciones y acciones (courier obligatorio, destinatario o unidad obligatorio, evidencia URL D1 si presente, retiro requiere retiradoPor no vacío)
- **AND** bitácora SHALL seguir renderizando ese mismo componente en su tab "Encomiendas" sin cambio de comportamiento (suite `bitacora.spec.ts` permanece verde).

#### Scenario: Recepción de encomienda de prueba
- **WHEN** el usuario selecciona un courier del maestro, indica destinatario o unidad, describe "TEST-*" y confirma "Registrar recepción"
- **THEN** la fila aparece en la tabla del día con el courier y estado "Recibida" (Badge), y el store emite `PE_ENCOMIENDA_RECIBIDA`

#### Scenario: Retiro requiere identificación del retirador
- **WHEN** se intenta registrar el retiro de una encomienda recibida sin indicar quién retira
- **THEN** el store retorna `{ok:false}` exigiendo retiradoPor y no muta el estado; con retiradoPor válido la encomienda pasa a "Retirada por {nombre}" y emite `PE_ENCOMIENDA_RETIRADA`

#### Scenario: Encomienda retirada no eliminable (auditable)
- **WHEN** se intenta eliminar una encomienda con `estado === "retirada"`
- **THEN** el store retorna `{ok:false}` y no la elimina (registro auditable preservado)

#### Scenario: Selector de día y filtrado
- **WHEN** el usuario cambia el selector de día (input date)
- **THEN** la tabla "Encomiendas del día ({dia})" SHALL filtrar por `fechaRecepcion === diaReporte` igual que en bitácora.

#### Scenario: Skeleton durante hidratación
- **WHEN** `hasHydrated === false`
- **THEN** la vista muestra skeleton (`animate-pulse`) en lugar del panel.

#### Scenario: Navegación lateral habilitada — RUTAS_PENDIENTES vacío
- **WHEN** la vista existe
- **THEN** `/operaciones/paqueteria` ya no pertenece a `RUTAS_PENDIENTES` en `AppSidebar` y el item "Encomiendas" es navegable sin badge "Próximamente"
- **AND** `RUTAS_PENDIENTES` queda vacío (ninguna ruta pendiente restante).

#### Scenario: Ruta dedicada distinta de bitácora
- **WHEN** el usuario visita `/operaciones/bitacora` y `/operaciones/paqueteria`
- **THEN** ambas rutas existen y son distintas (bitácora con tabs vs paquetería con layout propio sin tabs de turno).
