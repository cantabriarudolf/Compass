# MA-maestros-administrativos Specification

## Purpose
Gestionar las tablas de referencia (maestros) que alimentan la lógica de los demás módulos: etiquetas de estructura e inventario, estados de ocupación, parámetros de personas, finanzas e insumos. Fuente de verdad: `Data/NSGC/docs/especificaciones/MA - Maestros Administrativos.md`.

## Requirements

### Requirement: Colecciones en la capa de datos (ST)
Todos los maestros administrables por este módulo SHALL vivir en `MaestroCollections` del store global, sembrados desde `apps/web/data/`, y SHALL gestionarse exclusivamente con `saveMaestro`/`removeMaestro`.

#### Scenario: Colección nueva en el store
- **WHEN** el módulo MA incorpora un maestro nuevo
- **THEN** la colección se declara en `MaestroCollections` con su seed en `data/`
- **AND** si el estado persistido de versiones anteriores no la incluye, `STORE_VERSION` sube y `migrate` la inyecta desde el seed

### Requirement: Categorías de Estructura e Inventario
El sistema SHALL administrar en `/admin/maestros` las categorías de estructura e inventario:
- **Categorías Macro Sectores** (`categoriasMacro`): Torre, Manzana, Etapa, etc. — definen los tipos de Macro-Sectores que alimentan EF al crear macro-sectores.
- **Categorías Micro Sectores** (`categoriasMicro`): Piso, Nivel, Pasaje, etc. — definen los tipos de Micro-Sectores que alimentan EF al crear micro-sectores.
- **Categorías de Unidad** (`categoriasUnidad`): Depto, Casa, Local, Oficina, Bodega, Estacionamiento — alimentan el campo Categoría de TU y la etiqueta de las unidades en EF.
- **Estados de Ocupación** (`estadosOcupacion`): con badge de color canónico y `hex` derivado para la dona de distribución.
- **Ubicaciones de Estacionamiento** (`ubicacionesEstacionamiento`): deprecado en v8 — absorbido como microsectores `est-*` en EF (ver `ST-capa-datos-persistente`). No crear esta colección en implementaciones nuevas.
- **Estados Inmobiliarios** (`estadosInmobiliarios`): Habitada, Próxima Vacancia, En Arriendo, Arrendada, En Venta — alimentan el campo **Estado Ocupación Propiedad** del módulo VU.

#### Scenario: Categoría de unidad consumida por TU
- **WHEN** el admin crea una categoría de unidad nueva en MA
- **THEN** aparece en el selector de Categoría del formulario de Tipos de Unidad (TU) y en las vistas de Estructura Física (EF) sin cambios de código

#### Scenario: Categorías definen tipos, no sectores reales
- **WHEN** se crea una categoría en MA
- **THEN** NO se crean sectores ni unidades reales: la categoría define un tipo de sector, y el sector concreto se crea en EF usando esa categoría

### Requirement: Selección de Badge Visual con paleta canónica
Los maestros con color visual (Estados de Ocupación, Estados Inmobiliarios, Condiciones Especiales) SHALL ofrecer la paleta canónica `BADGE_OPTIONS` mediante un selector de muestra visual. NO SHALL permitir escribir clases Tailwind manualmente, y los valores legacy SHALL normalizarse con `normalizeBadgeColor`.

#### Scenario: Selector de paleta
- **WHEN** el admin crea un estado de ocupación con color
- **THEN** el selector MUST mostrar la paleta `BADGE_OPTIONS` con preview visual
- **AND** el valor guardado MUST ser un id de la paleta, no una clase Tailwind libre

### Requirement: Gestión con patrón repository
Las páginas SHALL mutar los maestros únicamente mediante `saveMaestro(key, item)` y `removeMaestro(key, id)` del store. NO SHALL existir listas hardcodeadas de opciones en la UI de módulos consumidores.

#### Scenario: Select alimentado desde el store
- **WHEN** un formulario de otro módulo muestra opciones de un maestro (categorías, estados, condiciones)
- **THEN** las opciones se leen de `maestros.*` del store

### Requirement: Integración con Auditoría y Métricas (AM)
Todo cambio sobre un maestro de referencia SHALL quedar trazado, ya que impacta la lógica de múltiples módulos.

#### Scenario: Eventos de maestro
- **WHEN** el admin crea, edita o elimina un registro de maestro
- **THEN** el sistema MUST emitir los eventos `MA_MAESTRO_CREATE`, `MA_MAESTRO_UPDATE`, `MA_MAESTRO_DELETE`

### Requirement: Dependencias de Carga y Seed (ST) - MA como raíz Rank 0

MA es raíz `rank 0` sin `dependsOn`. Entidades `MaestroCollections` `k0mp4ss_fe/apps/web/lib/store.ts:57` viven en `0=MA`: `maestros.*` (14 colecciones). Seed dual: `data/maestros.ts:6` (`categoriasMacro/Micro/Unidad`, `estadosOcupacion`) + `data/admin/maestros.ts:12` (`afps, previsionesSalud, mutualesCajas, feriados, bancos, indicesAjuste, cajasFondos, categoriasInsumos, unidadesMedida, contactosEmergencia, condicionesEspeciales`) + `data/comunidad/vinculos.ts:7` (`estadosInmobiliarios`). `saveMaestro/removeMaestro` `k0mp4ss_fe/apps/web/lib/store.ts:342` son único mutador. `removeMaestro` ya valida inverso por `ST:64`; `saveMaestro` SHALL ser idempotente via `upsert`.

#### Scenario: Seed MA incompleto
- **WHEN** `MaestroCollections` gana nueva colección sin seed ni bump `STORE_VERSION`
- **THEN** `validateSeedOrder` falla y `migrate` debe hacer `mergeById`.

#### Scenario: Carga TU/EF sin MA previa
- **WHEN** QA intenta cargar `tiposUnidad` antes que `maestros.categoriasUnidad`
- **THEN** `saveTipo` debe fallar si se añade validación FK, o al menos `validateSeedOrder` lo reporta.

### Requirement: Eventos AM de Carga de Maestros

Cada `saveMaestro/removeMaestro` SHALL emitir `MA_MAESTRO_CREATE/UPDATE/DELETE` `openspec/specs/AM-auditoria-metricas/spec.md:33` y la carga bulk SHALL emitir `MA_SEED_LOADED {coleccion, count}`.

#### Scenario: Bulk MA auditado
- **WHEN** `seedBulkLoad` carga `maestros.estadosOcupacion` (5 registros)
- **THEN** `AM` registra `MA_SEED_LOADED` con `valorCuantificable:5`.

### Requirement: Maestros Previsionales y Legales (PL)
Los Maestros Administrativos MUST gestionar las colecciones `afp` (nombre, tasa), `salud` (Fonasa tasa fija / Isapre con valor UF o %) y `asignacionFamiliar` (tramos por carga con monto), con patrón repository (`saveMaestroLegal`/`removeMaestroLegal` retornando `StoreResult` o su equivalente `saveMaestro`/`removeMaestro` sobre esas claves), validación referencial al eliminar (bloqueadas mientras fichas PE las referencien) y seed por defecto cargable que incluye los tramos vigentes de asignación familiar.

#### Scenario: CRUD con Patrón Repository
- **WHEN** la administración crea, edita o elimina un registro de AFP, salud o tramo de asignación familiar
- **THEN** la operación pasa por acciones del store con validación referencial
- **AND** las fichas de trabajadores (PE) referencian estas colecciones por id, nunca por texto libre

#### Scenario: Seed Inicial
- **WHEN** se ejecuta la carga técnica de seeds ordenada por Rank
- **THEN** las tres colecciones se siembran con registros por defecto (AFP principales, Fonasa/Isapre genérica, tramos vigentes de asignación familiar)
- **AND** su carga genera eventos AM conforme al orden canónico definido en ST

#### Scenario: Tramo de asignación familiar en uso no eliminable
- **WHEN** se intenta eliminar un tramo referenciado por una ficha de trabajador con cargas
- **THEN** la acción retorna `{ok:false}` citando las fichas asociadas

## ADDED Requirements

### Requirement: Maestros Operativos de Personal (PE)
El sistema SHALL mantener los maestros operativos que normalizan la bitácora de conserjería: `jornadas` (Mañana/Tarde/Noche, usado por visitas, contratistas y cierre de turno), `couriers` (empresas de encomiendas/delivery para evitar escritura libre) y `contratistas` (empresas concurrentes o servicios autorizados), sembrados con los valores NSGC base, gestionados con el patrón repository existente (`saveMaestro`/`removeMaestro`) y consumidos por PE mediante id. `removeMaestro` SHALL bloquear la eliminación de jornadas, couriers o contratistas en uso por registros operativos.

#### Scenario: Courier normalizado en encomiendas
- **WHEN** se registra una encomienda seleccionando un courier del maestro
- **THEN** la encomienda guarda el id del maestro y el catálogo crece sin cambios de código

#### Scenario: Contratista en uso no eliminable
- **WHEN** se intenta eliminar un contratista con ingresos registrados en la bitácora
- **THEN** retorna `{ok:false}` citando los registros asociados

#### Scenario: Jornada del maestro en cierre de turno
- **WHEN** el conserje reporta el cierre indicando una jornada del maestro
- **THEN** el checklist de instalaciones se genera según esa jornada reportada
