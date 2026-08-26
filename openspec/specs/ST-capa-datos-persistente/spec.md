

### Requirement: Colecciones operacionales de PE en el store

El sistema SHALL incluir en `CompassData` las colecciones operacionales de PE: `bitacoraVisitasPE` (controles de visitas con jornada, destino y hora de ingreso sellada), `encomiendasPE` (courier por id de maestro, evidencia D1, retiro), `ingresosContratistasPE` (contratista por id, motivo obligatorio, origen del agendamiento), `proveedoresPE` (catálogo de servicios externos), `mantencionesPreventivasPE` (periodicidad y próxima fecha), `visitasTecnicasPE` (libro de visitas técnicas con supervisor), `cierresTurnoPE` (reportes de cierre con checklist snapshot e historial de cambios inmutable) y `proyeccionesPE` (proyecciones de cobertura/costo enviadas a FI con `liquidacionPLReferencia`), gestionadas mediante acciones repository que retornan `StoreResult`. PE ocupa rank 4 del manifest canónico (`4=FI/PE/IR/IN`) dependiendo de CF/MA (0), TU/MP (1) y EF (2). El bump de versión SHALL ser 21 → 22 con migrate aditivo que siembre los maestros legales/operativos nuevos (`asignacionFamiliar`, `jornadas`, `couriers`, `contratistas`) si están ausentes. La profundización de `datosLaborales` SHALL ser aditiva (campos opcionales) para no invalidar stores persistidos.

#### Scenario: Store persistido v21 migra a v22

- **WHEN** un usuario con estado persistido en versión 21 abre la aplicación
- **THEN** las colecciones operacionales aparecen disponibles y los maestros nuevos quedan sembrados sin pérdida de datos previos

#### Scenario: Validación FK al guardar ficha

- **WHEN** `savePersona` recibe una ficha con `afpId`/`saludId`/`bancoId` que no existe en los maestros
- **THEN** retorna `{ok:false}` con el campo huérfano y no muta la colección `personas`

#### Scenario: Notificación de Cierre de Turno materializada

- **WHEN** `cerrarTurnoPE` registra un reporte válido
- **THEN** `notify()` crea la notificación dirigida a administración con el resumen y la copia al trabajador
- **AND** el evento queda auditado en AM conforme a `ST-capa-datos-persistente` (Centro de Notificaciones Simulado)

#### Scenario: Media por referencia en evidencias

- **WHEN** una encomienda o un cierre con incidencias adjunta evidencia como data-URL/base64
- **THEN** la acción retorna `{ok:false}` citando D1 y no muta el estado
