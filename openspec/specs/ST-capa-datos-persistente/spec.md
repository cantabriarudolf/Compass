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
El sistema SHALL inicializarse con los datos de los mocks de `apps/web/data/` (tipos de unidad, macro/micro sectores, unidades, estacionamientos, personas, vínculos, maestros administrativos, maestros de estructura e inventario, y configuración) cuando no exista estado persistido.

#### Scenario: Primera carga sin almacenamiento
- **WHEN** no existe estado persistido en localStorage
- **THEN** el store se siembra con el seed derivado de los mocks y las vistas muestran los datos esperados.

### Requirement: Colecciones de maestros de estructura e inventario en el store
El sistema SHALL incluir en `MaestroCollections` los maestros de estructura e inventario (`estadosOcupacion`, `categoriasMacro` y `categoriasMicro`, sembrados desde `data/maestros.ts`) además de los maestros administrativos, de modo que el módulo de Maestros (MA) los gestione con `saveMaestro`/`removeMaestro` y el resto de módulos los lean desde el store.

#### Scenario: Gestión de estados y categorías desde el módulo MA
- **WHEN** el usuario crea o edita un estado de ocupación o una categoría macro/micro en `/admin/maestros`
- **THEN** el cambio se persiste en el store y se refleja en las vistas que leen dichas colecciones.

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
- No se puede eliminar un tipo de unidad si existen unidades vinculadas por `tipoUnidadId`.
- No se puede eliminar un macro sector si tiene micro sectores asociados.
- No se puede eliminar un micro sector si tiene unidades asociadas.
- No se puede eliminar una unidad si tiene estacionamientos o vínculos de persona asociados.
- No se puede eliminar un estacionamiento con historial de asignaciones activo.
- No se puede eliminar una persona con vínculos de unidad asociados.

#### Scenario: Eliminación de un tipo de unidad vinculado
- **WHEN** se intenta eliminar un tipo de unidad que tiene unidades físicas asociadas
- **THEN** la eliminación es rechazada y la entidad permanece en el estado.

#### Scenario: Eliminación de una unidad con estacionamientos o vínculos
- **WHEN** se intenta eliminar una unidad que tiene estacionamientos o vínculos de persona asociados
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
El sistema SHALL usar una única instancia de estado por entidad, de modo que las modificaciones hechas en un módulo (TU, EF, ES) se reflejen en los demás módulos que leen la misma entidad. Los componentes compartidos usados por estos módulos (p. ej. formularios de unidad y estacionamiento) también SHALL leer del store global y no de los mocks estáticos.

#### Scenario: Tipo creado visible en otros módulos
- **WHEN** se crea un tipo de unidad en Tipos de Unidad
- **THEN** Estructura Física y Estacionamientos leen el mismo store y reflejan el nuevo tipo.

#### Scenario: Unidad editada reflejada en todos los módulos
- **WHEN** se edita una unidad en Estructura Física
- **THEN** los módulos que referencian esa unidad (Tipos de Unidad, Estacionamientos) muestran el valor actualizado.

### Requirement: Hidratación segura en renderizado SSR
El sistema SHALL configurar el persist con `skipHydration: true` y rehidratar manualmente mediante `useStoreRehydrated()` (efecto del cliente). Toda página que renderice datos del store SHALL mostrar un esqueleto (skeleton) mientras `hasHydrated` es `false` y montar el contenido real solo tras la hidratación, de modo que el HTML del servidor y el primer render del cliente coincidan y no se produzcan errores de hidratación de React.

#### Scenario: Página del store renderizada en servidor
- **WHEN** el servidor renderiza una página que lee datos del store
- **THEN** el HTML inicial contiene únicamente el esqueleto (no datos del dominio), evitando diferencias con el primer render del cliente.

#### Scenario: Nueva página que consume el store
- **WHEN** se crea una página que lee entidades del store
- **THEN** la página incluye `useStoreRehydrated()`, el guard `hasHydrated` y un skeleton, siguiendo el mismo patrón de las páginas existentes.