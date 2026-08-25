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
El sistema SHALL exponer acciones CRUD por entidad (crear, actualizar, eliminar, toggle de activo) como único mecanismo de mutación del estado. Las páginas NO SHALL mutar el estado directamente.

#### Scenario: Edición de una entidad
- **WHEN** una página invoca la acción de actualizar una entidad
- **THEN** el estado global se actualiza y todas las vistas suscritas al store reflejan el cambio.

#### Scenario: Eliminación de una entidad sin vínculos
- **WHEN** se elimina una entidad sin dependencias asociadas
- **THEN** la entidad se remueve del estado y la persistencia se actualiza.

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

El sistema SHALL mantener un manifest de seeds que declare para cada colección `colección ST -> seedFile -> tipo (colección|singleton|vistaDerivada) -> dependsOn -> loadOrder Rank -> count`. El orden canónico es `0=CF/MA`, `1=TU/MP`, `2=EF(macro->micro->unidad)`, `3=VU`, `4=FI/PE/IR/IN`, `5=RA/GE/MT`, `6=CT/PL`, `99=RE/AM`. Toda página que cargue bulk SHALL iterar por rank asc.

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
