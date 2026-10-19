# ST-capa-datos-persistente Specification

## Purpose

Capa de datos persistente en el cliente que centraliza el estado del dominio, lo persiste entre recargas y expone acciones CRUD validadas por entidad (patrón repository).

## Requirements

### Requirement: Persistencia entre recargas
El sistema SHALL persistir el estado de todas las entidades del store en localStorage bajo la key `compass-store`, de modo que las modificaciones realizadas en la interfaz sobrevivan a recargas de página.

#### Scenario: Cambio persistido al recargar
- **WHEN** el usuario crea o edita una entidad y luego recarga la página
- **THEN** el estado cargado refleja la última versión guardada, no el seed inicial de los mocks.

### Requirement: Versionado y migración del almacenamiento
El sistema SHALL incluir un número de versión en el almacenamiento persistido y un mecanismo `migrate` que convierta datos de versiones anteriores al formato actual.

#### Scenario: Almacenamiento con versión obsoleta
- **WHEN** el store detecta una versión persistida distinta a la actual
- **THEN** los datos se transforman mediante `migrate` antes de ser usados por la aplicación.

### Requirement: Sembrado inicial desde mocks
El sistema SHALL inicializarse con los datos de los mocks de `apps/web/data/` (tipos de unidad, macro/micro sectores, unidades —incluye 83 estacionamientos como `u-E-*` desde v8—, personas, vínculos, maestros administrativos, maestros de estructura e inventario, y configuración) cuando no exista estado persistido. Desde v8 no existe colección separada `estacionamientos`.

#### Scenario: Primera carga sin almacenamiento
- **WHEN** no existe estado persistido en localStorage
- **THEN** el store se siembra con el seed derivado de los mocks y las vistas muestran los datos esperados.

### Requirement: Colecciones de maestros de estructura e inventario en el store
El sistema SHALL incluir en `MaestroCollections` los maestros de estructura, inventario y vínculos (`estadosOcupacion`, `categoriasMacro`, `categoriasMicro`, `categoriasUnidad` y `estadosInmobiliarios`, sembrados desde `data/maestros.ts` y `data/comunidad/vinculos.ts`) además de los maestros administrativos, de modo que el módulo de Maestros (MA) los gestione con `saveMaestro`/`removeMaestro` y el resto de módulos los lean desde el store. Desde v8 `ubicacionesEstacionamiento` está deprecado (absorbido como microsectores `est-*` en EF).

#### Scenario: Gestión de estados y categorías desde el módulo MA
- **WHEN** el usuario crea o edita un estado de ocupación o una categoría macro/micro/de unidad en `/admin/maestros`
- **THEN** el cambio se persiste en el store y se refleja en las vistas que leen dichas colecciones.

#### Scenario: Categoría de unidad consumida desde el store
- **WHEN** los módulos TU (Tipos de Unidad), EF (Estructura Física) y VU (Vinculación de Unidades) renderizan selectores de categoría o estado inmobiliario (ES absorbido en EF como `unidades` `u-E-*`)
- **THEN** las opciones provienen de `maestros.categoriasUnidad` y `maestros.estadosInmobiliarios` respectivamente (nunca de listas hardcodeadas en la UI; la ubicación de estacionamientos viene de `microSectores` `est-*`)
- **AND** si el usuario crea una categoría/estado nuevo en MA, éste aparece en dichos selectores sin cambios de código.

#### Scenario: Estado nuevo con color asignado
- **WHEN** el usuario crea un nuevo estado de ocupación en MA
- **THEN** el estado recibe un `hex` de la paleta (via `hexDesdeId`) y la dona de distribución lo renderiza con color, no en gris.

### Requirement: Acceso mediante acciones CRUD centralizadas
El sistema SHALL exponer acciones CRUD por entidad (crear, actualizar, eliminar, toggle de activo) como único mecanismo de mutación del estado. Las páginas NO SHALL mutar el estado directamente. Desde el change `store-cleanup` el store legacy `@deprecated` SHALL exponer únicamente los miembros con consumidores vivos (app, QA-Lab, otra acción del store o e2e): las acciones cuyo censo por miembro no registre ningún consumidor SHALL eliminarse de la interface `CompassStore` y de su implementación. La poda NO SHALL alterar el shape persistido: `STORE_VERSION` permanece en 28, los campos de `CompassData` no se tocan y `partialize`, `migrate` y `ESQUEMAS_COLECCION` quedan intactos.

#### Scenario: Edición de una entidad
- **WHEN** una página invoca la acción de actualizar una entidad
- **THEN** el estado global se actualiza y todas las vistas suscritas al store reflejan el cambio.

#### Scenario: Eliminación de una entidad sin vínculos
- **WHEN** se elimina una entidad sin dependencias asociadas
- **THEN** la entidad se remueve del estado y la persistencia se actualiza.

#### Scenario: Acción sin consumidores eliminada del store
- **WHEN** el censo por miembro de `CompassStore` no registra ningún consumidor (app, QA-Lab, otra acción del store ni e2e) para una acción `@deprecated`
- **THEN** la acción se elimina de la interface `CompassStore` y de su implementación, junto con sus tests dedicados
- **AND** `STORE_VERSION` permanece en 28 y ningún campo de `CompassData` cambia.

### Requirement: Validación de integridad al eliminar
El sistema SHALL bloquear la eliminación de entidades con dependencias asociadas, devolviendo el error correspondiente:
- No se puede eliminar un tipo de unidad si existen unidades vinculadas por `tipoUnidadId` (incluye `u-E-*` estacionamientos).
- No se puede eliminar un macro sector si tiene micro sectores asociados.
- No se puede eliminar un micro sector si tiene unidades asociadas.
- No se puede eliminar una unidad (incluye unidad-estacionamiento `u-E-*`) si tiene vínculos de persona asociados (`vinculos.unidadId`).
- No se puede eliminar una persona con vínculos de unidad asociados.
- `removeMaestro` SHALL validar que `estadosOcupacion`, `categoriasUnidad`, `categoriasMacro/Micro`, `estadosInmobiliarios`, `condicionesEspeciales` no estén en uso antes de borrar.
- Nota: regla legacy "unidad con estacionamientos" y "estacionamiento con asignación activa" se subsumen en la regla de unidad+vínculos desde v8.

#### Scenario: Eliminación de un tipo de unidad vinculado
- **WHEN** se intenta eliminar un tipo de unidad que tiene unidades físicas asociadas
- **THEN** la eliminación es rechazada y la entidad permanece en el estado.

#### Scenario: Eliminación de una unidad con vínculos (incluye estacionamientos como unidades)
- **WHEN** se intenta eliminar una unidad (`u-*` o `u-E-*`) que tiene vínculos de persona asociados
- **THEN** la eliminación es rechazada y la entidad permanece en el estado.

#### Scenario: Eliminación de un macro sector con micro sectores
- **WHEN** se intenta eliminar un macro sector que tiene micro sectores asociados
- **THEN** la eliminación es rechazada y la entidad permanece en el estado.

### Requirement: Validación de reglas de negocio al guardar vínculos (VU)
El sistema SHALL validar en `saveVinculo` las reglas de negocio de Vinculación de Unidades antes de persistir, devolviendo `StoreResult` con el error correspondiente si alguna se incumple:
- La persona vinculada DEBE existir en el Maestro de Personas.
- Una persona con `estadoCuenta: "inactiva"` NO SHALL ser vinculable a una unidad.
- NO SHALL existir más de un vínculo activo (sin `fechaFin`) de la misma persona a la misma unidad.
- Los contratos de arriendo (`rol: "arrendatario"`) en la misma unidad NO SHALL solaparse en sus rangos de fechas (`fechaInicio`-`fechaFin`, siendo `fechaFin` ausente un rango abierto).

#### Scenario: Persona inactiva intenta vincularse
- **WHEN** un Administrador intenta vincular una persona inactiva a una unidad
- **THEN** `saveVinculo` rechaza la operación y devuelve el error correspondiente.

#### Scenario: Solapamiento de contratos de arriendo en la misma unidad
- **WHEN** se guarda un vínculo de arrendatario cuyo rango de fechas se solapa con otro contrato de arriendo vigente en la misma unidad
- **THEN** `saveVinculo` rechaza la operación y devuelve el error correspondiente.

### Requirement: Compartición de estado entre módulos
El sistema SHALL usar una única instancia de estado por entidad, de modo que las modificaciones hechas en un módulo (TU, EF) se reflejen en los demás módulos que leen la misma entidad. Los componentes compartidos usados por estos módulos (p. ej. formularios de unidad) también SHALL leer del store global y no de los mocks estáticos. ES se consulta como vista filtrada de `unidades` (`etiqueta=Estacionamiento`) en EF.

#### Scenario: Tipo creado visible en otros módulos
- **WHEN** se crea un tipo de unidad en Tipos de Unidad
- **THEN** Estructura Física (y su vista de estacionamientos `u-E-*`) lee el mismo store y refleja el nuevo tipo.

#### Scenario: Unidad editada reflejada en todos los módulos
- **WHEN** se edita una unidad en Estructura Física (incluye `u-E-*`)
- **THEN** los módulos que referencian esa unidad (Tipos de Unidad, VU) muestran el valor actualizado.

### Requirement: Hidratación segura en renderizado SSR
El sistema SHALL configurar el persist con `skipHydration: true` y rehidratar manualmente mediante `useStoreRehydrated()` (efecto del cliente). Toda página que renderice datos del store SHALL mostrar un esqueleto (skeleton) mientras `hasHydrated` es `false` y montar el contenido real solo tras la hidratación, de modo que el HTML del servidor y el primer render del cliente coincidan y no se produzcan errores de hidratación de React.

#### Scenario: Página del store renderizada en servidor
- **WHEN** el servidor renderiza una página que lee datos del store
- **THEN** el HTML inicial contiene únicamente el esqueleto (no datos del dominio), evitando diferencias con el primer render del cliente.

#### Scenario: Nueva página que consume el store
- **WHEN** se crea una página que lee entidades del store
- **THEN** la página incluye `useStoreRehydrated()`, el guard `hasHydrated` y un skeleton, siguiendo el mismo patrón de las páginas existentes.

### Requirement: Manifest de Seeds y Orden Canónico por Rank

El sistema SHALL mantener un manifest de seeds que declare para cada colección `colección ST -> seedFile -> tipo (colección|singleton|vistaDerivada) -> dependsOn -> loadOrder Rank -> count`. El orden canónico es `0=CF/MA`, `1=TU/MP`, `2=EF(macro->micro->unidad)`, `3=VU`, `4=FI/PE/IR/IN`, `5=RA/GE/MT`, `6=CT/PL`, `99=RE/AM`. Toda página que cargue bulk SHALL iterar por rank asc. `reportesRE` ocupa el rank 99 como sumidero reportería junto a AM.

#### Scenario: Manifest completo para core

| Rank | Colección ST | Seed File | Depende de | Count |
|------|--------------|-----------|------------|-------|
| 0 | `configuracion` | `data/admin/configuracion.ts:49 configuracionDefault` | — | 1 singleton |
| 0 | `maestros.* (14)` | `data/maestros.ts` (categorias/estados) + `data/admin/maestros.ts` (10) + `data/comunidad/vinculos.ts:7 ESTADOS_INMOBILIARIOS` | — | 14 colecciones |
| 1 | `tiposUnidad` | `data/inventario/estructura.ts:50 tiposUnidad` | `maestros.categoriasUnidad` | 5 |
| 1 | `personas` | `data/comunidad/personas.ts:50 personas` | `maestros.condicionesEspeciales` | 54 |
| 2 | `macroSectores` | `data/inventario/estructura.ts:107 macroSectores` | `maestros.categoriasMacro` | 7 |
| 2 | `microSectores` | `data/inventario/estructura.ts:117 microSectores` | `macroSectores + maestros.categoriasMicro` | 23 |
| 2 | `unidades` | `data/inventario/estructura.ts:135 unidades` (83 `u-E-*` + 86 deptos/locales) | `microSectores + tiposUnidad + maestros.estadosOcupacion` | 166 |
| 3 | `vinculos` | `data/comunidad/vinculos.ts:30 vinculos` | `personas + unidades + maestros.estadosInmobiliarios` | 55 |

- **WHEN** `validateSeedOrder` recorre el manifest
- **THEN** verifica DAG acíclico y que cada FK target rank < source rank y que cada id FK existe en colección de rank menor
- **AND** retorna `SeedValidationReport`.

#### Scenario: Colección sin rank declarado
- **WHEN** una spec nueva añade `CompassData.nuevaColeccion` sin rank en manifest
- **THEN** la validación falla hasta asignar rank.

### Requirement: Validación FK en Save (no solo Remove)

Cada `save*` SHALL validar FKs antes de `upsert`, complementando `remove*` que ya valida inverso `ST-capa-datos-persistente:58`:

- `saveMicroSector` SHALL validar `macroSectorId exists`
- `saveUnidad` SHALL validar `microSectorId exists && tipoUnidadId exists && estadoId exists en maestros.estadosOcupacion`
- `savePersona` SHALL validar `condicionesEspecialesIds subset de maestros.condicionesEspeciales`
- `saveVinculo` ya valida `ST-capa-datos-persistente:80` (persona exists, activa, no duplicado, no solape arriendo) y SHALL mantener `cerrarAnterior` para `propietario/arrendatario`
- Futuras `saveCargo/saveReserva/saveInsumo...` SHALL seguir mismo patrón

#### Scenario: saveUnidad con micro huérfano
- **WHEN** `saveUnidad({microSectorId:"no-existe"})`
- **THEN** retorna `{ok:false, error:"microSectorId no existe"}` y no muta `unidades`.

### Requirement: Bulk Seed Transaccional e Idempotente

`seedBulkLoad(manifest)` SHALL cargar por rank asc usando `upsert:115`/`mergeById:464`, ser re-ejecutable sin duplicar y acumular `errores[]` por colección. SHALL abortar el rank con error pero no corromper ranks previos. SHALL emitir eventos por colección.

#### Scenario: Re-ejecución idempotente
- **WHEN** `seedBulkLoad` se ejecuta dos veces con el mismo manifest
- **THEN** el segundo run no duplica registros y retorna `ok:true` con `count` igual.

### Requirement: Evolución Versionada y Limpieza Legacy

Cada spec que agrega colección SHALL exigir bump de `STORE_VERSION` y `migrate` que haga `mergeById` del seed nuevo y limpie keys legacy. Ejemplo canónico `migrate v8:462` que limpia `estacionamientos` y `ubicacionesEstacionamiento` legacy `k0mp4ss_fe/apps/web/lib/store.ts:485`.

#### Scenario: Nueva colección sin migrate
- **WHEN** `CompassData` crece sin bump `STORE_VERSION` ni `migrate`
- **THEN** usuarios con persist previo quedan sin la colección hasta limpiar `localStorage`.

### Requirement: Hidratación Segura como Precondición de Carga UI

Toda página que dispare `save*` en bulk SHALL esperar `hasHydrated:true` `k0mp4ss_fe/apps/web/lib/store.ts:176` via `useStoreRehydrated()`. `seedBulkLoad` invocado desde UI SHALL no-op si `hasHydrated==false`.

#### Scenario: Bulk desde UI sin hidratar
- **WHEN** QA pulsa `Cargar Todo` antes de `hasHydrated`
- **THEN** la carga se pospone y avisa `Almacenamiento aún hidratando`.

### Requirement: Auditoría de Carga (AM)

`AM` SHALL registrar `ST_SEED_STARTED`, `ST_SEED_COLLECTION_LOADED {coleccion, count, rank, duration}`, `ST_SEED_VALIDATION_FAILED {errores}`, `ST_MIGRATE_APPLIED {fromVersion, toVersion}` como eventos inmutables. `RE` SHALL mostrar `tasa huérfanos = dangling FK / total` (0 esperado post-carga).

#### Scenario: Carga bulk auditada
- **WHEN** `seedBulkLoad` termina
- **THEN** `AM` contiene un evento por colección cargada con `valorCuantificable:count`.

### Requirement: Media por Referencia (Sin Payload Binario)
El store MUST NOT persistir contenido binario (base64, Blob, ArrayBuffer) de adjuntos ni imágenes. Todo adjunto o media (evidencias de IN, facturas de MT, imágenes de CV) MUST guardarse únicamente como metadatos: nombre, tipo MIME, tamaño en KB y URL/referencia externa.

#### Scenario: Guardar Adjunto por Referencia
- **WHEN** un módulo registra un adjunto (ej. factura de MT)
- **THEN** el store guarda solo los metadatos del archivo (nombre, tipo, tamañoKB, url)
- **AND** el payload binario jamás entra al store ni a localStorage

#### Scenario: Intento de Carga Base64
- **WHEN** una acción recibe un payload con contenido base64/Blob en lugar de una URL/referencia
- **THEN** la acción retorna `StoreResult` con error y no muta el estado

#### Scenario: Imágenes del Visor de Mensajes (CV)
- **WHEN** se crea un aviso con imagen para el carrusel
- **THEN** el aviso referencia una URL remota (placeholder o CDN) y no datos embebidos

### Requirement: Centro de Notificaciones Simulado
El store MUST mantener una colección `notificaciones` y exponer una acción centralizada `notify()` que registre notificaciones in-app (destinatario, asunto, cuerpo, canal simulado, fecha, módulo origen). El envío real por correo queda fuera de alcance; la interfaz MUST ser sustituible por un backend real sin cambiar a los consumidores.

#### Scenario: Notificación de Cierre de Turno (PE)
- **WHEN** se envía un reporte de cierre de turno
- **THEN** `notify()` crea una notificación dirigida a la administración con el resumen del evento
- **AND** el evento queda auditado en AM

#### Scenario: Bandeja Visible
- **WHEN** cualquier usuario consulta su centro de notificaciones
- **THEN** ve las notificaciones dirigidas a su rol/persona con estado leído/no leído
- **AND** puede marcarlas como leídas mediante acción del store

#### Scenario: Publicación de Acta (GD) y Cobranza (CO/FI)
- **WHEN** un flujo declara "notificación por correo" en su especificación NSGC
- **THEN** el sistema lo materializa como registro en la bandeja simulada con canal `email_simulado`

### Requirement: Colecciones financieras de FI en el store
El sistema SHALL incluir en `CompassData` las colecciones `fondosFI` (maestro de fondos con tipo y porcentajeAporte, sembrado con los 3 fondos NSGC), `egresosFI`, `emisionesGC` y `cobrosFI` (libro unificado de cargos con moras[], pagos[] y diferencias[] inmutables), gestionadas mediante acciones repository que retornan `StoreResult`. FI ocupa rank 4 del manifest canónico (`4=FI/PE/IR/IN`) dependiendo de CF/MA (0), TU/MP (1), EF (2) y VU (3). El bump de versión SHALL ser 20 → 21 con migrate aditivo que siembre `fondosFI` si está ausente.

#### Scenario: Store persistido v20 migra a v21
- **WHEN** un usuario con estado persistido en versión 20 abre la aplicación
- **THEN** las colecciones financieras aparecen disponibles (`fondosFI` sembrado) sin pérdida de datos previos

#### Scenario: Integridad referencial financiera
- **WHEN** se intenta eliminar un fondo con egresos o cobros imputados
- **THEN** la acción retorna `{ok:false}` y el fondo permanece

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

### Requirement: Colecciones de remuneraciones de PL en el store
El sistema SHALL incluir en `CompassData` las colecciones `liquidacionesPL` (snapshot inmutable de líneas calculadas, totales de control y referencias a FI/proyección PE) y `adelantosPL` (monto con glosa obligatoria, folio ADE, ciclo pendiente→descontado), gestionadas mediante acciones repository que retornan `StoreResult`. PL ocupa el rank 6 del manifest canónico (`6=CT/PL`) dependiendo de MP/PE (1/4), MA (0), CF (0) y FI (4). El bump de versión SHALL ser 22 → 23 con migrate aditivo (colecciones vacías). La extensión de `ExtensionLaboralSchema.sueldoBase` y los parámetros legales de CF SHALL ser opcionales para no invalidar stores persistidos. Desde el change `store-cleanup` la generación, confirmación y borrado de liquidaciones ya no viven en el store (sus acciones cliente se podaron por no tener consumidores): se ejecutan server-side en `app/api/liquidaciones/**`, que valida las mismas FKs legales del trabajador contra los maestros. El store conserva las colecciones y las acciones de `adelantosPL`.

#### Scenario: Escritura valida FKs del trabajador
- **WHEN** la escritura de una liquidación (`POST`/`PUT` en `app/api/liquidaciones/**`, con la regla espejo de la ex acción de store) recibe un trabajador sin ficha laboral o con FK legal huérfana
- **THEN** la operación retorna error citando la causa y no muta `liquidacionesPL`

#### Scenario: Migración aditiva v22→v23
- **WHEN** un store persistido en versión 22 se rehidrata
- **THEN** `liquidacionesPL` y `adelantosPL` quedan disponibles vacías y ningún dato previo cambia

### Requirement: Auditoría CF_UPDATE_PARAM de parámetros legales

El sistema SHALL emitir el evento `CF_UPDATE_PARAM` cuando cambien los parámetros legales de remuneraciones (`ufMensual`, `ingresoMinimoMensual`, `topeGratificacionLegal`, `tasaSIS`), incluyendo old/new conforme a `CF-configuracion-global`. El emisor es server-side: `PUT /api/configuracion` (`app/api/configuracion/route.ts`) registra el evento con categoría `CF`, referencia a la fila de configuración y la descripción con el valor anterior y el nuevo de cada parámetro modificado. La emisión es por delta real: un `PUT` que no toca esos cuatro campos, o que los reenvía sin cambio de valor, no emite el evento.

#### Scenario: Cambio de UF mensual auditado

- **WHEN** la administración actualiza `ufMensual` y guarda la configuración
- **THEN** AM registra `CF_UPDATE_PARAM` con el valor anterior y nuevo

#### Scenario: Guardado sin cambio de parámetros legales

- **WHEN** la administración guarda la configuración sin modificar los cuatro parámetros legales
- **THEN** AM no registra `CF_UPDATE_PARAM`

### Requirement: Colección de certificados CT en el store

El sistema SHALL incluir en `CompassData` la colección `certificadosCT` (folio, código de verificación único, tipología, snapshot del payload emitido, referencia a fuente y a la firma usada), gestionada mediante acciones repository que retornan `StoreResult`. CT ocupa el rank 6 del manifest canónico (`6=CT/PL`) dependiendo de MP/VU (1/3), FI (4), PL (6) y CF (0). El bump de versión SHALL ser 23 → 24 con migrate aditivo (colección vacía). La firma digitalizada se persiste SOLO por referencia (D1): el binario del PDF y la imagen de firma jamás entran al store.

#### Scenario: Escritura valida FKs por tipología

- **WHEN** `generarCertificadoCT` recibe una unidad o liquidación inexistente para la tipología pedida
- **THEN** retorna `{ok:false}` citando la FK y no muta `certificadosCT`

#### Scenario: Media por referencia en firma

- **WHEN** un intento de emisión adjunta la firma como data-URL/base64
- **THEN** la acción retorna `{ok:false}` citando D1 y no muta el estado

### Requirement: Colección de reportería RE en el store

El sistema SHALL incluir en `CompassData` la colección `reportesRE` (título, bloques snapshot inmutables, segmento declarado EF+MP+tenencia, destinatarios resueltos y contador de distribución), gestionada mediante acciones repository que retornan `StoreResult`. RE ocupa el rank 99 del manifest canónico (`99=RE/AM`) como sumidero dependiente de todos los módulos. El bump de versión SHALL ser 24 → 25 con migrate aditivo (colección vacía).

#### Scenario: Escritura valida segmento

- **WHEN** `generarReporteRE` recibe un segmento con macro/micro/unidad inexistente
- **THEN** retorna `{ok:false}` citando la FK huérfana y no muta `reportesRE`

#### Scenario: Rehidratación v24→v25

- **WHEN** un store persistido en versión 24 se rehidrata
- **THEN** `reportesRE` queda disponible vacía y ningún dato previo cambia

### Requirement: Evolución a repositorios server-side con scoping por comunidad (C1b)
El sistema SHALL exponer repositorios server-side en `k0mp4ss_fe/apps/web/lib/repos/` con factory obligatorio `crearRepositorio(comunidadId: string)` que scopée TODA operación por `comunidadId` (D3 tenant compartido). Ningún método SHALL exponer query sin `where: { comunidadId }`. El store cliente en `lib/store.ts` permanece en v25 sin cambios en esta ventana; los repositorios existen server-side listos para ser consumidos por P4/P5. La evolución queda documentada como parte de ST.

#### Scenario: Factory exige comunidadId
- **WHEN** se invoca `crearRepositorio("")` o se intenta query sin scope
- **THEN** lanza error y no ejecuta la query.

#### Scenario: Repositorio scoped por comunidadId
- **WHEN** `repoA = crearRepositorio(comunidadA)` crea una entidad y `repoB = crearRepositorio(comunidadB)` intenta leerla por id
- **THEN** `repoB.findById(id)` retorna `null` y `repoB.findMany()` no lista la entidad de A.

### Requirement: Modelo Prisma con comunidadId indexado (C1)
El sistema SHALL mantener `k0mp4ss_fe/apps/web/prisma/schema.prisma` con provider `sqlite` en dev y `DATABASE_URL` en env, que modele TODA entidad de dominio derivada de `CompassData` (store v25) y `lib/schemas.ts` (incluye estructura, comunidad, portal, notificaciones, controles, actas, CO/GE/IR/IN/MT/RA/CV/FI/PE/PL/CT/RE, eventos, configuración y los 20 maestros MA). Toda entidad SHALL llevar `comunidadId String` con `@@index([comunidadId])` y relación `comunidad Comunidad @relation(fields:[comunidadId], references:[id], onDelete:Cascade)`. `prisma migrate dev` y `prisma generate` SHALL correr limpio y `prisma/migrations` SHALL estar commiteada. El esquema SHALL incluir además el campo `saldoInicial Float?` en el modelo `FondoFI` y el modelo `IngresoFI` (id, comunidadId, fondoId, fecha, monto, concepto, familia opcional, createdAt) con `@@index([comunidadId])` y `@@index([fondoId])`, alineados con `FondoFISchema` e `IngresoFISchema` de `lib/schemas.ts`.

#### Scenario: Migración inicial limpia
- **WHEN** se ejecuta `prisma migrate dev --name init` con `DATABASE_URL=file:./dev.db`
- **THEN** la migración se aplica sin errores y el cliente se genera.

#### Scenario: Toda entidad tiene comunidadId indexado
- **WHEN** se inspecciona `schema.prisma`
- **THEN** cada `model` de dominio (excepto `Comunidad` raíz) declara `comunidadId String` y `@@index([comunidadId])`.

#### Scenario: IngresoFI y saldoInicial presentes en el esquema
- **WHEN** se inspecciona `schema.prisma` tras la migración
- **THEN** `FondoFI` declara `saldoInicial Float?` y existe el modelo `IngresoFI` con comunidadId indexado, fondoId indexado y FK a Comunidad con cascade

### Requirement: Constraints de unicidad compuesta opcionales (C3b)
El sistema MAY definir constraints de unicidad compuesta `@@unique([comunidadId, campo])` tabla por tabla según decisión D5 (repetidos permitidos en la app, BD decide). Cada constraint añadida SHALL estar documentada en `design.md` con justificación; las tablas sin constraint SHALL estar documentadas como decisión explícita de no-constraint.

#### Scenario: Constraint documentada con justificación
- **WHEN** `TipoUnidad` declara `@@unique([comunidadId, nombre])`
- **THEN** `design.md` explica que evita duplicar nombre por comunidad sin afectar global y que cross-comunidad con mismo nombre sigue permitido.

#### Scenario: No-constraint documentada
- **WHEN** `Unidad` no declara `@@unique([comunidadId, numero])`
- **THEN** `design.md` explica que se omite para no romper D5 (número repetible en distintos microsectores).

### Requirement: Colección ingresosFI y campo saldoInicial en FondoFI
El sistema SHALL incluir en `CompassData` la colección `ingresosFI: IngresoFI[]` (transaccional, seed vacío, rank 4 junto a FI) y SHALL extender `FondoFISchema` con `saldoInicial?: number` opcional (no negativo, default 0 en migración). Ambas SHALL validarse por zod en `ESQUEMAS_COLECCION`, persistirse en `partialize` y sanearse en `sanitizarColecciones`/`onRehydrateStorage`.

#### Scenario: Colección ingresosFI disponible tras migración
- **WHEN** un store persistido en versión 26 se rehidrata en 27
- **THEN** `ingresosFI` existe como array vacío (si no existía) y ningún dato previo se pierde

#### Scenario: Fondo con saldoInicial validado
- **WHEN** se persiste un fondo con `saldoInicial` 50000
- **THEN** `FondoFISchema.safeParse` lo acepta y el valor sobrevive a rehidratación

### Requirement: Migración STORE_VERSION 26 → 27
El sistema SHALL bump `STORE_VERSION` a 27 y proveer `migrate` aditivo `v26→v27` que asegure `ingresosFI: []` si ausente y preserve `saldoInicial` de fondos existentes (sin cargar datos históricos aún; la carga es P2). La migración SHALL ser idempotente (re-correr no duplica).

#### Scenario: Migración idempotente v26→v27
- **WHEN** `migrate(persistedV26, 26)` se ejecuta dos veces sobre el mismo persistido
- **THEN** ambas ejecuciones dejan `ingresosFI: []` y fondos intactos sin duplicar

### Requirement: Seed authz con orden de membresías determinista (scope A)
El seed de autorización SHALL dejar el scope del admin en `comunidad-a` en cada
corrida, sin pasos manuales: tras el upsert idempotente de membresías, SHALL
reescribir `createdAt` en orden canónico (timestamps escalonados, admin-a
ÚLTIMA) de modo que `withComunidadScope` (`orderBy createdAt desc, id desc`,
`take: 1`) resuelva `comunidad-a`. El orden canónico (`comunidad-b` del admin
primero, admin-a última) SHALL estar documentado en el propio seed y coincidir
con `cuentas-funcionales.md §3.4`. El espejo `lib/seed-authz.ts` (QA-Lab) SHALL
mantener el mismo orden y el mismo contrato.

#### Scenario: Reseed reproducible deja scope A
- **WHEN** se restaura el backup P3 y se corre `npm run seed:authz` +
  `npm run seed:mocks -- --comunidad-id=comunidad-a`
- **THEN** el scope del admin es `comunidad-a` sin borrar/recrear membresías a mano.

#### Scenario: Re-corridas idempotentes conservan el orden
- **WHEN** se corre `npm run seed:authz` dos veces seguidas
- **THEN** el scope del admin sigue siendo `comunidad-a` y no se duplican membresías.
